import mongoose from 'mongoose';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ActivityLog } from '../../models/activityLog.model.js';
import { Order } from '../../models/order.model.js';
import { User } from '../../models/user.model.js';
import { Staff } from '../../models/staff.model.js';
import { Product } from '../../models/product.model.js';
import { ROLE_LOG_DOMAINS, ROLES, ORDER_STATUS, ACTIVITY_ACTIONS, ENTITY_TYPES, LOG_DOMAINS } from '../../config/constants.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendStaffWelcomeEmail } from '../../utils/email.service.js';
import { env } from '../../config/env.js';
import { parsePagination } from '../../utils/pagination.js';
import { normalizePhone, INDIAN_MOBILE_REGEX } from '../../utils/phone.js';

// Entity fallbacks for each domain
const DOMAIN_TO_ENTITIES = {
  PRODUCTS: ['Product'],
  INVENTORY: ['Product'],
  CATEGORIES: ['Category'],
  ORDERS: ['Order', 'Shipment'],
  SHIPMENTS: ['Shipment', 'Order'],
  RETURNS: ['Order'],
  REFUNDS: ['Order', 'Payment'],
  CUSTOMER_SUPPORT: ['SupportRequest'],
  MARKETING: ['Coupon', 'Review'],
  COUPONS: ['Coupon'],
  REVIEWS: ['Review'],
  FINANCE: ['Payment', 'Order'],
  PAYMENTS: ['Payment', 'Order'],
  STAFF: ['Staff', 'User'],
  SYSTEM: ['ActivityLog'],
};

/**
 * Activity Logs Query with Role-Scoped Boundaries
 */
export const getActivityLogs = asyncHandler(async (req, res) => {
  const { user, action, targetEntity, domain, dateFrom, dateTo, search, page = 1, limit = 50 } = req.query;
  const userRole = req.admin?.role || req.user?.role || ROLES.SUPER_ADMIN;
  const isSuper = req.admin?.isSuperAdmin || userRole === ROLES.SUPER_ADMIN;

  const filter = {};

  // Server-side Domain Scoping Enforcement (Strict RBAC for Staff & System Audit Logs)
  if (!isSuper) {
    const allowedDomains = ROLE_LOG_DOMAINS[userRole] || [];
    const allowedEntities = Array.from(new Set(allowedDomains.flatMap((d) => DOMAIN_TO_ENTITIES[d] || [])));

    if (domain) {
      if (!allowedDomains.includes(domain)) {
        return ApiResponse.success(res, {
          logs: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0 },
        });
      }
      const domainEntities = DOMAIN_TO_ENTITIES[domain] || [];
      filter.$or = [{ domain }, { targetEntity: { $in: domainEntities } }];
    } else if (targetEntity) {
      if (!allowedEntities.includes(targetEntity)) {
        return ApiResponse.success(res, {
          logs: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0 },
        });
      }
      filter.targetEntity = targetEntity;
    } else {
      filter.$or = [
        { domain: { $in: allowedDomains } },
        { targetEntity: { $in: allowedEntities } },
      ];
    }
  } else if (domain) {
    const domainEntities = DOMAIN_TO_ENTITIES[domain] || [];
    filter.$or = [{ domain }, { targetEntity: { $in: domainEntities } }];
  }

  if (user) filter.user = user;
  if (action) filter.action = action;
  if (targetEntity) filter.targetEntity = targetEntity;

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  if (search) {
    const searchFilter = [
      { action: { $regex: search, $options: 'i' } },
      { userName: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } },
      { 'performedBy.name': { $regex: search, $options: 'i' } },
      { 'details.productName': { $regex: search, $options: 'i' } },
      { 'details.sku': { $regex: search, $options: 'i' } },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
      delete filter.$or;
    } else {
      filter.$or = searchFilter;
    }
  }

