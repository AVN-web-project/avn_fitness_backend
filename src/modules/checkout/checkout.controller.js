import { Cart } from '../../models/cart.model.js';
import { Order } from '../../models/order.model.js';
import { Product } from '../../models/product.model.js';
import { Payment } from '../../models/payment.model.js';
import { Coupon } from '../../models/coupon.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ORDER_STATUS, PAYMENT_STATUS, PRODUCT_STATUS } from '../../config/constants.js';

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

  const { shippingAddressId, customAddress, paymentProvider = 'razorpay' } = req.body;

  // Resolve shipping address
  let selectedAddress = null;
  if (shippingAddressId) {
    selectedAddress = req.user.addresses.id(shippingAddressId);
  } else if (customAddress) {
    selectedAddress = customAddress;
  }

  if (!selectedAddress || !selectedAddress.street || !selectedAddress.pincode) {
    throw ApiError.badRequest('A valid delivery address is required for checkout.');
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart || !cart.items || cart.items.length === 0) {
    throw ApiError.badRequest('Your shopping cart is empty.');
  }

  let subtotal = 0;
  const orderItems = [];

  // Validate stock and snapshot items
  for (const item of cart.items) {
    const product = await Product.findById(item.product._id);
    if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
      throw ApiError.badRequest(`Product '${item.product.name}' is no longer available.`);
    }

    const variant = product.variants.find((v) => v.sku === item.variantSku && v.isActive);
    if (!variant) {
      throw ApiError.badRequest(`Variant SKU '${item.variantSku}' is no longer available.`);
    }

    if (variant.stockQuantity < item.quantity) {
      throw ApiError.badRequest(
        `Insufficient stock for '${product.name} (${variant.title})'. Only ${variant.stockQuantity} remaining.`
      );
    }

    const itemSubtotal = variant.price * item.quantity;
    subtotal += itemSubtotal;

    orderItems.push({
      product: product._id,
      variantSku: variant.sku,
      name: product.name,
      variantTitle: variant.title,
      image: product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url || '',
      price: variant.price,
      quantity: item.quantity,
      subtotal: itemSubtotal,
    });
  }

  // Calculate discount
  let discount = 0;
  let appliedCouponData = null;
  if (cart.appliedCoupon && cart.appliedCoupon.code) {
    const coupon = await Coupon.findOne({ code: cart.appliedCoupon.code, isActive: true });
    if (coupon && coupon.isValid(subtotal, req.user._id).valid) {
      if (coupon.discountType === 'percentage') {
        discount = (subtotal * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
          discount = coupon.maxDiscountAmount;
        }
      } else {
        discount = coupon.discountValue;
      }
      discount = Math.min(discount, subtotal);
      appliedCouponData = {
        code: coupon.code,
        discountAmount: Math.round(discount),
      };
    }
  }

  const shippingFee = subtotal >= 999 ? 0 : 99;
  const totalPayable = Math.max(0, subtotal - discount + shippingFee);

  const orderNumber = generateOrderNumber();

  // Create order in PENDING_PAYMENT
  const order = await Order.create({
    orderNumber,
    user: req.user._id,
    items: orderItems,
    pricing: {
      subtotal,
      discount: Math.round(discount),
      shippingFee,
      totalPayable: Math.round(totalPayable),
    },
    shippingAddress: {
      fullName: selectedAddress.fullName,
      phone: selectedAddress.phone,
      street: selectedAddress.street,
      city: selectedAddress.city,
      state: selectedAddress.state,
      pincode: selectedAddress.pincode,
      country: selectedAddress.country || 'India',
    },
    paymentInfo: {
      provider: paymentProvider,
      paymentOrderId: `pay_ord_${Date.now()}`,
      paymentStatus: PAYMENT_STATUS.PENDING,
    },
    orderStatus: ORDER_STATUS.PENDING_PAYMENT,
    statusHistory: [
      {
        status: ORDER_STATUS.PENDING_PAYMENT,
        changedBy: req.user._id,
        changedByRole: req.user.role,
        note: 'Order initiated at checkout.',
      },
    ],
    appliedCoupon: appliedCouponData,
  });

  // Clear user's cart
  cart.items = [];
  cart.appliedCoupon = { code: null, discountAmount: 0 };
  await cart.save();

  return ApiResponse.success(
    res,
    {
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalPayable: order.pricing.totalPayable,
      currency: 'INR',
      paymentOrderId: order.paymentInfo.paymentOrderId,
      provider: paymentProvider,
    },
    'Checkout order initialized successfully',
    201
  );
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentId, signature, status = 'success' } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    throw ApiError.notFound('Order not found.');
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('Unauthorized access to this order payment verification.');
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
      amount: order.pricing.totalPayable,
      status: PAYMENT_STATUS.CAPTURED,
      providerOrderId: order.paymentInfo.paymentOrderId,
      providerPaymentId: order.paymentInfo.transactionId,
      providerSignature: signature || '',
    });

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

    return ApiResponse.badRequest('Payment verification failed.');
  }
});
