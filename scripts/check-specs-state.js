/**
 * check-specs-state.js
 *
 * Read-only. Shows where specifications currently live, so you can see whether the move to
 * variant-level specs has actually happened.
 *
 *   PRODUCT-LEVEL   still on the product, shown on the PDP via the fallback path
 *   VARIANT-LEVEL   on the variants, which is where the admin editor now writes
 *
 * Reads through the raw driver, so it works whether or not the schema has been updated yet.
 *
 * Usage (from the `back` directory)
 *   node scripts/check-specs-state.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';
const has = (l) => Array.isArray(l) && l.length > 0;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();

  console.log(`\n  ${db.databaseName} — ${products.length} product(s)\n`);
  console.log(`  ${'product'.padEnd(30)} ${'product-level'.padEnd(14)} ${'variants with specs'}`);

  let stranded = 0;
  let moved = 0;

  for (const p of products) {
    const variants = p.variants || [];
    const withSpecs = variants.filter((v) => has(v.specifications)).length;
    const atProduct = has(p.specifications);

    console.log(
      `  ${String(p.name).slice(0, 30).padEnd(30)} ${(atProduct ? `yes (${p.specifications.length})` : '—').padEnd(14)} ${withSpecs}/${variants.length}`
    );

    if (atProduct && withSpecs === 0) stranded += 1;
    if (withSpecs > 0) moved += 1;
  }

  console.log(`\n  ${moved} product(s) have variant-level specs`);
  console.log(`  ${stranded} product(s) have specs ONLY at product level — these are the ones the admin cannot edit\n`);

  if (stranded > 0) {
    console.log('  Run:  node scripts/move-specs-to-variants.js');
    console.log('  Then: $env:APPLY=1; node scripts/move-specs-to-variants.js\n');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
