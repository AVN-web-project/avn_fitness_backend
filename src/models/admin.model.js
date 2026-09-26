import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';
import { EMPLOYEE_ID_PREFIXES, calculateNextEmployeeId } from '../utils/employeeId.js';

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide an administrator name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
      default: 'Super Administrator',
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
      default: ROLES.SUPER_ADMIN,
      enum: [ROLES.SUPER_ADMIN],
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

adminSchema.pre('validate', async function (next) {
  if (!this.employeeId) {
    const Model = this.constructor;
    const existingIds = await Model.find({ employeeId: { $regex: `^${EMPLOYEE_ID_PREFIXES.admin}-` } }, 'employeeId').lean();
    this.employeeId = calculateNextEmployeeId(existingIds.map((doc) => doc.employeeId), EMPLOYEE_ID_PREFIXES.admin);
  }
  next();
});

// Encrypt password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT Auth Token with isAdmin marker
adminSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role || ROLES.SUPER_ADMIN,
      name: this.name,
      employeeId: this.employeeId,
      isAdmin: true,
      isStaff: true,
    },
    env.JWT.SECRET,
    {
      expiresIn: env.JWT.EXPIRES_IN,
    }
  );
};

export const Admin = mongoose.model('Admin', adminSchema, 'admin_m');
