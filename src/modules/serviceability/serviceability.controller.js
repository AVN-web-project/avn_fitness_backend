import { Pincode } from '../../models/pincode.model.js';
import { ServiceabilityRule } from '../../models/serviceabilityRule.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, LOG_DOMAINS } from '../../config/constants.js';

/**
 * When no rule matches at any level.
 *
 * `false` = allowlist model: nothing is serviceable until you switch it on. Safer, and it is what
 * "own delivery, selected coverage" means. Flip this single constant to run a blocklist instead.
 */
export const DEFAULT_SERVICEABLE = false;

const normalise = (value) => String(value ?? '').trim();
const normalisePincode = (value) => normalise(value).replace(/\s+/g, '');

/**
 * Resolve serviceability for an address.
 *
 * Walks pincode → city → state → default and stops at the first rule that exists. Fields the
 * matching rule leaves null are filled from the next broader rule, so a pincode rule can override
 * just `isActive` and still inherit the city's ETA.
 *
 * Returns the decision plus which rule decided it — that `matchedRule` is what makes support
 * questions answerable ("why is 400050 blocked?").
 */
export const resolveServiceability = async ({ pincode, city, state }) => {
  const pin = normalisePincode(pincode);

  // The master is the authority on city/state for a pincode; whatever the customer typed is only
  // a fallback. This is what stops "pincode 400050, city Pune" from matching a Pune rule.
  const master = pin ? await Pincode.findOne({ pincode: pin }).lean() : null;

  const effectiveCity = normalise(master?.city || city);
  const effectiveState = normalise(master?.state || state).toUpperCase();

  const candidates = [
    { level: 'pincode', value: pin },
    { level: 'city', value: effectiveCity },
    { level: 'state', value: effectiveState },
    { level: 'default', value: '' },
  ].filter((c) => c.level === 'default' || c.value);

  const rules = await ServiceabilityRule.find({
    $or: candidates.map((c) => ({ level: c.level, value: c.value })),
  }).lean();

  const byKey = new Map(rules.map((r) => [`${r.level}:${r.value}`, r]));

  // Collect matches in specificity order; merge their non-null fields.
  const matched = [];
  for (const candidate of candidates) {
    const rule = byKey.get(`${candidate.level}:${candidate.value}`);
    if (rule) matched.push(rule);
  }

  const pick = (field) => {
    for (const rule of matched) {
      if (rule[field] !== null && rule[field] !== undefined) return rule[field];
    }
    return null;
  };

  const serviceable = pick('isActive');
  const codAvailable = pick('codAvailable');
  const etaDays = pick('etaDays');
  const matchedRule = matched[0] || null;

  return {
    pincode: pin,
    serviceable: serviceable === null ? DEFAULT_SERVICEABLE : serviceable,
    codAvailable: codAvailable === null ? false : codAvailable,
    etaDays: etaDays === null ? null : etaDays,
    city: master?.city || effectiveCity || '',
    state: master?.state || effectiveState || '',
    district: master?.district || '',
    knownPincode: Boolean(master),
    hasDelivery: master ? master.hasDelivery : null,
    matchedRule: matchedRule
      ? { level: matchedRule.level, value: matchedRule.value, label: matchedRule.label || '' }
      : null,
  };
};

/**
 * GET /serviceability/check?pincode=400050
 * Public — the storefront calls this from the address form and the product page.
 */
export const checkServiceability = asyncHandler(async (req, res) => {
  const pincode = normalisePincode(req.query.pincode);

  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    throw ApiError.badRequest('Enter a valid 6-digit pincode.');
  }

  const result = await resolveServiceability({
    pincode,
    city: req.query.city,
    state: req.query.state,
  });

  return ApiResponse.success(res, result, 'Serviceability checked');
});

/**
 * GET /serviceability/locations?state=&district=&q=
 *
 * One endpoint, three shapes — the cascading State → District → Pincode picker:
 *
 *   no params              → states, with district and pincode counts
 *   ?state=MAHARASHTRA     → districts in that state, with pincode counts
 *   ?state=…&district=…    → the pincodes in that district (searchable with ?q=)
 *
 * Reading the hierarchy from the master rather than asking staff to type it is the whole point:
 * a hand-typed "Mumbai Suburban" that differs by one character silently matches nothing, and the
 * rule looks active while every lookup falls through to the default.
 */
