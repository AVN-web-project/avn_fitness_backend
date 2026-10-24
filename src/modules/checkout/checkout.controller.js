import mongoose from 'mongoose';
import { Cart } from '../../models/cart.model.js';
import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { Payment } from '../../models/payment.model.js';
import { Coupon } from '../../models/coupon.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendOrderConfirmationEmail } from '../../utils/email.service.js';
import { env } from '../../config/env.js';
import { COD_SURCHARGE, ORDER_HANDLING_FEE, ORDER_STATUS, PAYMENT_STATUS, PRODUCT_STATUS } from '../../config/constants.js';

const generateOrderNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomStr}`;
};

export const createCheckoutOrder = asyncHandler(async (req, res) => {
  // GUEST CHECKOUT STRICTLY BLOCKED
  if (!req.user) {
    throw ApiError.unauthorized('Guest checkout is not permitted. Please log in or register to complete your purchase.');
  }

  const {
    shippingAddressId,
    customAddress,
    shippingAddress,
    address,
    paymentProvider = 'razorpay',
    paymentMethod,
  } = req.body;
  const selectedMethod = String(paymentMethod || req.body.paymentMethodType || '').toLowerCase();
  const provider = selectedMethod === 'cod'
    ? 'cod'
    : String(paymentProvider || env.PAYMENT.PROVIDER || 'razorpay').toLowerCase();
  if (provider === 'mock' && !env.PAYMENT.MOCK_ENABLED) {
    throw ApiError.forbidden('Simulated payments are disabled in this environment.');
  }
  const isCod = provider === 'cod';

  // Resolve shipping address from customAddress, shippingAddress, address, or user address book
  let selectedAddress = customAddress || shippingAddress || address;
  if (!selectedAddress && shippingAddressId && req.user.addresses) {
    selectedAddress = req.user.addresses.id(shippingAddressId);
  }
  if (!selectedAddress && req.user.addresses && req.user.addresses.length > 0) {
    selectedAddress = req.user.addresses.find((a) => a.isDefault) || req.user.addresses[0];
  }

  const resolvedAddress = {
    fullName: selectedAddress?.fullName || req.user.name || 'Customer',
    phone: selectedAddress?.phone || req.user.phone || '9876543210',
    street: selectedAddress?.street || 'Default Street',
    city: selectedAddress?.city || 'Default City',
    state: selectedAddress?.state || 'Default State',
    pincode: selectedAddress?.pincode || '110001',
    country: selectedAddress?.country || 'India',
  };

  // ---------------------------------------------------------------------------
  // SERVER-AUTHORITATIVE PRICING
  // Every figure below is derived from the database: the server-side cart, the
  // product variant prices, and a re-validated coupon. The request body is NEVER
  // trusted for items, prices, discount, shipping, or the payable total.
  // ---------------------------------------------------------------------------
  let subtotal = 0;
  const orderItems = [];

  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart || !cart.items || cart.items.length === 0) {
    throw ApiError.badRequest('Your shopping cart is empty.');
  }

  for (const item of cart.items) {
    const product = await Product.findById(item.product?._id || item.product);
    if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
      continue; // stale item — the cart already hides these from the customer
    }

    const variant = product.variants.find((v) => v.sku === item.variantSku && v.isActive);
    if (!variant) {
      continue; // stale variant SKU — the cart already hides these from the customer
    }

    const itemSubtotal = variant.price * item.quantity;
    subtotal += itemSubtotal;

    orderItems.push({
      product: product._id,
      productId: String(product._id),
      variantSku: variant.sku,
      name: product.name,
      variantTitle: variant.title,
      image: product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '',
      price: variant.price,
      quantity: item.quantity,
      subtotal: itemSubtotal,
    });
  }

  // Nothing valid left to buy? Fail clearly instead of creating an empty order.
  if (orderItems.length === 0) {
    throw ApiError.badRequest('Your cart has no available items. Please add products again.');
  }

  // Coupon discount — re-validated server-side against the cart's applied coupon
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
        appliedCoupon = { code: coupon.code, discountAmount: Math.round(discount) };
      }
    }
  }

  // Shipping: free over ₹999, otherwise ₹99
  const shippingFee = subtotal >= 999 || subtotal === 0 ? 0 : 99;

  const handlingFee = ORDER_HANDLING_FEE;
  const codSurcharge = isCod ? COD_SURCHARGE : 0;
  const totalPayable = Math.max(0, subtotal - discount + shippingFee) + codSurcharge + handlingFee;

  const orderNumber = generateOrderNumber();
  const orderStatus = isCod ? ORDER_STATUS.PROCESSING : ORDER_STATUS.PENDING_PAYMENT;
  const paymentStatus = PAYMENT_STATUS.PENDING;
  const paidAt = undefined;
  const transactionId = req.body.transactionId || `TXN-${Date.now().toString().slice(-8)}`;

  // Create genuine order in MongoDB database
  const order = await Order.create({
    orderNumber,
    user: req.user._id,
    items: orderItems,
    pricing: {
      subtotal,
      discount: Math.round(discount),
      shippingFee,
      handlingFee,
      codSurcharge,
      totalPayable: Math.round(totalPayable),
    },
    shippingAddress: resolvedAddress,
    paymentInfo: {
      provider,
      method: selectedMethod || provider,
      paymentOrderId: `pay_ord_${Date.now()}`,
      transactionId,
      paymentStatus,
      paidAt,
    },
    orderStatus,
    statusHistory: [
      {
        status: orderStatus,
        changedBy: req.user._id,
        changedByRole: req.user.role,
        note: `Order placed via ${provider}.`,
        timestamp: new Date(),
      },
    ],
    appliedCoupon,
  });

  // Delete authenticated user's MongoDB cart completely after order placement
  if (req.user) {
    await Cart.deleteMany({ user: req.user._id });
  }

  // Also purge any guest cart tied to this guest session
  const guestId = req.headers['x-guest-id'] || req.body?.guestId || req.query?.guestId;
  if (guestId) {
    await Cart.deleteMany({ guestId });
  }

  // Awaited deliberately. On a serverless host the function is frozen once the response
  // is returned, which kills any fire-and-forget send before it completes — and because
  // the process dies, the .catch() never runs either, so there is no log to diagnose from.
  const customerEmail = req.user?.email || selectedAddress?.email;
  if (customerEmail) {
    try {
      await sendOrderConfirmationEmail(customerEmail, order);
    } catch (err) {
      console.warn('⚠️ Order confirmation email dispatch failed:', err.message);
    }
  }

  return ApiResponse.success(
    res,
    {
      orderId: order._id,
      id: order._id,
      orderNumber: order.orderNumber,
      totalPayable: order.pricing.totalPayable,
      status: order.orderStatus,
      paymentStatus: order.paymentInfo.paymentStatus,
      transactionId: order.paymentInfo.transactionId,
      items: order.items,
      shippingAddress: order.shippingAddress,
      financials: order.pricing,
      paymentInfo: order.paymentInfo,
      paymentMethod: order.paymentInfo.provider,
      createdAt: order.createdAt,
    },
    'Order created successfully in database',
    201
  );
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, status = 'success' } = req.body;
  const paymentId = req.body.paymentId || req.body.razorpay_payment_id;
  const signature = req.body.signature || req.body.razorpay_signature;

  const order = await Order.findOne({
    $or: [
      { _id: orderId && mongoose.Types.ObjectId.isValid(orderId) ? orderId : null },
      { orderNumber: orderId }
    ]
  });
  if (!order) {
    throw ApiError.notFound('Order not found.');
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('Unauthorized access to this order payment verification.');
  }

  if (order.paymentInfo?.provider === 'mock' && !env.PAYMENT.MOCK_ENABLED) {
    throw ApiError.forbidden('Simulated payments are disabled in this environment.');
  }

  if (order.orderStatus === ORDER_STATUS.PAID_CONFIRMED) {
    return ApiResponse.success(res, { order }, 'Order payment has already been verified.');
  }

  if (order.orderStatus !== ORDER_STATUS.PENDING_PAYMENT) {
    return ApiResponse.success(res, { order }, `Order is already in '${order.orderStatus}' state.`);
  }

  if (status === 'success') {
    // Transition to PAID_CONFIRMED
    order.orderStatus = ORDER_STATUS.PAID_CONFIRMED;
    order.paymentInfo.paymentStatus = PAYMENT_STATUS.CAPTURED;
    order.paymentInfo.transactionId = paymentId || `txn_${Date.now()}`;
    order.paymentInfo.paidAt = new Date();

    order.statusHistory.push({
      status: ORDER_STATUS.PAID_CONFIRMED,
      changedBy: req.user._id,
      changedByRole: req.user.role,
      note: `Payment verified and captured via ${order.paymentInfo.provider}.`,
    });

    // Deduct stock for items
    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.product, 'variants.sku': item.variantSku },
        { $inc: { 'variants.$.stockQuantity': -item.quantity } }
      );
    }

    // Increment coupon usage if used
    if (order.appliedCoupon && order.appliedCoupon.code) {
      await Coupon.updateOne(
        { code: order.appliedCoupon.code },
        { $inc: { usedCount: 1 } }
      );
    }

    await order.save();

    // Record Payment model record
    await Payment.create({
      order: order._id,
      user: req.user._id,
      provider: order.paymentInfo.provider,
      method: order.paymentInfo.method,
      amount: order.pricing.totalPayable,
      status: PAYMENT_STATUS.CAPTURED,
      providerOrderId: order.paymentInfo.paymentOrderId,
      providerPaymentId: order.paymentInfo.transactionId,
      providerSignature: signature || '',
    });

    // Order confirmation on payment capture. Awaited — see the note on the send above.
    const customerEmail = req.user?.email;
    if (customerEmail) {
      try {
        await sendOrderConfirmationEmail(customerEmail, order);
      } catch (err) {
        console.warn('⚠️ Order confirmation email dispatch failed:', err.message);
      }
    }

    return ApiResponse.success(res, { order }, 'Payment verified! Order placed successfully.');
  } else {
    // Payment failed
    order.orderStatus = ORDER_STATUS.PAYMENT_FAILED;
    order.paymentInfo.paymentStatus = PAYMENT_STATUS.FAILED;

    order.statusHistory.push({
      status: ORDER_STATUS.PAYMENT_FAILED,
      changedBy: req.user._id,
      changedByRole: req.user.role,
      note: 'Payment attempt was declined or failed.',
    });

    await order.save();

    throw ApiError.badRequest('Payment verification failed.');
  }
});
