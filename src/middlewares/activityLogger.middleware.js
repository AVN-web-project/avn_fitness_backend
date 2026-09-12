import { ActivityLog } from '../models/activityLog.model.js';
import { logger } from '../config/logger.js';
import { LOG_DOMAINS, ACTIVITY_ACTIONS, ENTITY_TYPES } from '../config/constants.js';

const inferDomain = (action, targetEntity) => {
  if (action === ACTIVITY_ACTIONS.INVENTORY_UPDATED) return LOG_DOMAINS.INVENTORY;
  if (targetEntity === ENTITY_TYPES.CATEGORY) return LOG_DOMAINS.CATEGORIES;
  if (targetEntity === ENTITY_TYPES.PRODUCT) return LOG_DOMAINS.PRODUCTS;
  if (targetEntity === ENTITY_TYPES.ORDER) return LOG_DOMAINS.ORDERS;
  if (targetEntity === ENTITY_TYPES.COUPON) return LOG_DOMAINS.COUPONS;
  if (targetEntity === ENTITY_TYPES.REVIEW) return LOG_DOMAINS.REVIEWS;
  if (targetEntity === ENTITY_TYPES.SUPPORT_REQUEST) return LOG_DOMAINS.CUSTOMER_SUPPORT;
  if (targetEntity === ENTITY_TYPES.USER) return LOG_DOMAINS.STAFF;
  return LOG_DOMAINS.SYSTEM;
};

/**
 * Record an activity audit log entry
 */
export const recordActivityLog = async ({
  user,
  action,
  targetEntity,
  targetEntityId = null,
  domain,
  details = {},
  ipAddress = '',
}) => {
  try {
    if (!user) return null;

    const assignedDomain = domain || inferDomain(action, targetEntity);

    const log = await ActivityLog.create({
      user: user._id,
      userName: user.name,
      userRole: user.role,
      domain: assignedDomain,
      action,
      targetEntity,
      targetEntityId: targetEntityId ? String(targetEntityId) : null,
      details,
      ipAddress,
    });

    return log;
  } catch (error) {
    logger.error(`Failed to record activity log: ${error.message}`, { action, targetEntity });
    return null;
  }
};
