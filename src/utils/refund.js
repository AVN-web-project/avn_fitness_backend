/**
 * What a customer actually gets back on a refund.
 *
 * totalPayable minus everything that isn't refundable:
 *  - the COD surcharge, charged only on COD orders
 *  - the handling fee
 *
 * Floored at 0 so a malformed order can never produce a negative payout.
 *
 * This is shared deliberately. The payout path (operations.controller) and the emails
 * that quote a refund figure both read from here, so the amount a customer is told and
 * the amount they are paid can never drift apart.
 */
export const getRefundableAmount = (order) => {
  const totalPayable = Number(order?.pricing?.totalPayable) || 0;
  const codSurcharge = String(order?.paymentInfo?.provider || '').toLowerCase() === 'cod'
    ? Number(order?.pricing?.codSurcharge ?? 0)
    : 0;
  const handlingFee = Number(order?.pricing?.handlingFee) || 0;
  return Math.max(0, totalPayable - codSurcharge - handlingFee);
};

export default getRefundableAmount;
