import mongoose from 'mongoose';

const announcementStripSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'storefront',
      unique: true,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 240,
      default: '',
    },
    type: {
      type: String,
      enum: [
        'festive',
        'stock_clearance',
        'seasonal_sale',
        'special_offer',
        'custom',
      ],
      default: 'custom',
    },
  },
  { timestamps: true }
);

const AnnouncementStrip = mongoose.model(
  'AnnouncementStrip',
  announcementStripSchema
);

export default AnnouncementStrip;