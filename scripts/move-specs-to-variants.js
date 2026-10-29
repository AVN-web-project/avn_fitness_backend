/**
 * move-specs-to-variants.js
 *
 * Copies each product's specifications down into every one of its variants, then removes the
 * product-level field.
 *
 * Why: specs are becoming per-variant. A 79in knee wrap and a 90in knee wrap do not share
 * dimensions, but the old model forced one set of specs to describe both. Care instructions stay
 * on the product — they don't differ by size.
 *
 * ORDER MATTERS. Run this BEFORE deploying the schema change. Once `specifications` is gone from
 * the product schema, Mongoose strips it on the next save of any product, and the values are gone
 * before they can be copied.
 *
 * What it does, per product:
 *   1. every variant that has no specifications of its own receives the product's list
 *   2. variants that already carry their own list are left alone
 *   3. the product-level `specifications` field is removed
 *
 * Safety
 *   - DRY RUN by default. Nothing is written unless you pass APPLY=1.
 *   - Aborts if a product has specifications but no variants to copy them to.
 *   - Reports every product it touched, with counts.
 *
 * Usage (from the `back` directory)
 *   node scripts/move-specs-to-variants.js
 *   $env:APPLY=1; node scripts/move-specs-to-variants.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

const hasSpecs = (list) => Array.isArray(list) && list.length > 0;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');

  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);

  const docs = await products.find({}).toArray();

  let moved = 0;
  let skipped = 0;
  let orphaned = 0;
  let variantsFilled = 0;

  for (const p of docs) {
    const productSpecs = p.specifications;
    const variants = p.variants || [];

    if (!hasSpecs(productSpecs)) {
      skipped += 1;
      continue;
    }

    if (variants.length === 0) {
      console.log(`  ${p.name}: has ${productSpecs.length} spec(s) but no variants — left untouched`);
      orphaned += 1;
      continue;
    }

    const filled = variants.filter((v) => !hasSpecs(v.specifications)).length;
    const kept = variants.length - filled;

    console.log(`  ${p.name}`);
    console.log(`      ${productSpecs.length} product spec(s) -> ${filled} variant(s)${kept ? `, ${kept} already had their own` : ''}`);

    if (APPLY) {
      for (const v of variants) {
        if (hasSpecs(v.specifications)) continue;
        await products.updateOne(
          { _id: p._id, 'variants._id': v._id },
          { $set: { 'variants.$.specifications': productSpecs } }
        );
      }
      await products.updateOne({ _id: p._id }, { $unset: { specifications: '' } });
    }

    variantsFilled += filled;
    moved += 1;
  }

  console.log(`\n  ${docs.length} product(s): ${moved} ${APPLY ? 'migrated' : 'to migrate'}, ${skipped} had no specs, ${orphaned} had no variants`);
  console.log(`  ${variantsFilled} variant(s) ${APPLY ? 'filled' : 'would be filled'}`);

  if (!APPLY) console.log('\n  Dry run. Nothing written. Re-run with APPLY=1 to commit.\n');
  else console.log('\n  Done. The product-level field has been removed.\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
