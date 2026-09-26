import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';
import { EMPLOYEE_ID_PREFIXES, calculateNextEmployeeId } from '../utils/employeeId.js';

export const STAFF_ROLES = Object.freeze({
  PRODUCT_INVENTORY_MANAGER: ROLES.PRODUCT_INVENTORY_MANAGER,
  ORDER_MANAGER: ROLES.ORDER_MANAGER,
  CUSTOMER_SUPPORT: ROLES.CUSTOMER_SUPPORT,
  MARKETING_MANAGER: ROLES.MARKETING_MANAGER,
  FINANCE_MANAGER: ROLES.FINANCE_MANAGER,
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
      default: STAFF_ROLES.PRODUCT_INVENTORY_MANAGER,
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
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
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

staffSchema.pre('validate', async function (next) {
  if (this.role === 'super_admin') {
    return next(new Error('Super admin accounts must be created in the admin_m collection.'));
  }

  if (!this.employeeId) {
    const Model = this.constructor;
    const existingIds = await Model.find({ employeeId: { $regex: `^${EMPLOYEE_ID_PREFIXES.staff}-` } }, 'employeeId').lean();
    this.employeeId = calculateNextEmployeeId(existingIds.map((doc) => doc.employeeId), EMPLOYEE_ID_PREFIXES.staff);
  }
  next();
});

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
      employeeId: this.employeeId,
      isStaff: true,
    },
    env.JWT.SECRET,
    {
      expiresIn: env.JWT.EXPIRES_IN,
    }
  );
};

export const Staff = mongoose.model('Staff', staffSchema, 'staff_m');
