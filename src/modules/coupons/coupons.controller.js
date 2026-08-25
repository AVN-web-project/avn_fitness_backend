import { Coupon } from '../../models/coupon.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordActivityLog } from '../../middlewares/activityLogger.middleware.js';
import { ACTIVITY_ACTIONS, ENTITY_TYPES } from '../../config/constants.js';

export const getActiveCoupons = asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).select('code description discountType discountValue minCartValue maxDiscountAmount endDate');

  return ApiResponse.success(res, { coupons }, 'Active promotional offers retrieved');
});

export const getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  return ApiResponse.success(res, { coupons, count: coupons.length }, 'All coupon campaigns retrieved');
});

export const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    minCartValue,
    maxDiscountAmount,
    startDate,
    endDate,
    usageLimitTotal,
    usageLimitPerUser,
  } = req.body;

  const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (existing) throw ApiError.conflict('Coupon code already exists');

  const coupon = await Coupon.create({
    code: code.toUpperCase().trim(),
    description,
    discountType,
    discountValue,
    minCartValue: minCartValue || 0,
    maxDiscountAmount: maxDiscountAmount || null,
    startDate: startDate || new Date(),
    endDate,
    usageLimitTotal: usageLimitTotal || null,
    usageLimitPerUser: usageLimitPerUser || 1,
    isActive: true,
  });

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.COUPON_CREATED,
    targetEntity: ENTITY_TYPES.COUPON,
    targetEntityId: coupon._id,
    details: { code: coupon.code, discountType, discountValue },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { coupon }, 'Coupon created successfully', 201);
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findById(id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  Object.assign(coupon, req.body);
  await coupon.save();

  await recordActivityLog({
    user: req.user,
    action: ACTIVITY_ACTIONS.COUPON_UPDATED,
    targetEntity: ENTITY_TYPES.COUPON,
    targetEntityId: coupon._id,
    details: { updatedFields: req.body },
    ipAddress: req.ip,
  });

  return ApiResponse.success(res, { coupon }, 'Coupon updated successfully');
});

export const toggleCouponStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const coupon = await Coupon.findById(id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  coupon.isActive = !coupon.isActive;
  await coupon.save();

  return ApiResponse.success(res, { coupon }, `Coupon status set to ${coupon.isActive ? 'Active' : 'Inactive'}`);
});
