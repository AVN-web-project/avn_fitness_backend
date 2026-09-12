import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/user.model.js';
import { Staff } from '../models/staff.model.js';
import { Admin } from '../models/admin.model.js';
import { ROLES, ROLE_PERMISSIONS } from '../config/constants.js';

const getJwtSecret = () => env.JWT?.SECRET || env.JWT_SECRET || 'super_secret_jwt_key_fitness_gear_2026_dev_mode';

/**
 * Extract token from Authorization header or HTTP-only cookies
 */
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.cookies && (req.cookies.token || req.cookies.admin_token)) {
    return req.cookies.token || req.cookies.admin_token;
  }
  return null;
};

/**
 * Require Authenticated User, Staff, or Admin Middleware
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthorized('Authentication token required. Please log in to proceed.');
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const accountId = decoded.id || decoded._id;

    // Check Admin, Staff, or User based on token
    let account = null;
    let isSuperAdmin = false;

    if (decoded.isAdmin) {
      account = await Admin.findById(accountId).select('-password');
    }
    if (!account && decoded.isStaff) {
      account = await Staff.findById(accountId).select('-password');
    }
    if (!account) {
      account = await Admin.findById(accountId).select('-password');
    }
    if (!account) {
      account = await Staff.findById(accountId).select('-password');
    }
    if (!account) {
      account = await User.findById(accountId).select('-password');
    }

    if (!account) {
      throw ApiError.unauthorized('Account associated with this token no longer exists.');
    }

    if (account.isActive === false) {
      throw ApiError.forbidden('Your account has been deactivated. Please contact administrator.');
    }

    isSuperAdmin = account.role === 'super_admin';

    req.user = account;
    req.admin = {
      _id: account._id,
      email: account.email,
      name: account.name,
      role: account.role,
      isSuperAdmin: isSuperAdmin || account.role === 'super_admin',
      customPermissions: account.customPermissions || account.permissions || [],
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw ApiError.unauthorized('Invalid authentication token.');
    }
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Authentication token has expired. Please log in again.');
    }
    throw error;
  }
});

// Alias for authenticateAdmin
export const authenticateAdmin = requireAuth;

/**
 * Optional Authentication Middleware
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    req.admin = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const accountId = decoded.id || decoded._id;
    let account = await User.findById(accountId).select('-password');
    if (!account) {
      account = await Staff.findById(accountId).select('-password');
    }
    if (!account) {
      account = await Admin.findById(accountId).select('-password');
    }
    if (account && account.isActive !== false) {
      req.user = account;
      req.admin = account;
    } else {
      req.user = null;
      req.admin = null;
    }
  } catch (err) {
    req.user = null;
    req.admin = null;
  }

  next();
});

/**
 * Require Role Middleware (RBAC)
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.admin?.role;
    if (!userRole) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    // Super Admin or Admin has fallback access to all capabilities
    if (userRole === ROLES.ADMIN || userRole === 'super_admin' || req.admin?.isSuperAdmin) {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      return next(
        ApiError.forbidden(
          `Access restricted: requires one of the following roles: [${allowedRoles.join(', ')}]`
        )
      );
    }

    next();
  };
};

/**
 * Require Granular Permission Check
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    const admin = req.admin || req.user;
    if (!admin) {
      return next(ApiError.unauthorized('Unauthenticated request'));
    }

    // Super Admin or Admin bypasses all checks
    if (admin.isSuperAdmin || admin.role === 'super_admin' || admin.role === ROLES.ADMIN) {
      return next();
    }

    const rolePerms = ROLE_PERMISSIONS[admin.role] || [];
    const effectivePermissions = new Set([
      ...rolePerms,
      ...(admin.customPermissions || admin.permissions || []),
    ]);

    if (!effectivePermissions.has(permission) && !effectivePermissions.has('*')) {
      return next(
        ApiError.forbidden(`Forbidden: Missing permission [${permission}] for role [${admin.role}]`)
      );
    }

    next();
  };
};

/**
 * Require Any Permission (OR logic)
 */
export const requireAnyPermission = (permissions = []) => {
  return (req, res, next) => {
    const admin = req.admin || req.user;
    if (!admin) {
      return next(ApiError.unauthorized('Unauthenticated request'));
    }

    if (admin.isSuperAdmin || admin.role === 'super_admin' || admin.role === ROLES.ADMIN) {
      return next();
    }

    const rolePerms = ROLE_PERMISSIONS[admin.role] || [];
    const effectivePermissions = new Set([
      ...rolePerms,
      ...(admin.customPermissions || admin.permissions || []),
    ]);

    const hasAccess =
      effectivePermissions.has('*') ||
      permissions.some((perm) => effectivePermissions.has(perm));

    if (!hasAccess) {
      return next(ApiError.forbidden('Forbidden: Insufficient role permissions'));
    }

    next();
  };
};
