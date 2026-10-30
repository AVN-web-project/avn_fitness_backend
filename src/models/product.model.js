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
    specifications: [
      {
        key: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true },
      },
    ],
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
  // The parent schema enables virtuals, but a sub-schema needs it too or the computed
  // savedAmount / discountPercent below never reach the API response.
  { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Money saved and the resulting price drop, derived once on the server so every client shows
// the same figure. Previously each frontend computed its own percentage from compareAtPrice,
// so a bad pair of prices produced a wrong badge with nothing to catch it.
variantSchema.virtual('savedAmount').get(function () {
  const price = Number(this.price) || 0;
  const compareAt = Number(this.compareAtPrice) || 0;
  if (compareAt <= price) return 0;
  return compareAt - price;
});

variantSchema.virtual('discountPercent').get(function () {
  const compareAt = Number(this.compareAtPrice) || 0;
  const saved = this.savedAmount;
  if (compareAt <= 0 || saved <= 0) return 0;
  return Math.round((saved / compareAt) * 100);
});

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    altText: { type: String, default: '', trim: true },
    isPrimary: { type: Boolean, default: false },
    // Variant subdocument _ids this image is shown for. Empty = shown for every variant.
    // Keyed on _id, not SKU: a subdocument _id never changes, so reformatting or renaming a SKU
    // cannot orphan the mapping the way a stored SKU string did.
    variantIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Variant _ids this image is the index-0 image for on the PDP. Deliberately separate from
    // isPrimary, which stays the single product-level thumbnail used by cards and cart lines.
    primaryForIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Legacy SKU-keyed mapping. Still accepted on write (the admin sends SKUs, which are resolved
    // against the same payload) and migrated into the id arrays below, then cleared.
    variantSkus: { type: [String], default: [] },
    primaryFor: { type: [String], default: [] },
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
    tagline: {
      type: String,
      default: '',
      trim: true,
    },
    badge: {
      type: String,
      default: '',
      trim: true,
    },
    imageLight: {
      type: String,
      default: '',
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
    gallery: [
      {
        id: { type: String },
        label: { type: String },
        image: { type: String },
        type: { type: String },
      },
    ],
    fullSpecs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sizeGuide: {
      chartUrl: { type: String, trim: true },
      instructions: { type: String, trim: true },
    },
    careInstructions: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
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

// Virtual for primary price across active variants
productSchema.virtual('price').get(function () {
  if (!this.variants || this.variants.length === 0) return 0;
  return this.variants[0].price || 0;
});

// The best price drop across purchasable variants — what a product card should advertise.
productSchema.virtual('priceDropPercent').get(function () {
  const variants = Array.isArray(this.variants) ? this.variants : [];
  return variants.reduce((best, v) => {
    if (v.isActive === false) return best;
    const pct = Number(v.discountPercent) || 0;
    return pct > best ? pct : best;
  }, 0);
});

// Virtual for compare-at price
productSchema.virtual('compareAtPrice').get(function () {
  if (!this.variants || this.variants.length === 0) return 0;
  return this.variants[0].compareAtPrice || 0;
});

// Virtual for primary image URL (avoids storing duplicate image field in MongoDB)
productSchema.virtual('image').get(function () {
  const primary = this.images?.find((img) => img.isPrimary);
  return primary ? primary.url : (this.images?.[0]?.url || '');
});

/**
 * Resolves image→variant mappings to subdocument _ids and enforces at most one explicit primary
 * per variant, at the database boundary.
 *
 * Incoming arrays may hold _ids (new data), SKUs (the admin sends SKUs, and legacy documents hold
 * them), or a mix. Both are resolved against this document's own variants, so a SKU reformat is a
 * non-event: the ids stay put.
 *
 * First claim wins for duplicate explicit primaries. Variants without an explicit primary remain
 * unassigned so saving cannot silently broaden a shared image's primary mapping.
 */
productSchema.pre('save', function enforceVariantPrimaries(next) {
  const images = Array.isArray(this.images) ? this.images : [];
  if (images.length === 0) return next();

  let globalPrimaryAssigned = false;
  images.forEach((img) => {
    img.isPrimary = !!img.isPrimary && !globalPrimaryAssigned;
    if (img.isPrimary) globalPrimaryAssigned = true;
  });

  const variants = Array.isArray(this.variants) ? this.variants : [];
  const idOf = (x) => String(x || '').trim();

  const idBySku = new Map();
  const validIds = new Set();
  variants.forEach((v) => {
    const id = idOf(v?._id);
    if (!id) return;
    validIds.add(id);
    const sku = String(v?.sku || '').trim().toUpperCase();
    if (sku) idBySku.set(sku, id);
  });

  const resolve = (ids, skus) => {
    const out = [
      ...(Array.isArray(ids) ? ids.map(idOf) : []),
      ...(Array.isArray(skus) ? skus.map((x) => idBySku.get(String(x || '').trim().toUpperCase())) : []),
    ].filter((x) => x && validIds.has(x));
    return [...new Set(out)];
  };

  const claimed = new Set();

  images.forEach((img) => {
    img.variantIds = resolve(img.variantIds, img.variantSkus);

    // An explicit primary also makes the image visible for that variant. Do not invent primary
    // assignments for variants that have no explicit selection.
    const explicitPrimaryIds = resolve(img.primaryForIds, img.primaryFor)
      .filter((id) => !claimed.has(id));
    img.variantIds = [...new Set([...(img.variantIds || []), ...explicitPrimaryIds])];
    img.primaryForIds = explicitPrimaryIds;
    img.primaryForIds.forEach((id) => claimed.add(id));

    img.variantSkus = [];
    img.primaryFor = [];
  });

  return next();
});

export const Product = mongoose.model('Product', productSchema);