const { page: pageNum, limit: limitNum } = parsePagination({ page, limit }, { defaultLimit: 50 });
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ActivityLog.countDocuments(filter),
  ]);

  // Enrich legacy REFUND_RECORDED entries (logged before the txn-id / amount-cap updates):
  // stamp the refunded order's own payment transaction ID (matching the Finance page's
  // reference) and cap the recorded refund amount at what the customer actually paid
  const refundLogs = logs.filter(
    (l) => l.action === ACTIVITY_ACTIONS.REFUND_RECORDED && l.details?.orderNumber
  );
  if (refundLogs.length > 0) {
    const orderNumbers = [...new Set(refundLogs.map((l) => l.details.orderNumber))];
    const orders = await Order.find(
      { orderNumber: { $in: orderNumbers } },
      {
        orderNumber: 1,
        'paymentInfo.transactionId': 1,
        'paymentInfo.paymentOrderId': 1,
        'pricing.totalPayable': 1,
      }
    ).lean();
    const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o]));
    for (const log of refundLogs) {
      const order = orderByNumber.get(log.details.orderNumber);
      if (!order) continue;
      if (!log.details.paymentTransactionId) {
        log.details.paymentTransactionId =
          order.paymentInfo?.transactionId || order.paymentInfo?.paymentOrderId;
      }
      const paid = Number(order.pricing?.totalPayable) || 0;
      const recorded = Number(log.details.refundAmount);
      if (paid > 0 && Number.isFinite(recorded) && recorded > paid) {
        log.details.refundAmount = paid;
      }
    }
  }

  return ApiResponse.success(
    res,
    {
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Activity logs retrieved successfully'
  );
});

/**
 * Admin Analytics Overview
 */
export const getAdminAnalytics = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    revenueData,
    statusBreakdown,
  ] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([
      {
        $match: {
          orderStatus: {
            $in: [
              ORDER_STATUS.PAID_CONFIRMED,
              ORDER_STATUS.PROCESSING,
              ORDER_STATUS.SHIPPED,
              ORDER_STATUS.DELIVERED,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$pricing.subtotal' },
          totalDiscounts: { $sum: '$pricing.discount' },
          netRevenue: { $sum: '$pricing.totalPayable' },
          orderCount: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const revenue = revenueData[0] || {
    grossRevenue: 0,
    totalDiscounts: 0,
    netRevenue: 0,
    orderCount: 0,
  };

  const averageOrderValue = revenue.orderCount > 0 ? Math.round(revenue.netRevenue / revenue.orderCount) : 0;

  return ApiResponse.success(
    res,
    {
      summary: {
        totalUsers,
        totalProducts,
        totalOrders,
        grossRevenue: revenue.grossRevenue,
        totalDiscounts: revenue.totalDiscounts,
        netRevenue: revenue.netRevenue,
        averageOrderValue,
      },
      orderStatusDistribution: statusBreakdown.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    },
    'Analytics metrics retrieved successfully'
  );
});

/**
 * Customer Directory
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

const { page: pageNum, limit: limitNum } = parsePagination({ page, limit }, { defaultLimit: 20 });
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    User.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Customer directory retrieved'
  );
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);

  if (!user) throw ApiError.notFound('Customer not found');

  user.isActive = !user.isActive;
  await user.save();

  return ApiResponse.success(res, { user }, `Customer account status updated to ${user.isActive ? 'Active' : 'Inactive'}`);
});

/**
 * Staff Directory & Management
 */
export const getStaff = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } },
    ];
  }

const { page: pageNum, limit: limitNum } = parsePagination({ page, limit }, { defaultLimit: 50 });
  const skip = (pageNum - 1) * limitNum;

  const [staff, total] = await Promise.all([
    Staff.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Staff.countDocuments(filter),
  ]);

  return ApiResponse.success(
    res,
    {
      users: staff,
      staff,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Staff accounts retrieved'
  );
});

export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, permissions } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await Staff.findOne({ email: normalizedEmail });
  if (existing) {
    throw ApiError.conflict('Staff member with this email already exists.');
  }

  // Phone is optional for staff, but if supplied it must be a real number. Normalise
  // first so "+91 98765 43210" and "098765 43210" are accepted and stored as 10 digits.
  let normalisedStaffPhone;
  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    normalisedStaffPhone = normalizePhone(phone);
    if (!INDIAN_MOBILE_REGEX.test(normalisedStaffPhone)) {
      throw ApiError.badRequest('Enter a valid 10-digit mobile number.');
    }
  }

  const newStaff = await Staff.create({
    name,
    email: normalizedEmail,
    password,
    role,
    phone: normalisedStaffPhone || undefined,
    permissions: permissions || [],
  });

  const staffObj = newStaff.toObject();
  delete staffObj.password;

  // Email the new staff member their credentials plus a single-use link to set
  // their own password. A mail failure must not fail the account creation.
  try {
    const rawToken = newStaff.createPasswordResetToken();
    await newStaff.save({ validateBeforeSave: false });

    await sendStaffWelcomeEmail({
      to: newStaff.email,
      name: newStaff.name,
      email: newStaff.email,
      password,
      role: newStaff.role,
      loginUrl: `${env.ADMIN_CLIENT_URL}/login`,
      setPasswordUrl: `${env.ADMIN_CLIENT_URL}/reset-password?resetToken=${rawToken}&email=${encodeURIComponent(newStaff.email)}`,
    });
  } catch (emailError) {
    console.error('Staff welcome email failed:', emailError);
  }

  // Audit Log for Staff Creation (Admin-only domain)
  await recordActivityLog({
    user: req.user || req.admin,
    action: ACTIVITY_ACTIONS.STAFF_CREATED,
    domain: LOG_DOMAINS.STAFF,
    targetEntity: ENTITY_TYPES.STAFF,
    targetEntityId: newStaff._id,
    details: {
      staffName: newStaff.name,
      staffEmail: newStaff.email,
      employeeId: newStaff.employeeId,
      assignedRole: newStaff.role,
      phone: newStaff.phone || undefined,
      context: `Created new staff account for ${newStaff.name} (${newStaff.email}) with role '${newStaff.role}'.`,
    },
    ipAddress: req.ip,
  });

  return ApiResponse.created(res, { staff: staffObj }, 'Staff account created successfully.');
});

