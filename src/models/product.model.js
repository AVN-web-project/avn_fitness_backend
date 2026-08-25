import mongoose from 'mongoose';
import {
  AGE_GROUPS,
  ALL_PRODUCT_STATUSES,
  GENDERS,
  PRODUCT_STATUS,
} from '../config/constants.js';

const variantSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'Variant SKU is required'],
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: [true, 'Variant title is required (e.g. Medium / Black / 20kg)'],
      trim: true,
    },
    size: {
      type: String,
      trim: true, // S, M, L, XL, XXL, Free Size
    },
    color: {
      type: String,
      trim: true,
    },
    resistanceLevel: {
      type: String,
      trim: true, // Light, Medium, Heavy, Extra Heavy, 10-20 lbs
    },
    weight: {
      type: String,
      trim: true, // 1kg, 2.5kg, 5kg, 10kg
    },
    packQuantity: {
      type: Number,
      default: 1, // Single, Pack of 2, Set of 5
    },
    price: {
      type: Number,
      required: [true, 'Variant price is required'],
      min: [0, 'Price must be positive'],
    },
    compareAtPrice: {
      type: Number,
      default: 0,
      min: [0, 'Compare-at price must be positive'],
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    altText: { type: String, default: '', trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    ageGroup: {
      type: String,
      enum: Object.values(AGE_GROUPS),
      default: AGE_GROUPS.ALL,
    },
    gender: {
      type: String,
      enum: Object.values(GENDERS),
      default: GENDERS.UNISEX,
    },
    status: {
      type: String,
      enum: ALL_PRODUCT_STATUSES,
      default: PRODUCT_STATUS.ACTIVE,
      required: true,
    },
    images: [productImageSchema],
    specifications: [
      {
        key: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true },
      },
    ],
    sizeGuide: {
      chartUrl: { type: String, trim: true },
      instructions: { type: String, trim: true },
    },
    careInstructions: {
      type: String,
      trim: true,
    },
    variants: {
      type: [variantSchema],
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        'A product must have at least one variant/SKU.',
      ],
    },
    ratingsAverage: {
      type: Number,
      default: 0,
      min: [0, 'Rating must be at least 0'],
      max: [5, 'Rating cannot exceed 5'],
      set: (val) => Math.round(val * 10) / 10,
    },
    ratingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    relatedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for high performance filtering & searching
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ status: 1, ratingsAverage: -1 });
productSchema.index({ 'variants.price': 1, status: 1 });
productSchema.index({ 'variants.sku': 1 });

// Virtual for min and max price across active variants
productSchema.virtual('priceRange').get(function () {
  if (!this.variants || this.variants.length === 0) return { min: 0, max: 0 };
  const prices = this.variants.filter((v) => v.isActive).map((v) => v.price);
  if (prices.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
});

// Total stock across all variants
productSchema.virtual('totalStock').get(function () {
  if (!this.variants || this.variants.length === 0) return 0;
  return this.variants.reduce((acc, v) => (v.isActive ? acc + (v.stockQuantity || 0) : acc), 0);
});

export const Product = mongoose.model('Product', productSchema);
