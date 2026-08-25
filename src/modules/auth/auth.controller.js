import { User } from '../../models/user.model.js';
import { ApiError } from '../../utils/apiError.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { ROLES } from '../../config/constants.js';

const sendTokenResponse = (user, statusCode, res, message) => {
  const token = user.generateAuthToken();

  const cookieOptions = {
    expires: new Date(Date.now() + env.JWT.COOKIE_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
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
      new ApiResponse(statusCode, { user: userObj, token }, message)
    );
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    phone,
    role: ROLES.USER, // Public registration strictly assigns User role
  });

  return sendTokenResponse(user, 201, res, 'Registration successful');
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Account has been deactivated. Please contact support.');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return sendTokenResponse(user, 200, res, 'Login successful');
});

export const logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });

  return ApiResponse.success(res, null, 'Logged out successfully');
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  return ApiResponse.success(res, { user }, 'User profile fetched successfully');
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;

  await user.save();

  return ApiResponse.success(res, { user }, 'Profile updated successfully');
});

export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('User not found');

  const { title, fullName, phone, street, city, state, pincode, country, isDefault } = req.body;

  if (isDefault) {
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });
  } else if (user.addresses.length === 0) {
    // First address is default
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

export const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('User not found');

  const address = user.addresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });
  }

  Object.assign(address, req.body);
  await user.save();

  return ApiResponse.success(res, { addresses: user.addresses }, 'Address updated successfully');
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('User not found');

  user.addresses.pull({ _id: addressId });
  await user.save();

  return ApiResponse.success(res, { addresses: user.addresses }, 'Address deleted successfully');
});
