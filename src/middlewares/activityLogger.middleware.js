import { ActivityLog } from '../models/activityLog.model.js';
import { logger } from '../config/logger.js';

/**
 * Record an activity audit log entry
 * @param {Object} params
 * @param {Object} params.user - Authenticated user object (Admin or Operations)
 * @param {String} params.action - Action identifier from ACTIVITY_ACTIONS
 * @param {String} params.targetEntity - Entity type from ENTITY_TYPES
 * @param {String|mongoose.Types.ObjectId} [params.targetEntityId] - Target ID
 * @param {Object} [params.details] - Details payload
 * @param {String} [params.ipAddress] - Request IP address
 */
export const recordActivityLog = async ({
  user,
  action,
  targetEntity,
  targetEntityId = null,
  details = {},
  ipAddress = '',
}) => {
  try {
    if (!user) return null;

    const log = await ActivityLog.create({
      user: user._id,
      userName: user.name,
      userRole: user.role,
      action,
      targetEntity,
      targetEntityId: targetEntityId ? String(targetEntityId) : null,
      details,
      ipAddress,
    });

    return log;
  } catch (error) {
    logger.error(`Failed to record activity log: ${error.message}`, { action, targetEntity });
    // Non-blocking for primary request flow
    return null;
  }
};
