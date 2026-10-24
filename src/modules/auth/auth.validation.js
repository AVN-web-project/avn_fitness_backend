import { z } from 'zod';
import { normalizePhone, INDIAN_MOBILE_REGEX, INDIAN_PINCODE_REGEX } from '../../utils/phone.js';
import { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from '../../utils/disposableEmail.js';

const permanentEmail = z
  .string()
  .email('Invalid email address')
  .refine((value) => !isDisposableEmail(value), {
    message: DISPOSABLE_EMAIL_MESSAGE,
  });

// A mobile number is normalised before it is validated, so "+91 98765 43210",
// "098765 43210" and "9876543210" all pass and are stored as "9876543210".
const indianPhone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((value) => INDIAN_MOBILE_REGEX.test(value), 'Enter a valid 10-digit mobile number');

const indianPincode = z
  .string()
  .trim()
  .regex(INDIAN_PINCODE_REGEX, 'Enter a valid 6-digit pincode');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: permanentEmail,
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    phone: indianPhone.optional(),
    otp: z.string().min(6, 'Verification code must be 6 digits').max(6, 'Verification code must be 6 digits'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const sendOtpSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address'),
      purpose: z.enum(['login', 'register']).optional(),
    })
    // Block disposable addresses only for sign-up. Login OTP is left alone so an
    // existing account is never locked out by a stricter rule added later.
    .refine((data) => data.purpose !== 'register' || !isDisposableEmail(data.email), {
      path: ['email'],
      message: DISPOSABLE_EMAIL_MESSAGE,
    }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().min(6, 'Verification code must be 6 digits').max(6, 'Verification code must be 6 digits'),
  }),
});

export const addressSchema = z.object({
  body: z.object({
    title: z.string().optional().default('Home'),
    fullName: z.string().min(2, 'Full name is required'),
    phone: indianPhone,
    street: z.string().min(5, 'Street address is required'),
    city: z.string().min(2, 'City is required'),
    state: z.string().min(2, 'State is required'),
    pincode: indianPincode,
    country: z.string().optional().default('India'),
    isDefault: z.boolean().optional().default(false),
  }),
});

export const setPasswordSchema = z.object({
  body: z.object({
    password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    portal: z.enum(['storefront', 'admin']).optional(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    token: z.string().min(10, 'Reset token is missing or invalid'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(100),
    portal: z.enum(['storefront', 'admin']).optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Please enter your current password'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters').max(100),
  }),
});
