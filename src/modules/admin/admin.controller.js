import { ActivityLog } from '../../models/activityLog.model.js';
import { Order } from '../../models/order.model.js';
import { User } from '../../models/user.model.js';
import { Product } from '../../models/product.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ORDER_STATUS } from '../../config/constants.js';

export const getActivityLogs = asyncHandler(async (req, res) => {
  const { user, action, targetEntity, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (user) filter.user = user;
  if (action) filter.action = action;
  if (targetEntity) filter.targetEntity = targetEntity;

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
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

export const getAdminAnalytics = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    revenueData,
    statusBreakdown,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
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

export const getUsers = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
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
    'Users list retrieved'
  );
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);

  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin' && user._id.toString() === req.user._id.toString()) {
    throw ApiError.badRequest('Admins cannot deactivate their own account.');
  }

  user.isActive = !user.isActive;
  await user.save();

  return ApiResponse.success(res, { user }, `User account status updated to ${user.isActive ? 'Active' : 'Inactive'}`);
});
