import crypto from 'crypto';
import bcrypt from 'bcrypt';

import { User } from '../../models/user.model.js';
import { Otp } from '../../models/otp.model.js';
import { sendOtpEmail } from '../../utils/email.service.js';
import { ApiError } from '../../utils/apiError.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { ROLES } from '../../config/constants.js';

const sendTokenResponse = (user, statusCode, res, message) => {
  const token = user.generateAuthToken();

  const cookieOptions = {
    expires: new Date(
      Date.now() + env.JWT.COOKIE_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;

  return res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json(
      new ApiResponse(
        statusCode,
        { user: userObj, token },
        message
      )
    );
};

/**
 * Register a new user
 * Requires a valid email OTP
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, otp } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  // Check whether account already exists
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw ApiError.conflict(
      'An account with this email already exists.'
    );
  }

  // Find OTP record
  const otpRecord = await Otp.findOne({
    email: normalizedEmail,
  });

  if (!otpRecord) {
    throw ApiError.badRequest(
      'Verification code has expired or was not requested. Please request a new code.'
    );
  }

  // Check expiration
  if (otpRecord.expiresAt < new Date()) {
    await Otp.deleteOne({
      _id: otpRecord._id,
    });

    throw ApiError.badRequest(
      'Verification code has expired. Please request a new code.'
    );
  }

  // Compare entered OTP against bcrypt hash
  const isOtpValid = await bcrypt.compare(
    otp.trim(),
    otpRecord.otpHash
  );

  if (!isOtpValid) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;

    // Maximum 5 attempts
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({
        _id: otpRecord._id,
      });

      throw ApiError.badRequest(
        'Too many failed attempts. Please request a new verification code.'
      );
    }

    await otpRecord.save();

    throw ApiError.badRequest(
      'Invalid verification code. Please check and try again.'
    );
  }

  // OTP is valid — delete it so it cannot be reused
  await Otp.deleteOne({
    _id: otpRecord._id,
  });

  // Create user
  const user = await User.create({
    name,
    email: normalizedEmail,
    password: password || undefined,
    phone,
    authProvider: password ? 'local' : 'otp',
    role: ROLES.USER,
  });

  return sendTokenResponse(
    user,
    201,
    res,
    'Registration successful'
  );
});

/**
 * Login using email + password
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase(),
  }).select('+password');

  if (!user) {
    throw new ApiError(
      404,
      'No account found with this email.',
      [
        {
          field: 'email',
          reason: 'USER_NOT_FOUND',
        },
      ]
    );
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw ApiError.unauthorized(
      'Invalid email or password.'
    );
  }

  if (!user.isActive) {
    throw ApiError.forbidden(
      'Account has been deactivated. Please contact support.'
    );
  }

  user.lastLoginAt = new Date();

  await user.save({
    validateBeforeSave: false,
  });

  return sendTokenResponse(
    user,
    200,
    res,
    'Login successful'
  );
});

/**
 * Send 6-digit OTP code to email
 */
export const sendOtp = asyncHandler(async (req, res) => {
  const {
    email,
    purpose = 'login',
  } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  // Registration OTP
  if (purpose === 'register') {
    if (existingUser) {
      throw ApiError.conflict(
        'An account with this email already exists. Please sign in.'
      );
    }
  }

  // Login OTP
  else if (purpose === 'login') {
    if (!existingUser) {
      throw new ApiError(
        404,
        'No account found with this email.',
        [
          {
            field: 'email',
            reason: 'USER_NOT_FOUND',
          },
        ]
      );
    }
  }

  // Generate secure 6-digit OTP
  const otp = crypto
    .randomInt(100000, 1000000)
    .toString();

  // OTP expires after 5 minutes
  const expiresAt = new Date(
    Date.now() + 5 * 60 * 1000
  );

  // Store only the bcrypt hash
  const otpHash = await bcrypt.hash(
    otp,
    10
  );

  await Otp.findOneAndUpdate(
    {
      email: normalizedEmail,
    },
    {
      otpHash,
      attempts: 0,
      expiresAt,
    },
    {
      upsert: true,
      new: true,
    }
  );

  // Send original OTP to email
  // The original OTP is never stored in MongoDB.
  await sendOtpEmail(
    normalizedEmail,
    otp
  );

  const responseData = {
    email: normalizedEmail,
    expiresIn: 300,
  };

  if (env.NODE_ENV === 'development') {
    responseData.devOtp = otp;
  }

  return ApiResponse.success(
    res,
    responseData,
    'Verification code sent successfully.'
  );
});

/**
 * Verify 6-digit OTP code and sign in
 */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  const otpRecord = await Otp.findOne({
    email: normalizedEmail,
  });

  if (!otpRecord) {
    throw ApiError.badRequest(
      'Verification code has expired or was not requested. Please request a new code.'
    );
  }

  // Check expiration
  if (otpRecord.expiresAt < new Date()) {
    await Otp.deleteOne({
      _id: otpRecord._id,
    });

    throw ApiError.badRequest(
      'Verification code has expired. Please request a new code.'
    );
  }

  // Compare OTP with bcrypt hash
  const isOtpValid = await bcrypt.compare(
    otp.trim(),
    otpRecord.otpHash
  );

  if (!isOtpValid) {
    otpRecord.attempts =
      (otpRecord.attempts || 0) + 1;

    // Maximum 5 attempts
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({
        _id: otpRecord._id,
      });

      throw ApiError.badRequest(
        'Too many failed attempts. Please request a new verification code.'
      );
    }

    await otpRecord.save();

    throw ApiError.badRequest(
      'Invalid verification code. Please check and try again.'
    );
  }

  // OTP verified — delete it so it cannot be reused
  await Otp.deleteOne({
    _id: otpRecord._id,
  });

  // Find existing user
  const user = await User.findOne({
    email: normalizedEmail,
  });

  if (!user) {
    throw new ApiError(
      404,
      'No account found with this email. Please create an account.',
      [
        {
          field: 'email',
          reason: 'USER_NOT_FOUND',
        },
      ]
    );
  }

  if (!user.isActive) {
    throw ApiError.forbidden(
      'Account has been deactivated. Please contact support.'
    );
  }

  user.lastLoginAt = new Date();

  await user.save({
    validateBeforeSave: false,
  });

  return sendTokenResponse(
    user,
    200,
    res,
    'Signed in successfully!'
  );
});