export const toggleStaffStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const staffMember = await Staff.findById(id);

  if (!staffMember) throw ApiError.notFound('Staff member not found');
  if (req.user && staffMember._id.toString() === req.user._id?.toString()) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  const previousState = staffMember.isActive ? 'Active' : 'Suspended';
  staffMember.isActive = !staffMember.isActive;
  await staffMember.save();
  const newState = staffMember.isActive ? 'Active' : 'Suspended';

  // Audit Log for Staff Status Update (Admin-only domain)
  await recordActivityLog({
    user: req.user || req.admin,
    action: ACTIVITY_ACTIONS.STAFF_STATUS_CHANGED,
    domain: LOG_DOMAINS.STAFF,
    targetEntity: ENTITY_TYPES.STAFF,
    targetEntityId: staffMember._id,
    details: {
      staffName: staffMember.name,
      staffEmail: staffMember.email,
      employeeId: staffMember.employeeId,
      role: staffMember.role,
      previousStatus: previousState,
      newStatus: newState,
      context: `Staff account '${staffMember.name}' (${staffMember.email}) status changed from ${previousState} to ${newState}.`,
    },
    ipAddress: req.ip,
  });

  return ApiResponse.success(
    res,
    { staff: staffMember },
    `Staff status updated to ${staffMember.isActive ? 'Active' : 'Suspended'}`
  );
});


/**
 * Tabulated Processed Payments with Filters & Analytics
 * GET /api/v1/admin/payments
 */
// Mask a customer refund destination for API responses once the payout is settled,
// so live systems hold the full account number only while a refund is genuinely pending.
const maskRefundAccount = (acc) => {
  if (!acc) return null;
  const [user, domain] = String(acc.upiId || '').split('@');
  return {
    method: acc.method || 'upi',
    upiId: acc.upiId ? `${user.slice(0, 2)}****@${domain || ''}` : '',
    holderName: acc.holderName || '',
    accountNumber: acc.accountNumber ? `****${acc.accountNumber.slice(-4)}` : '',
    ifsc: acc.ifsc || '',
    providedAt: acc.providedAt,
  };
};

