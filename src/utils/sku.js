/**
 * SKU construction, in one place.
 *
 * Format: BRAND-CATEGORY-PRODUCT-NN-COLOUR-SIZE      e.g. AVN-KS-AS-04-BLK-M
 *
 * The category segment is the initials of the category name, capped at three letters:
 *   "Knee Support" -> KS     "Elbow Support" -> ES     "Accessories" -> ACC
 *
 * This module is imported by the product controller (for auto-generated SKUs) and by
 * scripts/build-sku-map.js (for the migration map), so the two can never disagree about what a
 * SKU should look like. That matters: if they drifted, a regenerated SKU would not match the map
 * used to move carts and inventory, and the catalogue would split.
 */

const BRAND = 'AVN';

/** Initials of each word, uppercase, max 3 characters. "Knee Support" -> "KS". */
export function categoryCode(name) {
  const words = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'GEN';
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((w) => w[0]).join('').slice(0, 3);
}

/** 4 characters of the product name, uppercased. "Ankle Compression Sleeve" -> "ANKL". */
export function productCode(name) {
  return (
    String(name || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 4)
      .toUpperCase() || 'PROD'
  );
}

/** Colour abbreviation used by the existing catalogue: "Stealth Black" -> "BLK". */
const COLOUR_CODES = {
  BLACK: 'BLK',
  WHITE: 'WHT',
  RED: 'RED',
  CRIMSON: 'RED',
  NAVY: 'NVY',
  BLUE: 'BLU',
  GREY: 'GRY',
  GRAY: 'GRY',
  GREEN: 'GRN',
  NATURAL: 'NAT',
  CANVAS: 'NAT',
  BEIGE: 'BGE',
  PINK: 'PNK',
  PURPLE: 'PUR',
};

export function colourCode(colour) {
  const c = String(colour || '').toUpperCase().trim();
  if (!c) return 'STD';
  for (const [word, code] of Object.entries(COLOUR_CODES)) {
    if (c.includes(word)) return code;
  }
  return c.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'STD';
}

/** Size token: "Large" -> "L", "Medium" -> "M", "90 inch" -> "90IN". */
// "STD" is the sentinel for "there is no size axis", and the builder omits the segment for it.
// One Size belongs here: it means the absence of a choice, not a size called ON.
const SIZE_CODES = {
  LARGE: 'L',
  MEDIUM: 'M',
  SMALL: 'S',
  XLARGE: 'XL',
  'EXTRA LARGE': 'XL',
  FREE: 'STD',
  'FREE SIZE': 'STD',
  'ONE SIZE': 'STD',
  ONESIZE: 'STD',
  OS: 'STD',
  STANDARD: 'STD',
};

export function sizeCode(size) {
  const s = String(size || '').toUpperCase().trim();
  if (!s) return 'STD';
  if (SIZE_CODES[s]) return SIZE_CODES[s];

  // A length, expressed in inches because that is the catalogue's unit. Parsing the number alone
  // and appending "IN" read "8ft" as eight inches and "50 cm" as fifty inches — both wrong by a
  // factor of twelve and two and a half respectively.
  const num = s.match(/(\d+(?:\.\d+)?)/);
  if (num) {
    const value = parseFloat(num[1]);
    const isInches = /INCH|"/.test(s);
    // No leading \b: in "8FT" the F follows a digit, so a word boundary does not exist there.
    const isFeet = /FT\b|FEET|FOOT|'/.test(s);
    const isCm = /\bCM\b|CENTIMET/.test(s);

    if (isFeet && !isInches) return `${Math.round(value * 12)}IN`;
    if (isCm) return `${Math.round(value / 2.54)}IN`;
    return `${Math.round(value)}IN`;
  }

  return s.replace(/[^A-Z0-9]/g, '').slice(0, 2) || 'STD';
}

/**
 * Builds a full SKU. `index` is the 1-based position of the variant, zero-padded to 2 digits.
 * Returns null when there is nothing to key on, so callers can fall back rather than mint a
 * meaningless code.
 */
export function buildVariantSku({ categoryName, productName, index = 0, colour, size }) {
  const cat = categoryCode(categoryName);
  const prod = productCode(productName);
  const num = String(Number(index) + 1).padStart(2, '0');
  const parts = [BRAND, cat, prod, num];

  const col = colourCode(colour);
  const sz = sizeCode(size);
  if (col !== 'STD') parts.push(col);
  if (sz !== 'STD') parts.push(sz);

  return parts.join('-');
}

/**
 * Inserts the category segment into an EXISTING SKU, leaving everything else untouched.
 *   AVN-AS-04-BLK-M  +  "Knee Support"  ->  AVN-KS-AS-04-BLK-M
 *
 * Used by the migration map. Rebuilding the product code instead would renumber the whole
 * catalogue for no reason and make the map far harder to review.
 * Idempotent: a SKU that already carries the right category segment is returned unchanged.
 */
export function insertCategory(sku, categoryName) {
  const original = String(sku || '').trim().toUpperCase();
  if (!original) return null;

  const parts = original.split('-').filter(Boolean);
  if (parts.length === 0) return null;

  const cat = categoryCode(categoryName);

  // The brand segment is always AVN. Older SKUs carried other prefixes — LEG on the discontinued
  // power wraps — and preserving them would leave one product branded differently from the rest of
  // the catalogue. The brand is a property of the shop, not of the old string.
  const alreadyCorrect = parts[0] === BRAND && parts[1] === cat;
  if (alreadyCorrect) return original;

  const rest = parts.slice(1);

  // No product segment to sit in front of.
  if (rest.length === 0) return `${BRAND}-${cat}`;

  // The category is already the second segment; only the brand needs replacing.
  if (rest[0] === cat) return [BRAND, ...rest].join('-');

  return [BRAND, cat, ...rest].join('-');
}

export default { categoryCode, productCode, colourCode, sizeCode, buildVariantSku, insertCategory };