/** Attach the rule (if any) that sits on each child, so the tree table can render its toggle. */
const attachRules = async (level, values) => {
  if (!values.length) return new Map();
  const rules = await ServiceabilityRule.find({ level, value: { $in: values } }).lean();
  return new Map(rules.map((r) => [r.value, r]));
};

export const listLocations = asyncHandler(async (req, res) => {
  const state = normalise(req.query.state).toUpperCase();
  const district = normalise(req.query.district);
  const q = normalise(req.query.q);

  // Level 3: pincodes within a district
  if (state && district) {
    const filter = { state, city: district };
    if (q) filter.pincode = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

    const pincodes = await Pincode.find(filter)
      .select('pincode hasDelivery officeCount -_id')
      .sort({ pincode: 1 })
      .limit(2000)
      .lean();

    const ruleByPin = await attachRules('pincode', pincodes.map((p) => p.pincode));

    return ApiResponse.success(
      res,
      {
        state,
        district,
        pincodes: pincodes.map((p) => ({ ...p, rule: ruleByPin.get(p.pincode) || null })),
        total: pincodes.length,
      },
      'Pincodes retrieved'
    );
  }

  // Level 2b: which pincodes in this state are actually live?
  //   ?state=MAHARASHTRA&active=1
  // Includes pincodes with their own active rule AND those covered by an active city rule, with
  // `via` saying which — otherwise "active" would look smaller than what checkout actually allows.
  if (state && req.query.active === '1' && !district) {
    // An active STATE rule makes every pincode in the state live. Without this branch the list
    // stayed empty after switching a whole state on — the one case where the answer is "all of
    // them" was the one case not covered.
    const stateRule = await ServiceabilityRule.findOne({
      level: 'state',
      value: state,
      isActive: true,
    }).lean();

    if (stateRule) {
      const allPins = await Pincode.find({ state })
        .select('pincode city hasDelivery -_id')
        .sort({ pincode: 1 })
        .limit(2000)
        .lean();

      return ApiResponse.success(
        res,
        {
          state,
          via: 'state',
          pincodes: allPins.map((d) => ({
            pincode: d.pincode,
            district: d.city,
            hasDelivery: d.hasDelivery,
            via: 'state',
          })),
          total: allPins.length,
        },
        'Active pincodes retrieved'
      );
    }

    const [pinRules, cityRules] = await Promise.all([
      ServiceabilityRule.find({ level: 'pincode', isActive: true }).select('value -_id').lean(),
      ServiceabilityRule.find({ level: 'city', isActive: true }).select('value -_id').lean(),
    ]);

    const pinValues = pinRules.map((r) => r.value);
    const cityValues = cityRules.map((r) => r.value);

    const docs =
      pinValues.length || cityValues.length
        ? await Pincode.find({
            state,
            $or: [{ pincode: { $in: pinValues } }, { city: { $in: cityValues } }],
          })
            .select('pincode city hasDelivery -_id')
            .sort({ pincode: 1 })
            .limit(2000)
            .lean()
        : [];

    const pinSet = new Set(pinValues);

    return ApiResponse.success(
      res,
      {
        state,
        pincodes: docs.map((d) => ({
          pincode: d.pincode,
          district: d.city,
          hasDelivery: d.hasDelivery,
          via: pinSet.has(d.pincode) ? 'pincode' : 'city',
        })),
        total: docs.length,
      },
      'Active pincodes retrieved'
    );
  }

  // Level 2: districts within a state
  if (state) {
    const districts = await Pincode.aggregate([
      { $match: { state } },
      { $group: { _id: '$city', pincodes: { $sum: 1 } } },
      { $project: { _id: 0, district: '$_id', pincodes: 1 } },
      { $sort: { district: 1 } },
    ]);

    const ruleByDistrict = await attachRules('city', districts.map((d) => d.district));

    // Active pincode rules inside this state, grouped by district.
    const activePinRules = await ServiceabilityRule.find({ level: 'pincode', isActive: true })
      .select('value -_id')
      .lean();

    const pinsByDistrict = activePinRules.length
      ? await Pincode.aggregate([
          {
            $match: {
              state,
              pincode: { $in: activePinRules.map((r) => r.value) },
            },
          },
          { $group: { _id: '$city', n: { $sum: 1 } } },
        ])
      : [];

    const pinCountByDistrict = new Map(pinsByDistrict.map((r) => [r._id, r.n]));

    // If the whole state is on, every pincode in every district is live.
    const stateRule = await ServiceabilityRule.findOne({
      level: 'state',
      value: state,
      isActive: true,
    }).lean();

    return ApiResponse.success(
      res,
      {
        state,
        districts: districts.map((d) => ({
          ...d,
          rule: ruleByDistrict.get(d.district) || null,
          activePincodes: stateRule
            ? d.pincodes
            : pinCountByDistrict.get(d.district) || 0,
        })),
      },
      'Districts retrieved'
    );
  }

  // Level 1: states
  const states = await Pincode.aggregate([
    {
      $group: {
        _id: '$state',
        districts: { $addToSet: '$city' },
        pincodes: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        state: '$_id',
        districtCount: { $size: '$districts' },
        pincodes: 1,
      },
    },
    { $sort: { state: 1 } },
  ]);

  const ruleByState = await attachRules('state', states.map((st) => st.state));

  // A state with no rule of its own can still have coverage underneath it — one active pincode
  // is real serviceability. Count the active rules below each state so the parent row can say
  // "Partial" instead of claiming Inactive while a child is on.
  const activeChildRules = await ServiceabilityRule.find({
    isActive: true,
    level: { $in: ['city', 'pincode'] },
  })
    .select('level value -_id')
    .lean();

  const activePinValues = activeChildRules.filter((r) => r.level === 'pincode').map((r) => r.value);
  const activeCityValues = activeChildRules.filter((r) => r.level === 'city').map((r) => r.value);

  const [pinsByState, citiesByState] = await Promise.all([
    activePinValues.length
      ? Pincode.aggregate([
          { $match: { pincode: { $in: activePinValues } } },
          { $group: { _id: '$state', n: { $sum: 1 } } },
        ])
      : [],
    activeCityValues.length
      ? Pincode.aggregate([
          { $match: { city: { $in: activeCityValues } } },
          { $group: { _id: '$state', n: { $sum: 1 } } },
        ])
      : [],
  ]);

  const pinCountByState = new Map(pinsByState.map((r) => [r._id, r.n]));
  const cityCountByState = new Map(citiesByState.map((r) => [r._id, r.n]));

  return ApiResponse.success(
    res,
    {
      states: states.map((st) => {
        const rule = ruleByState.get(st.state) || null;

        // An active state rule covers every pincode in the state. Reporting only the pincode-level
        // rules here made a switched-on state show "0 active" — the count contradicted the pill.
        const coveredByStateRule = rule?.isActive === true;

        return {
          ...st,
          rule,
          activePincodes: coveredByStateRule ? st.pincodes : pinCountByState.get(st.state) || 0,
          activeCities: coveredByStateRule
            ? st.districtCount || 0
            : cityCountByState.get(st.state) || 0,
          activeVia: coveredByStateRule ? 'state' : null,
        };
      }),
    },
    'States retrieved'
  );
});