export const getPaymentsList = asyncHandler(async (req, res) => {
  const { search, status, provider, page = 1, limit = 20 } = req.query;

  const orderFilter = {};
  if (status && status !== 'all') {
    if (status === 'refunded') {
      orderFilter.$or = [
        { 'paymentInfo.paymentStatus': 'refunded' },
        { orderStatus: 'refunded' },
      ];
    } else if (status === 'captured' || status === 'paid' || status === 'success') {
      orderFilter['paymentInfo.paymentStatus'] = { $in: ['captured', 'paid', 'success'] };
      orderFilter.orderStatus = { $ne: 'refunded' };
    } else {
      orderFilter['paymentInfo.paymentStatus'] = status;
    }
  }

  if (provider && provider !== 'all') {
    orderFilter['paymentInfo.provider'] = provider;
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    orderFilter.$or = [
      { orderNumber: searchRegex },
      { 'paymentInfo.transactionId': searchRegex },
      { 'paymentInfo.paymentOrderId': searchRegex },
      { 'shippingAddress.fullName': searchRegex },
      { 'shippingAddress.phone': searchRegex },
    ];
  }

const { page: pageNum, limit: limitNum } = parsePagination({ page, limit }, { defaultLimit: 20 });
  const skip = (pageNum - 1) * limitNum;

  const [orders, total, allOrders] = await Promise.all([
    Order.find(orderFilter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Order.countDocuments(orderFilter),
    Order.find({}).select('pricing paymentInfo orderStatus createdAt').lean(),
  ]);

  const payments = orders.map((ord) => {
    const isRefunded = ord.orderStatus === 'refunded' || ord.paymentInfo?.paymentStatus === 'refunded';
    const isSuccess = ['paid_confirmed', 'processing', 'shipped', 'delivered'].includes(ord.orderStatus) && !isRefunded;

    // Classify the transaction for the Finance table / detail window
    let paymentType = 'Order Payment';
    if (isRefunded) {
      const hadReturnRequest = Boolean(
        ord.returnRequest?.isRequested || ord.returnRequest?.status
      );
      paymentType = hadReturnRequest ? 'Return Refund' : 'Cancellation Refund';
    }

    return {
      _id: ord._id,
      orderId: ord._id,
      orderNumber: ord.orderNumber,
      customerName: ord.shippingAddress?.fullName || ord.user?.name || 'Customer',
      customerEmail: ord.user?.email || 'N/A',
      customerPhone: ord.shippingAddress?.phone || ord.user?.phone || 'N/A',
      transactionId: ord.paymentInfo?.transactionId || ord.paymentInfo?.paymentOrderId || `AVN-TXN-${ord.orderNumber}`,
      refundTransactionId: isRefunded ? (ord.paymentInfo?.refundTransactionId || null) : null,
      // Refund destination the customer provided with their return request.
      // Masked once the payout is settled (order refunded).
      refundAccount:
        ord.returnRequest?.refundAccount &&
        (ord.returnRequest.refundAccount.upiId || ord.returnRequest.refundAccount.accountNumber)
          ? (isRefunded
              ? maskRefundAccount(ord.returnRequest.refundAccount)
              : ord.returnRequest.refundAccount)
          : null,
      paymentOrderId: ord.paymentInfo?.paymentOrderId || 'N/A',
      provider: ord.paymentInfo?.provider || 'razorpay',
      paymentType,
      amount: ord.pricing?.totalPayable || 0,
      subtotal: ord.pricing?.subtotal || 0,
      discount: ord.pricing?.discount || 0,
      tax: ord.pricing?.tax || 0,
      shippingFee: ord.pricing?.shippingFee || 0,
      paymentStatus: isRefunded ? 'refunded' : (ord.paymentInfo?.paymentStatus || (isSuccess ? 'captured' : 'pending')),
      orderStatus: ord.orderStatus,
      paidAt: ord.paymentInfo?.paidAt || ord.createdAt,
      refundInfo: isRefunded ? {
        refundId: ord.paymentInfo?.refundTransactionId || null,
        refundAmount: ord.returnRequest?.refundAmount || ord.pricing?.totalPayable,
        refundedAt: ord.returnRequest?.reviewedAt || ord.updatedAt,
        reason: ord.returnRequest?.reason || ord.cancellation?.reason || 'Customer refund settlement',
      } : null,
      createdAt: ord.createdAt,
    };
  });

  // Calculate high level platform volume totals
  let grossVolume = 0;
  let totalDiscounts = 0;
  let netRevenue = 0;
  let totalRefunds = 0;
  let capturedTransactions = 0;
  let refundedTransactions = 0;

  for (const o of allOrders) {
    const payable = Number(o.pricing?.totalPayable) || 0;
    const sub = Number(o.pricing?.subtotal) || 0;
    const disc = Number(o.pricing?.discount) || 0;

    grossVolume += sub;
    totalDiscounts += disc;

    if (o.orderStatus === 'refunded' || o.paymentInfo?.paymentStatus === 'refunded') {
      totalRefunds += payable;
      refundedTransactions++;
    } else if (['paid_confirmed', 'processing', 'shipped', 'delivered'].includes(o.orderStatus)) {
      netRevenue += payable;
      capturedTransactions++;
    }
  }

  return ApiResponse.success(
    res,
    {
      payments,
      stats: {
        grossVolume,
        totalDiscounts,
        netRevenue,
        totalRefunds,
        totalTransactions: allOrders.length,
        capturedTransactions,
        refundedTransactions,
        averageOrderValue: capturedTransactions > 0 ? Math.round(netRevenue / capturedTransactions) : 0,
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Payments list retrieved successfully'
  );
});

/**
 * Returns & Cancellation Requests Workflow
 * GET /api/v1/admin/returns-cancellations
 */
export const getReturnsAndCancellations = asyncHandler(async (req, res) => {
  const { filterType, search, page = 1, limit = 20 } = req.query;

  const query = {
    $or: [
      { orderStatus: { $in: [ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } },
      { 'returnRequest.isRequested': true },
      { 'cancellation.isCancelled': true },
    ],
  };

  if (filterType === 'return_requested') {
    query.orderStatus = ORDER_STATUS.RETURN_REQUESTED;
  } else if (filterType === 'pending_refund') {
    // Refund-eligible: any returned order, or a cancelled order that took online money.
    // This mirrors the Process Refund button's rule on the Finance page.
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { orderStatus: ORDER_STATUS.RETURNED },
          {
            orderStatus: ORDER_STATUS.CANCELLED,
            'paymentInfo.paymentStatus': 'captured',
            'paymentInfo.provider': { $ne: 'cod' },
          },
        ],
      },
    ];
  } else if (filterType === 'refunded') {
    query.orderStatus = ORDER_STATUS.REFUNDED;
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { orderNumber: searchRegex },
          { 'shippingAddress.fullName': searchRegex },
          { 'shippingAddress.phone': searchRegex },
        ],
      },
    ];
  }

