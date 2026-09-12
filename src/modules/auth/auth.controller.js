<<<<<<< HEAD
﻿import crypto from 'crypto';
import bcrypt from 'bcrypt';
=======
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
>>>>>>> d985d6fdce7f73c7d1439ebe6ce0dad788e91007

import { User } from '../../models/user.model.js';
import { Staff } from '../../models/staff.model.js';
import { Admin } from '../../models/admin.model.js';
import { Otp } from '../../models/otp.model.js';
import { sendOtpEmail } from '../../utils/email.service.js';
import { ApiError } from '../../utils/apiError.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { ROLES } from '../../config/constants.js';

const sendTokenResponse = (account, statusCode, res, message) => {
  const token = account.generateAuthToken();

  const cookieOptions = {
    expires: new Date(
      Date.now() + env.JWT.COOKIE_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  const accountObj = account.toObject ? account.toObject() : { ...account };
  delete accountObj.password;

  return res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json(
      new ApiResponse(
        statusCode,
        { user: accountObj, token },
        message
      )
    );
};

/**
 * Register a new customer account
 * Requires a valid email OTP
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, otp } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Check whether account already exists in Users
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  // Find OTP record
  const otpRecord = await Otp.findOne({ email: normalizedEmail });
  if (!otpRecord) {
    throw ApiError.badRequest('Verification code has expired or was not requested. Please request a new code.');
  }

  if (otpRecord.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw ApiError.badRequest('Verification code has expired. Please request a new code.');
  }

  const isOtpValid = await bcrypt.compare(otp.trim(), otpRecord.otpHash);
  if (!isOtpValid) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({ _id: otpRecord._id });
      throw ApiError.badRequest('Too many failed attempts. Please request a new verification code.');
    }
    await otpRecord.save();
    throw ApiError.badRequest('Invalid verification code.');
  }

  await Otp.deleteOne({ _id: otpRecord._id });

  const newUser = await User.create({
    name,
    email: normalizedEmail,
    password,
    phone,
    authProvider: 'local',
    role: ROLES.USER,
    isActive: true,
  });

  return sendTokenResponse(newUser, 201, res, 'Customer account registered successfully!');
});

/**
 * Universal Login with Email & Password (Staff or Customer)
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Check Admin collection first
  let account = await Admin.findOne({ email: normalizedEmail }).select('+password');

  // Check Staff collection
  if (!account) {
    account = await Staff.findOne({ email: normalizedEmail }).select('+password');
  }

  // Fallback to Customer Users collection
  if (!account) {
    account = await User.findOne({ email: normalizedEmail }).select('+password');
  }

  if (!account) {
    throw new ApiError(
      404,
      'No account found with this email.',
      [{ field: 'email', reason: 'USER_NOT_FOUND' }]
    );
  }

  const isMatch = await account.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!account.isActive) {
    throw ApiError.forbidden('Account has been deactivated. Please contact support.');
  }

  account.lastLoginAt = new Date();
  await account.save({ validateBeforeSave: false });

  return sendTokenResponse(account, 200, res, 'Login successful');
});

/**
 * Send 6-digit OTP code to email
 */
export const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose = 'login' } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });

  if (purpose === 'register' && existingUser) {
    throw ApiError.conflict('An account with this email already exists. Please sign in.');
  }

  if (purpose === 'login' && !existingUser) {
    throw new ApiError(404, 'No account found with this email.', [{ field: 'email', reason: 'USER_NOT_FOUND' }]);
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const otpHash = await bcrypt.hash(otp, 10);

  await Otp.findOneAndUpdate(
    { email: normalizedEmail },
    { otpHash, attempts: 0, expiresAt },
    { upsert: true, new: true }
  );

  await sendOtpEmail(normalizedEmail, otp);

  return ApiResponse.success(res, { email: normalizedEmail, expiresIn: 300 }, 'Verification code sent successfully.');
});

/**
 * Verify OTP and sign in
 */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const otpRecord = await Otp.findOne({ email: normalizedEmail });
  if (!otpRecord || otpRecord.expiresAt < new Date()) {
    if (otpRecord) await Otp.deleteOne({ _id: otpRecord._id });
    throw ApiError.badRequest('Verification code has expired. Please request a new code.');
  }

  const isOtpValid = await bcrypt.compare(otp.trim(), otpRecord.otpHash);
  if (!isOtpValid) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({ _id: otpRecord._id });
      throw ApiError.badRequest('Too many failed attempts. Please request a new verification code.');
    }
    await otpRecord.save();
    throw ApiError.badRequest('Invalid verification code.');
  }

  await Otp.deleteOne({ _id: otpRecord._id });

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(404, 'No customer account found with this email. Please register.', [{ field: 'email', reason: 'USER_NOT_FOUND' }]);
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Account has been deactivated. Please contact support.');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return sendTokenResponse(user, 200, res, 'Signed in successfully!');
});

/**
 * Logout
 */
export const logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });

  return ApiResponse.success(res, null, 'Logged out successfully');
});

/**
 * Get Profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  let account = await Admin.findById(req.user._id).select('-password');
  if (!account) {
    account = await Staff.findById(req.user._id).select('-password');
  }
  if (!account) {
    account = await User.findById(req.user._id).select('-password');
  }

  return ApiResponse.success(res, { user: account }, 'Profile fetched successfully');
});

/**
 * Update Profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  let account = await Staff.findById(req.user._id);
  if (!account) {
    account = await User.findById(req.user._id);
  }

  if (!account) throw ApiError.notFound('Account not found');

  if (name) account.name = name;
  if (phone !== undefined) account.phone = phone;

  await account.save();

  const accountObj = account.toObject();
  delete accountObj.password;

  return ApiResponse.success(res, { user: accountObj }, 'Profile updated successfully');
});

/**
 * Add address (Customer only)
 */
export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('Customer not found');

  const { title, fullName, phone, street, city, state, pincode, country, isDefault } = req.body;

  if (isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  } else if (user.addresses.length === 0) {
    req.body.isDefault = true;
  }

  user.addresses.push({
    title: title || 'Home',
    fullName,
    phone,
    street,
    city,
    state,
    pincode,
    country: country || 'India',
    isDefault: req.body.isDefault,
  });

  await user.save();
  return ApiResponse.success(res, { addresses: user.addresses }, 'Address added successfully', 201);
});

/**
 * Update address (Customer only)
 */
export const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('Customer not found');

  const address = user.addresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  }

  Object.assign(address, req.body);
  await user.save();
  return ApiResponse.success(res, { addresses: user.addresses }, 'Address updated successfully');
});

/**
 * Delete address (Customer only)
 */
export const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('Customer not found');

  user.addresses.pull({ _id: addressId });
  await user.save();
  return ApiResponse.success(res, { addresses: user.addresses }, 'Address deleted successfully');
});

/**
 * Set password
 */
export const setPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  let account = await Staff.findById(req.user._id);
  if (!account) {
    account = await User.findById(req.user._id);
  }

  if (!account) throw ApiError.notFound('Account not found');

  account.password = password;
  account.authProvider = 'local';
  await account.save();

  const accountObj = account.toObject();
  delete accountObj.password;

  return ApiResponse.success(res, { user: accountObj }, 'Password set successfully');
});
