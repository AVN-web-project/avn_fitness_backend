import mongoose from 'mongoose';
import crypto from 'crypto';
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
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
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

// Issue a single-use password-reset token. The raw token goes in the email;
// only its SHA-256 hash is stored, so a leaked database can't be replayed.
adminSchema.methods.createPasswordResetToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  return rawToken;
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
