import { Cart } from '../../models/cart.model.js';
import { Product } from '../../models/product.model.js';
import { Coupon } from '../../models/coupon.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PRODUCT_STATUS } from '../../config/constants.js';

/**
 * Helper to locate or instantiate a cart
 */
const findOrCreateCart = async (req) => {
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
  } else {
    const guestId = req.headers['x-guest-id'] || req.query.guestId;
    if (!guestId) {
      throw ApiError.badRequest('Either user authentication or x-guest-id header is required for cart operations.');
    }
    cart = await Cart.findOne({ guestId });
    if (!cart) {
      cart = await Cart.create({ guestId, items: [] });
    }
  }
  return cart;
};

/**
 * Calculate cart breakdown (subtotal, discounts, shipping, total)
 */
const calculateCartTotals = async (cart) => {
  await cart.populate({
    path: 'items.product',
    select: 'name slug images variants status',
  });

  let subtotal = 0;
  const verifiedItems = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
      continue; // Skip inactive/deleted products
    }

    const variant = product.variants.find((v) => v.sku === item.variantSku && v.isActive);
    if (!variant) {
      continue;
    }

    const itemPrice = variant.price;
    const itemSubtotal = itemPrice * item.quantity;
    subtotal += itemSubtotal;

    verifiedItems.push({
      _id: item._id,
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '',
      variantSku: variant.sku,
      variantTitle: variant.title,
      price: itemPrice,
      compareAtPrice: variant.compareAtPrice,
      quantity: item.quantity,
      stockAvailable: variant.stockQuantity,
      subtotal: itemSubtotal,
    });
  }

  let discount = 0;
  let appliedCoupon = null;

  if (cart.appliedCoupon && cart.appliedCoupon.code) {
    const coupon = await Coupon.findOne({ code: cart.appliedCoupon.code, isActive: true });
    if (coupon) {
      const validation = coupon.isValid(subtotal, cart.user);
      if (validation.valid) {
        if (coupon.discountType === 'percentage') {
          discount = (subtotal * coupon.discountValue) / 100;
          if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
            discount = coupon.maxDiscountAmount;
          }
        } else {
          discount = coupon.discountValue;
        }
        discount = Math.min(discount, subtotal);
        appliedCoupon = {
          code: coupon.code,
          discountAmount: Math.round(discount),
        };
      }
    }
  }

  // Free shipping over 999, else standard 99
  const shippingFee = subtotal >= 999 || subtotal === 0 ? 0 : 99;
  const totalPayable = Math.max(0, subtotal - discount + shippingFee);

  return {
    items: verifiedItems,
    billSummary: {
      subtotal,
      discount: Math.round(discount),
      shippingFee,
      totalPayable: Math.round(totalPayable),
    },
    appliedCoupon,
  };
};

export const getCart = asyncHandler(async (req, res) => {
  const cart = await findOrCreateCart(req);
  const cartDetails = await calculateCartTotals(cart);

  return ApiResponse.success(res, { cart: cartDetails, cartId: cart._id }, 'Cart retrieved successfully');
});

export const addToCart = asyncHandler(async (req, res) => {
  const { productId, variantSku, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
    throw ApiError.badRequest('This product is unavailable or discontinued.');
  }

  const variant = product.variants.find((v) => v.sku === variantSku && v.isActive);
  if (!variant) {
    throw ApiError.badRequest('Selected product variant does not exist.');
  }

  if (variant.stockQuantity < quantity) {
    throw ApiError.badRequest(`Insufficient stock. Only ${variant.stockQuantity} items available.`);
  }

  const cart = await findOrCreateCart(req);

  const existingItemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId && item.variantSku === variantSku
  );

  if (existingItemIndex > -1) {
    const newQty = cart.items[existingItemIndex].quantity + quantity;
    if (variant.stockQuantity < newQty) {
      throw ApiError.badRequest(`Cannot add more. Maximum available stock is ${variant.stockQuantity}.`);
    }
    cart.items[existingItemIndex].quantity = newQty;
  } else {
    cart.items.push({
      product: productId,
      variantSku,
      quantity,
      priceAtAddition: variant.price,
    });
  }

  cart.lastActiveAt = new Date();
  await cart.save();

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails }, 'Item added to cart', 200);
});

export const updateCartItemQuantity = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1) {
    throw ApiError.badRequest('Quantity must be at least 1.');
  }

  const cart = await findOrCreateCart(req);
  const item = cart.items.id(itemId);

  if (!item) {
    throw ApiError.notFound('Item not found in cart.');
  }

  const product = await Product.findById(item.product);
  const variant = product?.variants.find((v) => v.sku === item.variantSku);

  if (variant && variant.stockQuantity < quantity) {
    throw ApiError.badRequest(`Cannot update quantity. Only ${variant.stockQuantity} items in stock.`);
  }

  item.quantity = quantity;
  cart.lastActiveAt = new Date();
  await cart.save();

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails }, 'Cart quantity updated');
});

export const removeFromCart = asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const cart = await findOrCreateCart(req);
  cart.items.pull({ _id: itemId });
  cart.lastActiveAt = new Date();
  await cart.save();

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails }, 'Item removed from cart');
});

export const applyCoupon = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) throw ApiError.badRequest('Coupon code is required.');

  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
  if (!coupon) {
    throw ApiError.notFound('Invalid or inactive coupon code.');
  }

  const cart = await findOrCreateCart(req);
  const cartSummary = await calculateCartTotals(cart);

  const validation = coupon.isValid(cartSummary.billSummary.subtotal, cart.user);
  if (!validation.valid) {
    throw ApiError.badRequest(validation.reason);
  }

  cart.appliedCoupon = {
    code: coupon.code,
    couponId: coupon._id,
  };

  await cart.save();

  const updatedDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: updatedDetails }, `Coupon '${coupon.code}' applied successfully!`);
});

export const removeCoupon = asyncHandler(async (req, res) => {
  const cart = await findOrCreateCart(req);
  cart.appliedCoupon = { code: null, discountAmount: 0, couponId: null };
  await cart.save();

  const updatedDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: updatedDetails }, 'Coupon removed');
});
