import AnnouncementStrip from '../../models/announcementStrip.model.js';

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
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncementStrip = async (req, res, next) => {
  try {
    const { isEnabled, message, type } = req.body;

    const allowedTypes = [
      'festive',
      'stock_clearance',
      'seasonal_sale',
      'special_offer',
      'custom',
    ];

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isEnabled must be a boolean',
      });
    }

    if (typeof message !== 'string' || message.length > 240) {
      return res.status(400).json({
        success: false,
        message: 'Message must be a string with a maximum of 240 characters',
      });
    }

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement type',
      });
    }

    const announcementStrip = await AnnouncementStrip.findOneAndUpdate(
      { key: 'storefront' },
      {
        $set: {
          isEnabled,
          message: message.trim(),
          type,
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