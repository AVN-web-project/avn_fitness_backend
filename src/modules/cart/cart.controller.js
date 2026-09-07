import mongoose from 'mongoose';
import { Cart } from '../../models/cart.model.js';
import { Product } from '../../models/product.model.js';
import { Coupon } from '../../models/coupon.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { PRODUCT_STATUS } from '../../config/constants.js';

/**
 * Helper to locate or instantiate a cart for authenticated users or active guests.
 * When createIfNotFound is false (e.g. for getCart), it will NOT persist empty documents in MongoDB.
 */
const findOrCreateCart = async (req, { createIfNotFound = true } = {}) => {
  if (req.user) {
    let cart = await Cart.findOne({ user: req.user._id });

    // Always check if guest cart exists with guestId to merge into authenticated cart
    const guestId = req.headers['x-guest-id'] || req.query?.guestId || req.body?.guestId;
    if (guestId) {
      const guestCart = await Cart.findOne({ guestId, user: null });
      if (guestCart) {
        if (Array.isArray(guestCart.items) && guestCart.items.length > 0) {
          if (!cart) {
            cart = await Cart.create({ user: req.user._id, items: [] });
          }
          for (const gItem of guestCart.items) {
            const existingIndex = cart.items.findIndex(
              (i) => i.product.toString() === gItem.product.toString() && i.variantSku === gItem.variantSku
            );
            if (existingIndex > -1) {
              cart.items[existingIndex].quantity += gItem.quantity;
            } else {
              cart.items.push({
                product: gItem.product,
                variantSku: gItem.variantSku,
                quantity: gItem.quantity,
                priceAtAddition: gItem.priceAtAddition,
              });
            }
          }
          await cart.save();
        }
        // Atomic cleanup: remove guest cart so it doesn't linger in MongoDB
        await Cart.deleteOne({ _id: guestCart._id });
      }
    }

    if (!cart && createIfNotFound) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
    return cart;
  }

  // Unauthenticated guests: only persist in MongoDB when actively adding items
  let guestId = req.headers['x-guest-id'] || req.query?.guestId || req.body?.guestId;
  if (!guestId) {
    if (!createIfNotFound) return null;
    guestId = `gst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  let cart = await Cart.findOne({ guestId });
  if (!cart && createIfNotFound) {
    cart = await Cart.create({ guestId, user: null, items: [] });
  }
  return cart;
};

/**
 * Calculate cart breakdown (subtotal, discounts, shipping, total)
 */
const calculateCartTotals = async (cart) => {
  let subtotal = 0;
  const verifiedItems = [];

  for (const item of cart.items) {
    let product = item.product;
    if (!product || !product.variants) {
      product = await Product.findById(item.product).select('name slug images variants status');
    }
    if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
      continue;
    }

    const variant = product.variants.find((v) => v.sku === item.variantSku && v.isActive);
    if (!variant) {
      continue;
    }

    const itemPrice = variant.price;
    const itemSubtotal = itemPrice * item.quantity;
    subtotal += itemSubtotal;

    verifiedItems.push({
      _id: item._id || variant.sku,
      id: item._id || variant.sku,
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.find((i) => i.isPrimary)?.url || product.images?.[0]?.url || '',
      variantSku: variant.sku,
      variantTitle: variant.title,
      selectedSize: variant.size || 'Standard',
      selectedColor: variant.color || 'Crimson Red',
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
  const cart = await findOrCreateCart(req, { createIfNotFound: false });
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    if (cart) {
      await Cart.deleteOne({ _id: cart._id });
    }
    return ApiResponse.success(
      res,
      {
        cart: {
          items: [],
          billSummary: { subtotal: 0, discount: 0, shippingFee: 0, totalPayable: 0 },
          appliedCoupon: null,
        },
        cartId: null,
      },
      'Cart retrieved successfully'
    );
  }

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails, cartId: cart._id }, 'Cart retrieved successfully');
});

export const addToCart = asyncHandler(async (req, res) => {
  const { productId, variantSku, selectedSize, selectedColor, quantity = 1 } = req.body;

  if (!productId) {
    throw ApiError.badRequest('Product ID is required.');
  }

  // Resolve product by ObjectId or slug
  const product = await Product.findOne({
    $or: [
      { _id: productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null },
      { slug: productId },
    ],
  });
  if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
    throw ApiError.badRequest('This product is unavailable or discontinued.');
  }

  // 1. Direct SKU match if provided
  let variant = variantSku ? product.variants.find((v) => v.sku === variantSku && v.isActive) : null;

  // 2. Fallback: Match by size & color attributes
  if (!variant && (selectedSize || selectedColor)) {
    variant = product.variants.find(
      (v) =>
        (!selectedSize || v.size === selectedSize || v.title?.includes(selectedSize)) &&
        (!selectedColor || v.color === selectedColor || v.title?.includes(selectedColor)) &&
        v.isActive
    );
  }

  // 3. Fallback: First active variant
  if (!variant) {
    variant = product.variants.find((v) => v.isActive) || product.variants[0];
  }

  if (!variant) {
    throw ApiError.badRequest('No active variant available for this product.');
  }

  const parsedQty = Math.max(1, Number(quantity) || 1);
  if (variant.stockQuantity < parsedQty) {
    throw ApiError.badRequest(`Insufficient stock. Only ${variant.stockQuantity} items available.`);
  }

  const cart = await findOrCreateCart(req);

  const existingItemIndex = cart.items.findIndex(
    (item) => item.product.toString() === product._id.toString() && item.variantSku === variant.sku
  );

  if (existingItemIndex > -1) {
    const newQty = cart.items[existingItemIndex].quantity + parsedQty;
    if (variant.stockQuantity < newQty) {
      throw ApiError.badRequest(`Cannot add more. Maximum available stock is ${variant.stockQuantity}.`);
    }
    cart.items[existingItemIndex].quantity = newQty;
  } else {
    cart.items.push({
      product: product._id,
      variantSku: variant.sku,
      quantity: parsedQty,
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

  const parsedQty = Math.max(1, Number(quantity) || 1);

  const cart = await findOrCreateCart(req);

  // Find item by subdocument _id, product _id, or variantSku
  const item =
    (cart.items.id && cart.items.id(itemId)) ||
    cart.items.find(
      (i) =>
        (i._id && i._id.toString() === itemId) ||
        (i.product && i.product.toString() === itemId) ||
        i.variantSku === itemId
    );

  if (!item) {
    throw ApiError.notFound('Item not found in cart.');
  }

  const product = await Product.findById(item.product);
  const variant = product?.variants.find((v) => v.sku === item.variantSku);

  if (variant && variant.stockQuantity < parsedQty) {
    throw ApiError.badRequest(`Cannot update quantity. Only ${variant.stockQuantity} items in stock.`);
  }

  item.quantity = parsedQty;
  cart.lastActiveAt = new Date();
  await cart.save();

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails }, 'Cart quantity updated');
});

export const removeFromCart = asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const cart = await findOrCreateCart(req, { createIfNotFound: false });
  if (!cart) {
    return ApiResponse.success(
      res,
      {
        cart: {
          items: [],
          billSummary: { subtotal: 0, discount: 0, shippingFee: 0, totalPayable: 0 },
          appliedCoupon: null,
        },
      },
      'Cart is already empty'
    );
  }

  const item =
    (cart.items.id && cart.items.id(itemId)) ||
    cart.items.find(
      (i) =>
        (i._id && i._id.toString() === itemId) ||
        (i.product && i.product.toString() === itemId) ||
        i.variantSku === itemId
    );

  if (item && cart.items.pull) {
    cart.items.pull({ _id: item._id });
  } else if (item) {
    cart.items = cart.items.filter((i) => i !== item);
  }

  // If cart has no more items, completely delete the cart document from MongoDB
  if (!cart.items || cart.items.length === 0) {
    await Cart.deleteOne({ _id: cart._id });
    return ApiResponse.success(
      res,
      {
        cart: {
          items: [],
          billSummary: { subtotal: 0, discount: 0, shippingFee: 0, totalPayable: 0 },
          appliedCoupon: null,
        },
      },
      'Item removed and empty cart deleted'
    );
  }

  cart.lastActiveAt = new Date();
  await cart.save();

  const cartDetails = await calculateCartTotals(cart);
  return ApiResponse.success(res, { cart: cartDetails }, 'Item removed from cart');
});

export const clearCart = asyncHandler(async (req, res) => {
  if (req.user) {
    await Cart.deleteMany({ user: req.user._id });
  }
  const guestId = req.headers['x-guest-id'] || req.body?.guestId || req.query?.guestId;
  if (guestId) {
    await Cart.deleteMany({ guestId });
  }

  return ApiResponse.success(
    res,
    {
      cart: {
        items: [],
        billSummary: { subtotal: 0, discount: 0, shippingFee: 0, totalPayable: 0 },
        appliedCoupon: null,
      },
    },
    'Cart cleared and deleted from database'
  );
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

/**
 * Remove guest cart from MongoDB when guest exits the site
 */
export const clearGuestCartOnExit = asyncHandler(async (req, res) => {
  const guestId = req.params.guestId || req.headers['x-guest-id'] || req.query.guestId || req.body?.guestId;
  if (guestId) {
    await Cart.deleteMany({ guestId });
  }
  return ApiResponse.success(res, null, 'Guest cart removed on site exit');
});