/**
 * GET /serviceability/rules?level=&isActive=&q=
 *
 * The admin table. Returned most-specific-first (pincode → city → state → default) because that
 * IS the resolution order — showing a state rule above a pincode rule invites the "why is 400050
 * blocked when Maharashtra is on?" question.
 */
export const listRules = asyncHandler(async (req, res) => {
  const { level, isActive, q } = req.query;

  const filter = {};
  if (level) filter.level = level;
  if (isActive !== undefined && isActive !== '') {
    filter.isActive = String(isActive) === 'true';
  }
  if (normalise(q)) {
    const rx = new RegExp(normalise(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ value: rx }, { label: rx }];
  }

  const rules = await ServiceabilityRule.find(filter).lean();

  // ---------------------------------------------------------------------------
  // ENRICHMENT — a rule stores only its own level and value. The table needs to show the
  // hierarchy it sits in ("MAHARASHTRA › MUMBAI SUBURBAN › 88 pincodes"), so resolve each rule
  // against the master here rather than making the client issue one lookup per row.
  // ---------------------------------------------------------------------------
  const pincodeValues = rules.filter((r) => r.level === 'pincode').map((r) => r.value);
  const cityValues = rules.filter((r) => r.level === 'city').map((r) => r.value);
  const stateValues = rules.filter((r) => r.level === 'state').map((r) => r.value);

  const [pinMasters, cityAgg, stateAgg] = await Promise.all([
    pincodeValues.length
      ? Pincode.find({ pincode: { $in: pincodeValues } })
          .select('pincode state city district -_id')
          .lean()
      : [],
    cityValues.length
      ? Pincode.aggregate([
          { $match: { city: { $in: cityValues } } },
          { $group: { _id: '$city', state: { $first: '$state' }, pincodes: { $sum: 1 } } },
        ])
      : [],
    stateValues.length
      ? Pincode.aggregate([
          { $match: { state: { $in: stateValues } } },
          {
            $group: {
              _id: '$state',
              cities: { $addToSet: '$city' },
              pincodes: { $sum: 1 },
            },
          },
        ])
      : [],
  ]);

  const pinByValue = new Map(pinMasters.map((m) => [m.pincode, m]));
  const cityByValue = new Map(cityAgg.map((c) => [c._id, c]));
  const stateByValue = new Map(stateAgg.map((st) => [st._id, st]));

  const enriched = rules.map((rule) => {
    if (rule.level === 'pincode') {
      const m = pinByValue.get(rule.value);
      return {
        ...rule,
        state: m?.state || '',
        city: m?.city || m?.district || '',
        pincode: rule.value,
        coveredPincodes: 1,
      };
    }
    if (rule.level === 'city') {
      const c = cityByValue.get(rule.value);
      return {
        ...rule,
        state: c?.state || '',
        city: rule.value,
        pincode: '',
        coveredPincodes: c?.pincodes ?? null,
      };
    }
    if (rule.level === 'state') {
      const st = stateByValue.get(rule.value);
      return {
        ...rule,
        state: rule.value,
        city: '',
        pincode: '',
        coveredPincodes: st?.pincodes ?? null,
        coveredCities: st?.cities?.length ?? null,
      };
    }
    return { ...rule, state: '', city: '', pincode: '', coveredPincodes: null };
  });

  // Group by state so every rule for one state sits together, then most-specific-first inside it.
  const LEVEL_ORDER = { pincode: 0, city: 1, state: 2, default: 3 };
  enriched.sort(
    (a, b) =>
      String(a.state || '~').localeCompare(String(b.state || '~')) ||
      (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
      String(a.value || '').localeCompare(String(b.value || ''))
  );

  return ApiResponse.success(res, { rules: enriched, total: enriched.length }, 'Rules retrieved');
});

/**
 * GET /serviceability/cities?state=MAHARASHTRA
 * Feeds the admin's "activate a whole city" picker with real counts from the master.
 */
export const listServiceableCities = asyncHandler(async (req, res) => {
  const state = normalise(req.query.state).toUpperCase();

  const match = state ? { state } : {};
  const cities = await Pincode.aggregate([
    { $match: match },
    { $group: { _id: { state: '$state', city: '$city' }, pincodes: { $sum: 1 } } },
    { $sort: { '_id.state': 1, '_id.city': 1 } },
    {
      $project: {
        _id: 0,
        state: '$_id.state',
        city: '$_id.city',
        pincodes: 1,
      },
    },
  ]);

  return ApiResponse.success(res, { cities }, 'Cities retrieved');
});

/**
 * POST /serviceability/rules
 * Create or replace the rule for one level+value pair.
 */
export const upsertRule = asyncHandler(async (req, res) => {
  const { level, value, isActive, codAvailable, etaDays, label } = req.body;

  if (!['pincode', 'city', 'state', 'default'].includes(level)) {
    throw ApiError.badRequest('level must be one of: pincode, city, state, default');
  }

  const normalisedValue =
    level === 'default' ? '' : level === 'pincode' ? normalisePincode(value) : normalise(value);

  if (level !== 'default' && !normalisedValue) {
    throw ApiError.badRequest(`A ${level} rule needs a value.`);
  }
  if (level === 'pincode' && !/^[1-9][0-9]{5}$/.test(normalisedValue)) {
    throw ApiError.badRequest('A pincode rule needs a valid 6-digit pincode.');
  }

  const rule = await ServiceabilityRule.findOneAndUpdate(
    { level, value: normalisedValue },
    {
      $set: {
        isActive: isActive ?? null,
        codAvailable: codAvailable ?? null,
        etaDays: etaDays ?? null,
        label: label || '',
        updatedBy: req.admin?._id || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recordActivityLog({
    user: req.admin,
    action: ACTIVITY_ACTIONS.SERVICEABILITY_UPDATED,
    targetEntity: ENTITY_TYPES.SERVICEABILITY,
    targetEntityId: rule._id,
    domain: LOG_DOMAINS.OPERATIONS,
    details: { level, value: normalisedValue, isActive, codAvailable, etaDays },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { rule }, 'Serviceability rule saved');
});

/**
 * POST /serviceability/rules/deactivate-descendants
 * body: { level: 'state' | 'city', value, state? }
 *
 * Switching a state (or city) off has to clear the exceptions beneath it, or the state would read
 * Inactive while its pincodes kept selling. Those child rules are DELETED rather than flagged
 * false, so they return to the default — the same "back to original" behaviour as the toggles.
 */
export const deactivateDescendants = asyncHandler(async (req, res) => {
  const { level, value, state } = req.body;

  if (!['state', 'city'].includes(level)) {
    throw ApiError.badRequest('level must be state or city');
  }
  if (!normalise(value)) {
    throw ApiError.badRequest('A value is required.');
  }

  if (level === 'state') {
    const stateName = normalise(value).toUpperCase();
    const pins = await Pincode.find({ state: stateName }).select('pincode city -_id').lean();

    const pinValues = pins.map((p) => p.pincode);
    const cityValues = [...new Set(pins.map((p) => p.city).filter(Boolean))];

    const [pinResult, cityResult] = await Promise.all([
      pinValues.length
        ? ServiceabilityRule.deleteMany({ level: 'pincode', value: { $in: pinValues } })
        : { deletedCount: 0 },
      cityValues.length
        ? ServiceabilityRule.deleteMany({ level: 'city', value: { $in: cityValues } })
        : { deletedCount: 0 },
    ]);

    return ApiResponse.success(
      res,
      { pincodeRulesCleared: pinResult.deletedCount, cityRulesCleared: cityResult.deletedCount },
      'Descendant rules cleared'
    );
  }

  // level === 'city'
  const filter = { city: normalise(value) };
  if (normalise(state)) filter.state = normalise(state).toUpperCase();

  const pins = await Pincode.find(filter).select('pincode -_id').lean();
  const pinValues = pins.map((p) => p.pincode);

  const result = pinValues.length
    ? await ServiceabilityRule.deleteMany({ level: 'pincode', value: { $in: pinValues } })
    : { deletedCount: 0 };

  return ApiResponse.success(
    res,
    { pincodeRulesCleared: result.deletedCount },
    'Descendant rules cleared'
  );
});

/**
 * DELETE /serviceability/rules/:id
 * Removes the override so the broader rule applies again.
 */
export const deleteRule = asyncHandler(async (req, res) => {
  const rule = await ServiceabilityRule.findByIdAndDelete(req.params.id);
  if (!rule) throw ApiError.notFound('Rule not found');

  return ApiResponse.success(res, null, 'Rule removed');
});
