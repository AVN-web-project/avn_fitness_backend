import { ActivityLog } from '../../models/activityLog.model.js';
import { Order } from '../../models/order.model.js';
import { User } from '../../models/user.model.js';
import { Staff } from '../../models/staff.model.js';
import { Product } from '../../models/product.model.js';
import { ROLE_LOG_DOMAINS, ROLES, ORDER_STATUS } from '../../config/constants.js';
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
  STAFF: ['User'],
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

  // Server-side Domain Scoping Enforcement
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

  return ApiResponse.created(res, { staff: staffObj }, 'Staff account created successfully.');
});

export const toggleStaffStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const staffMember = await Staff.findById(id);

  if (!staffMember) throw ApiError.notFound('Staff member not found');
  if (req.user && staffMember._id.toString() === req.user._id?.toString()) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  staffMember.isActive = !staffMember.isActive;
  await staffMember.save();

  return ApiResponse.success(
    res,
    { staff: staffMember },
    `Staff status updated to ${staffMember.isActive ? 'Active' : 'Inactive'}`
  );
});
