/**
 * Occasion (festive) discount maths.
 *
 * This sits ON TOP of the base discount and never changes how it is computed: the base discount is
 * the gap between `compareAtPrice` and `price`, and that stays exactly as it was. What happens here
 * is a second, percentage-based reduction applied to the selling price for the duration of an
 * occasion.
 *
 * The floor is per product, not per line: no variant of a product may end up below
 * MIN_PRODUCT_PRICE. Because every variant is reduced by the same percentage, the lowest-priced
 * variant is the binding constraint — so capping the percentage against that one variant keeps
 * every other variant above the floor automatically.
 */

export const MIN_PRODUCT_PRICE = 100;

/**
 * Highest percentage this product can carry without pushing its cheapest variant under the floor.
 * Returns 0 when the product is already at or below the floor, or has no priced variants.
 */
export const maxFestiveDiscountFor = (variants = []) => {
  const prices = (Array.isArray(variants) ? variants : [])
    .map((v) => Number(v?.price) || 0)
    .filter((p) => p > 0);

  if (prices.length === 0) return 0;

  const lowest = Math.min(...prices);
  if (lowest <= MIN_PRODUCT_PRICE) return 0;

  // Integer percentage, rounded down so the floor is never breached by rounding.
  return Math.floor((1 - MIN_PRODUCT_PRICE / lowest) * 100);
};

/** Clamp a requested percentage into what this product is actually allowed to carry. */
export const clampFestiveDiscount = (percent, variants = []) => {
  const requested = Number(percent) || 0;
  if (requested <= 0) return 0;
  return Math.min(Math.round(requested), maxFestiveDiscountFor(variants));
};

/**
 * Apply the festive percentage to a single price. The Math.max is a safety net: the percentage is
 * clamped on save, so this should never bind, but a price must never fall below the floor even if
 * a stale document carries an oversized percentage.
 */
export const applyFestiveDiscount = (price, percent) => {
  const base = Number(price) || 0;
  const pct = Math.max(0, Number(percent) || 0);
  if (pct <= 0) return Math.round(base);
  return Math.max(MIN_PRODUCT_PRICE, Math.round(base * (1 - pct / 100)));
};
