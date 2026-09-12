import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    variantTitle: {
      type: String,
      default: 'Standard',
      trim: true,
    },
    size: {
      type: String,
      default: 'Standard',
      trim: true,
    },
    color: {
      type: String,
      default: 'Standard',
      trim: true,
    },
    stockQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    price: {
      type: Number,
      default: 0,
    },
    lastRestockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index({ sku: 1, stockQuantity: 1 });
inventorySchema.index({ product: 1 });

export const Inventory = mongoose.model('Inventory', inventorySchema, 'inventory_m');
