import mongoose from 'mongoose';
import { DISCOUNT_TYPE } from '../config/constants.js';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    discountType: {
      type: String,
      enum: Object.values(DISCOUNT_TYPE),
      required: true,
      default: DISCOUNT_TYPE.PERCENTAGE,
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minCartValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscountAmount: {
      type: Number,
      default: null, // Cap for percentage discount
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, 'Coupon expiration date is required'],
    },
    usageLimitTotal: {
      type: Number,
      default: null, // Null means unlimited
    },
    usageLimitPerUser: {
      type: Number,
      default: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.methods.isValid = function (cartTotal, userId) {
  const now = new Date();
  if (!this.isActive) return { valid: false, reason: 'Coupon is inactive.' };
  if (this.startDate && now < this.startDate) return { valid: false, reason: 'Coupon campaign has not started yet.' };
  if (this.endDate && now > this.endDate) return { valid: false, reason: 'Coupon has expired.' };
  if (this.usageLimitTotal && this.usedCount >= this.usageLimitTotal) return { valid: false, reason: 'Coupon usage limit has been reached.' };
  if (cartTotal < this.minCartValue) return { valid: false, reason: `Minimum cart value of ₹${this.minCartValue} required for this coupon.` };

  return { valid: true };
};

export const Coupon = mongoose.model('Coupon', couponSchema);
