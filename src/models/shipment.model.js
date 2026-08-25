import mongoose from 'mongoose';
import { SHIPMENT_STATUS } from '../config/constants.js';

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    carrier: {
      type: String,
      required: [true, 'Carrier name is required (e.g. Blue Dart, Delhivery, DTDC)'],
      trim: true,
    },
    trackingNumber: {
      type: String,
      required: [true, 'Tracking number is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(SHIPMENT_STATUS),
      default: SHIPMENT_STATUS.SHIPPED,
    },
    dispatchedAt: {
      type: Date,
      default: Date.now,
    },
    estimatedDeliveryDate: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    trackingHistory: [trackingEventSchema],
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Shipment = mongoose.model('Shipment', shipmentSchema);