/**
 * Logout
 */
export const logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(
      Date.now() + 5 * 1000
    ),
    httpOnly: true,
  });

  return ApiResponse.success(
    res,
    null,
    'Logged out successfully'
  );
});

/**
 * Get user profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(
    req.user._id
  );

  return ApiResponse.success(
    res,
    { user },
    'User profile fetched successfully'
  );
});

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  const user = await User.findById(
    req.user._id
  );

  if (!user) {
    throw ApiError.notFound(
      'User not found'
    );
  }

  if (name) {
    user.name = name;
  }

  if (phone !== undefined) {
    user.phone = phone;
  }

  await user.save();

  return ApiResponse.success(
    res,
    { user },
    'Profile updated successfully'
  );
});

/**
 * Add address
 */
export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(
    req.user._id
  );

  if (!user) {
    throw ApiError.notFound(
      'User not found'
    );
  }

  const {
    title,
    fullName,
    phone,
    street,
    city,
    state,
    pincode,
    country,
    isDefault,
  } = req.body;

  if (isDefault) {
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });
  } else if (user.addresses.length === 0) {
    // First address becomes default
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

  return ApiResponse.success(
    res,
    {
      addresses: user.addresses,
    },
    'Address added successfully',
    201
  );
});

/**
 * Update address
 */
export const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;

  const user = await User.findById(
    req.user._id
  );

  if (!user) {
    throw ApiError.notFound(
      'User not found'
    );
  }

  const address = user.addresses.id(
    addressId
  );

  if (!address) {
    throw ApiError.notFound(
      'Address not found'
    );
  }

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });
  }

  Object.assign(
    address,
    req.body
  );

  await user.save();

  return ApiResponse.success(
    res,
    {
      addresses: user.addresses,
    },
    'Address updated successfully'
  );
});

/**
 * Delete address
 */
export const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;

  const user = await User.findById(
    req.user._id
  );

  if (!user) {
    throw ApiError.notFound(
      'User not found'
    );
  }

  user.addresses.pull({
    _id: addressId,
  });

  await user.save();

  return ApiResponse.success(
    res,
    {
      addresses: user.addresses,
    },
    'Address deleted successfully'
  );
});

/**
 * Set password for authenticated user (e.g. after passwordless OTP registration)
 */
export const setPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.password = password;
  user.authProvider = 'local';
  await user.save();

  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;

  return ApiResponse.success(
    res,
    { user: userObj },
    'Password set successfully'
  );
});