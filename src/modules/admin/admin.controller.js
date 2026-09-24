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
  const userRole = req.admin?.role || req.user?.role || 'admin';
  const isSuper = req.admin?.isSuperAdmin || userRole === ROLES.SUPER_ADMIN || userRole === ROLES.ADMIN;

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

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ActivityLog.countDocuments(filter),
  ]);

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

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
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
    ];
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;
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

  const newStaff = await Staff.create({
    name,
    email: normalizedEmail,
    password,
    role,
    phone,
    permissions: permissions || [],
  });

  const staffObj = newStaff.toObject();
  delete staffObj.password;

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

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
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

    return {
      _id: ord._id,
      orderId: ord._id,
      orderNumber: ord.orderNumber,
      customerName: ord.shippingAddress?.fullName || ord.user?.name || 'Customer',
      customerEmail: ord.user?.email || 'N/A',
      customerPhone: ord.shippingAddress?.phone || ord.user?.phone || 'N/A',
      transactionId: ord.paymentInfo?.transactionId || ord.paymentInfo?.paymentOrderId || `AVN-TXN-${ord.orderNumber}`,
      paymentOrderId: ord.paymentInfo?.paymentOrderId || 'N/A',
      provider: ord.paymentInfo?.provider || 'razorpay',
      amount: ord.pricing?.totalPayable || 0,
      subtotal: ord.pricing?.subtotal || 0,
      discount: ord.pricing?.discount || 0,
      tax: ord.pricing?.tax || 0,
      shippingFee: ord.pricing?.shippingFee || 0,
      paymentStatus: isRefunded ? 'refunded' : (ord.paymentInfo?.paymentStatus || (isSuccess ? 'captured' : 'pending')),
      orderStatus: ord.orderStatus,
      paidAt: ord.paymentInfo?.paidAt || ord.createdAt,
      refundInfo: isRefunded ? {
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
    query.orderStatus = { $in: [ORDER_STATUS.RETURNED, ORDER_STATUS.CANCELLED] };
  } else if (filterType === 'refunded') {
    query.orderStatus = ORDER_STATUS.REFUNDED;
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$and = [
      {
        $or: [
          { orderNumber: searchRegex },
          { 'shippingAddress.fullName': searchRegex },
          { 'shippingAddress.phone': searchRegex },
        ],
      },
    ];
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
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
    }).select('orderStatus pricing returnRequest cancellation').lean(),
  ]);

  let returnRequestedCount = 0;
  let pendingRefundCount = 0;
  let refundedCount = 0;
  let totalRefundedAmount = 0;

  for (const o of allRelevant) {
    if (o.orderStatus === ORDER_STATUS.RETURN_REQUESTED) {
      returnRequestedCount++;
    } else if (o.orderStatus === ORDER_STATUS.RETURNED || o.orderStatus === ORDER_STATUS.CANCELLED) {
      pendingRefundCount++;
    } else if (o.orderStatus === ORDER_STATUS.REFUNDED) {
      refundedCount++;
      totalRefundedAmount += Number(o.pricing?.totalPayable) || 0;
    }
  }

  return ApiResponse.success(
    res,
    {
      requests: orders,
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
