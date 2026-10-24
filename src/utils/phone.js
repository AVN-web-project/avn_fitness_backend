/**
 * Indian mobile numbers — ten digits, starting 6-9.
 *
 * People type these in several ways: "9876543210", "+91 98765 43210", "098765 43210".
 * Rather than reject a correct number for its formatting, normalise it first and then
 * validate the digits. Anything that cannot be reduced to ten digits is rejected.
 */

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/** Indian pincodes: six digits, first is 1-9 (0 is not a valid leading digit). */
export const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Reduce a typed phone number to ten digits.
 * Strips spaces, dashes and brackets, then drops a country code (91) or trunk prefix (0)
 * — but only when exactly ten digits remain, so a genuine number is never mangled.
 */
export const normalizePhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^(?:91|0)(?=\d{10}$)/, '');
};

export const isValidPhone = (value) => INDIAN_MOBILE_REGEX.test(normalizePhone(value));
