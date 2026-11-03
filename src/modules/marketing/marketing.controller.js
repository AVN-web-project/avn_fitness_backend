import AnnouncementStrip from '../../models/announcementStrip.model.js';

const allowedTypes = [
  'festive',
  'stock_clearance',
  'seasonal_sale',
  'special_offer',
  'custom',
];

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  return messages.map((item, index) => {
    if (!item || typeof item.message !== 'string' || !item.message.trim() || item.message.length > 240) {
      throw new Error(`Message ${index + 1} must be a non-empty string with a maximum of 240 characters`);
    }

    if (!allowedTypes.includes(item.type)) {
      throw new Error(`Invalid announcement type for message ${index + 1}`);
    }

    const startAt = item.startAt ? new Date(item.startAt) : null;
    const endAt = item.endAt ? new Date(item.endAt) : null;
    if ((startAt && Number.isNaN(startAt.getTime())) || (endAt && Number.isNaN(endAt.getTime()))) {
      throw new Error(`Invalid date for message ${index + 1}`);
    }
    if (startAt && endAt && startAt >= endAt) {
      throw new Error(`Message ${index + 1} must end after it starts`);
    }

    return {
      ...(item._id ? { _id: item._id } : {}),
      message: item.message.trim(),
      isEnabled: item.isEnabled !== false,
      type: item.type,
      order: Number.isInteger(Number(item.order)) && Number(item.order) >= 0 ? Number(item.order) : index,
      startAt,
      endAt,
    };
  });
};

export const getAnnouncementStrip = async (req, res, next) => {
  try {
    const announcementStrip = await AnnouncementStrip.findOne({
      key: 'storefront',
    }).lean();

    return res.status(200).json({
      success: true,
      announcementStrip: announcementStrip || {
        isEnabled: false,
        message: '',
        type: 'custom',
        messages: [],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncementStrip = async (req, res, next) => {
  try {
    const { isEnabled, message, type, messages } = req.body;
    const legacyMessage = typeof message === 'string' ? message.trim() : '';

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isEnabled must be a boolean',
      });
    }

    if (messages === undefined && (typeof message !== 'string' || message.length > 240)) {
      return res.status(400).json({
        success: false,
        message: 'Message must be a string with a maximum of 240 characters',
      });
    }

    if (messages === undefined && !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement type',
      });
    }

    let normalizedMessages;
    try {
      normalizedMessages = messages === undefined
        ? (message.trim() ? [{
          message: legacyMessage,
          type: type || 'custom',
          order: 0,
          startAt: null,
          endAt: null,
        }] : [])
        : normalizeMessages(messages);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    const announcementStrip = await AnnouncementStrip.findOneAndUpdate(
      { key: 'storefront' },
      {
        $set: {
          isEnabled,
          message: legacyMessage,
          type: type || 'custom',
          messages: normalizedMessages,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Announcement strip updated successfully',
      announcementStrip,
    });
  } catch (error) {
    next(error);
  }
};