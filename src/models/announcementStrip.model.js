import mongoose from 'mongoose';

const announcementMessageSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      trim: true,
      maxlength: 240,
      required: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
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
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    startAt: {
      type: Date,
      default: null,
    },
    endAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

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
    messages: {
      type: [announcementMessageSchema],
      default: [],
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