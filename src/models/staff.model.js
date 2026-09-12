import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const STAFF_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  PRODUCT_INVENTORY_MANAGER: 'product_inventory_manager',
  ORDER_MANAGER: 'order_manager',
  CUSTOMER_SUPPORT: 'customer_support',
  MARKETING_MANAGER: 'marketing_manager',
  FINANCE_MANAGER: 'finance_manager',
  ADMIN: 'admin',
  OPERATIONS: 'operations',
});

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a staff member name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(STAFF_ROLES),
      default: STAFF_ROLES.OPERATIONS,
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    phone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving
staffSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
staffSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT Auth Token with isStaff marker
staffSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role,
      name: this.name,
      isStaff: true,
    },
    env.JWT.SECRET,
    {
      expiresIn: env.JWT.EXPIRES_IN,
    }
  );
};

export const Staff = mongoose.model('Staff', staffSchema, 'staff_m');