const { page: pageNum, limit: limitNum } = parsePagination({ page, limit }, { defaultLimit: 20 });
  const skip = (pageNum - 1) * limitNum;

  const [orders, total, allRelevant] = await Promise.all([
    Order.find(query)
      .populate('user', 'name email phone')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Order.countDocuments(query),
    Order.find({
      $or: [
        { orderStatus: { $in: [ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } },
        { 'returnRequest.isRequested': true },
        { 'cancellation.isCancelled': true },
      ],
    }).select('orderStatus pricing paymentInfo returnRequest cancellation').lean(),
  ]);

  let returnRequestedCount = 0;
  let pendingRefundCount = 0;
  let refundedCount = 0;
  let totalRefundedAmount = 0;

  for (const o of allRelevant) {
    const cancelledPaidOnline =
      o.orderStatus === ORDER_STATUS.CANCELLED &&
      o.paymentInfo?.paymentStatus === 'captured' &&
      o.paymentInfo?.provider !== 'cod';

    if (o.orderStatus === ORDER_STATUS.RETURN_REQUESTED) {
      returnRequestedCount++;
    } else if (o.orderStatus === ORDER_STATUS.RETURNED || cancelledPaidOnline) {
      pendingRefundCount++;
    } else if (o.orderStatus === ORDER_STATUS.REFUNDED) {
      refundedCount++;
      totalRefundedAmount += Number(o.pricing?.totalPayable) || 0;
    }
  }

  // The customer's payout destination may only be exposed in full while the refund
  // is still pending — the finance manager needs the real details to make the
  // transfer. Once the order is refunded the payout is settled, so it is masked.
  // Without this the returns list handed out the raw UPI / account number.
  const requests = orders.map((o) => {
    const raw = o.returnRequest?.refundAccount;
    const hasDestination = Boolean(raw && (raw.upiId || raw.accountNumber));
    const isSettled =
      o.orderStatus === ORDER_STATUS.REFUNDED || o.paymentInfo?.paymentStatus === 'refunded';
    const exposed = hasDestination ? (isSettled ? maskRefundAccount(raw) : raw) : null;

    return {
      ...o,
      // Never leak the raw destination once the payout has settled
      returnRequest: o.returnRequest
        ? { ...o.returnRequest, refundAccount: exposed }
        : o.returnRequest,
      refundAccount: exposed,
    };
  });

  return ApiResponse.success(
    res,
    {
      requests,
      metrics: {
        returnRequestedCount,
        pendingRefundCount,
        refundedCount,
        totalRefundedAmount,
        totalRequests: allRelevant.length,
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    'Return and cancellation requests retrieved successfully'
  );
});

/**
 * GET /admin/users/:id
 * Complete customer view for the admin drawer — profile, lifetime order stats
 * and the most recent orders.
 */
export const getCustomerDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await User.findById(id).select('-password').lean();
  if (!customer) throw ApiError.notFound('Customer not found');

  // Cancelled orders still count as activity, but not as spend.
  const [stats] = await Order.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(id) } },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        lifetimeValue: {
          $sum: {
            $cond: [{ $ne: ['$orderStatus', ORDER_STATUS.CANCELLED] }, '$pricing.totalPayable', 0],
          },
        },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);

  const recentOrders = await Order.find({ user: id })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber orderStatus pricing.totalPayable items createdAt')
    .lean();

  return ApiResponse.success(
    res,
    {
      customer,
      stats: {
        orderCount: stats?.orderCount || 0,
        lifetimeValue: stats?.lifetimeValue || 0,
        lastOrderAt: stats?.lastOrderAt || null,
      },
      orders: recentOrders,
    },
    'Customer detail retrieved'
  );
});
