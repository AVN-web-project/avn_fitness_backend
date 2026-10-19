/**
 * One-off repair: cap recorded refund amounts at what the customer actually paid.
 *
 * Finds REFUND_RECORDED activity logs whose details.refundAmount exceeds the order's
 * pricing.totalPayable (e.g. ₹1,298 recorded against a ₹798 order — a historical bug
 * fixed in recordRefund going forward) and, where found, corrects:
 *   1. The Activity Log entry  -> details.refundAmount
 *   2. The Order              -> returnRequest.refundAmount
 *   3. The Payment record     -> refundInfo.amount
 *
 * Usage (from the backend root):
 *   node scripts/fix-refund-amounts.js            # DRY RUN — only prints what would change
 *   APPLY=1 node scripts/fix-refund-amounts.js   # writes the corrections
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Order } from '../src/models/order.model.js';
import { Payment } from '../src/models/payment.model.js';
import { ActivityLog } from '../src/models/activityLog.model.js';
import { ACTIVITY_ACTIONS } from '../src/config/constants.js';

const APPLY = process.env.APPLY === '1';

const main = async () => {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (will write changes)' : 'DRY RUN (no changes)'}\n`);

  const logs = await ActivityLog.find({ action: ACTIVITY_ACTIONS.REFUND_RECORDED }).lean();
  const orderNumbers = [...new Set(logs.map((l) => l.details?.orderNumber).filter(Boolean))];
  const orders = await Order.find({ orderNumber: { $in: orderNumbers } }).lean();
  const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o]));

  let found = 0;
  for (const log of logs) {
    const order = orderByNumber.get(log.details?.orderNumber);
    if (!order) {
      console.log(`WARN: no order found for log ${log._id} (orderNumber: ${log.details?.orderNumber})`);
      continue;
    }

    const paid = Number(order.pricing?.totalPayable) || 0;
    const recorded = Number(log.details.refundAmount);
    if (!(paid > 0) || !Number.isFinite(recorded) || recorded <= paid) continue;

    found++;
    console.log(
      `${order.orderNumber}: recorded ₹${recorded.toLocaleString('en-IN')} vs paid ₹${paid.toLocaleString('en-IN')} -> capping to ₹${paid.toLocaleString('en-IN')}`
    );

    if (!APPLY) continue;

    await ActivityLog.updateOne(
      { _id: log._id },
      { $set: { 'details.refundAmount': paid } }
    );
    if (order.returnRequest?.refundAmount !== undefined) {
      await Order.updateOne(
        { _id: order._id },
        { $set: { 'returnRequest.refundAmount': paid } }
      );
    }
    const paymentRes = await Payment.updateOne(
      { order: order._id, 'refundInfo.amount': { $gt: paid } },
      { $set: { 'refundInfo.amount': paid } }
    );
    console.log(`   -> log updated${order.returnRequest?.refundAmount !== undefined ? ', order updated' : ''}, payments matched: ${paymentRes.modifiedCount}`);
  }

  console.log(
    found === 0
      ? '\nAll recorded refund amounts are within what customers paid. Nothing to fix.'
      : APPLY
        ? `\nDone. Fixed ${found} refund record${found === 1 ? '' : 's'}.`
        : `\nDry run complete: ${found} refund record${found === 1 ? '' : 's'} need fixing. Re-run with APPLY=1 to write.`
  );

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
