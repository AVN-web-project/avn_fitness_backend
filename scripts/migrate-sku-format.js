/**
 * migrate-sku-format.js
 *
 * Rewrites every variant SKU across the catalogue when the SKU format changes.
 *
 * Why this is a script and not a UI action: a SKU is a key in three live places, and they have to
 * move together or the catalogue ends up half-broken.
 *
 *   products.variants[].sku        the source of truth
 *   inventory_m.sku                the stock ledger, looked up by SKU
 *   carts.items[].variantSku       open carts, resolved by SKU on every read
 *
 * products.images[] is NOT touched. Image mappings are keyed on the variant subdocument _id, which
 * does not change when a SKU does — that is precisely why they were moved off SKU strings.
 *
 * Orders are historical records of what was actually sold, at the SKU it was sold under. They are
 * reported and never rewritten: rewriting them would falsify invoices and break refund lookups.
 *
 * Input
 *   A JSON file mapping old SKU -> new SKU, default ./sku-map.json:
 *     { "AVN-AS-04-BLK-M": "AVN-AS-BLK-M-04", ... }
 *   Pass a different path with MAP=./path/to/map.json
 *
 * Safety
 *   - DRY RUN by default. Nothing is written unless you pass APPLY=1.
 *   - Aborts before writing if the map has duplicate targets, or if a target SKU already belongs
 *     to a different variant.
 *   - Reports every SKU in the map that matched nothing, and every live SKU the map omits, so you
 *     can see the gaps before committing.
 *
 * Usage (from the `back` directory)
 *   node scripts/migrate-sku-format.js                       # preview
 *   $env:APPLY=1; node scripts/migrate-sku-format.js         # write (PowerShell)
 *   APPLY=1 node scripts/migrate-sku-format.js               # write (bash)
 *   $env:MAP="./new-map.json"; node scripts/migrate-sku-format.js   # custom map
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const MAP_PATH = process.env.MAP || './sku-map.json';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

const norm = (x) => String(x || '').trim().toUpperCase();

async function main() {
  if (!fs.existsSync(MAP_PATH)) {
    console.error(`\n  Map file not found: ${path.resolve(MAP_PATH)}`);
    console.error('  Create it as { "OLD-SKU": "NEW-SKU", ... } or pass MAP=./path.json\n');
    process.exit(1);
  }

  const rawMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const mapping = new Map();
  Object.entries(rawMap).forEach(([from, to]) => {
    const f = norm(from);
    const t = norm(to);
    if (f && t && f !== t) mapping.set(f, t);
  });

  if (mapping.size === 0) {
    console.error('\n  The map contains no actual renames (old and new are identical everywhere).\n');
    process.exit(1);
  }

  // Duplicate targets would collapse two variants into one SKU.
  const seen = new Map();
  const dupes = [];
  mapping.forEach((to, from) => {
    if (seen.has(to)) dupes.push(`${to}  <-  ${seen.get(to)} and ${from}`);
    else seen.set(to, from);
  });
  if (dupes.length) {
    console.error('\n  Aborting: the map sends two different SKUs to the same target.');
    dupes.forEach((d) => console.error(`    ${d}`));
    console.error('');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const inventory = db.collection('inventory_m');
  const carts = db.collection('carts');
  const orders = db.collection('orders');

  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN'} — ${mapping.size} renames from ${MAP_PATH}\n`);

  // ---- 1. products.variants[].sku -------------------------------------------------
  const allProducts = await products.find({}, { projection: { name: 1, variants: 1 } }).toArray();
  const productOps = [];
  const matched = new Set();
  const existingSkus = new Map(); // sku -> "product / variant"

  allProducts.forEach((p) => {
    (p.variants || []).forEach((v) => {
      const sku = norm(v?.sku);
      if (sku) existingSkus.set(sku, `${p.name} / ${v.title || v.size || sku}`);
    });
  });

  // A target that already exists and is not itself being renamed would collide.
  const collisions = [];
  mapping.forEach((to, from) => {
    if (existingSkus.has(to) && !mapping.has(to)) {
      collisions.push(`${to} already belongs to ${existingSkus.get(to)} (map moves ${from} onto it)`);
    }
  });
  if (collisions.length) {
    console.error('  Aborting: a target SKU already exists.');
    collisions.forEach((c) => console.error(`    ${c}`));
    console.error('');
    await mongoose.disconnect();
    process.exit(1);
  }

  allProducts.forEach((p) => {
    (p.variants || []).forEach((v, idx) => {
      const sku = norm(v?.sku);
      if (!mapping.has(sku)) return;
      matched.add(sku);
      productOps.push({
        updateOne: {
          filter: { _id: p._id, 'variants._id': v._id },
          update: { $set: { 'variants.$.sku': mapping.get(sku) } },
        },
      });
    });
  });

  // ---- 2. inventory_m.sku ---------------------------------------------------------
  const ledgerRows = await inventory.find({}, { projection: { sku: 1 } }).toArray();
  const ledgerOps = [];
  ledgerRows.forEach((row) => {
    const sku = norm(row.sku);
    if (!mapping.has(sku)) return;
    ledgerOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: { sku: mapping.get(sku) } } } });
  });

  // ---- 3. carts.items[].variantSku ------------------------------------------------
  // Read-modify-write per cart: array positional updates would need one operation per line, and
  // there are few open carts at any time.
  const cartDocs = await carts.find({ 'items.variantSku': { $exists: true } }).toArray();
  const cartWrites = [];
  let cartLines = 0;
  cartDocs.forEach((cart) => {
    let changed = false;
    const items = (cart.items || []).map((item) => {
      const sku = norm(item.variantSku);
      if (!mapping.has(sku)) return item;
      changed = true;
      cartLines += 1;
      return { ...item, variantSku: mapping.get(sku) };
    });
    if (changed) cartWrites.push({ _id: cart._id, items });
  });

  // ---- report ---------------------------------------------------------------------
  console.log(`  products      ${productOps.length} variant SKU(s) across ${new Set(productOps.map(o => String(o.updateOne.filter._id))).size} product(s)`);
  console.log(`  inventory_m   ${ledgerOps.length} row(s)`);
  console.log(`  carts         ${cartLines} line(s) across ${cartWrites.length} cart(s)`);

  const unmatched = [...mapping.keys()].filter((k) => !matched.has(k));
  if (unmatched.length) {
    console.log(`\n  ${unmatched.length} map entr(ies) matched no product variant:`);
    unmatched.forEach((k) => console.log(`    ${k} -> ${mapping.get(k)}`));
  }

  const untouched = [...existingSkus.keys()].filter((k) => !mapping.has(k));
  if (untouched.length) {
    console.log(`\n  ${untouched.length} live SKU(s) are NOT in the map and will keep their current value:`);
    untouched.slice(0, 40).forEach((k) => console.log(`    ${k}   (${existingSkus.get(k)})`));
    if (untouched.length > 40) console.log(`    ...and ${untouched.length - 40} more`);
  }

  const historical = await orders.countDocuments({ 'items.variantSku': { $in: [...mapping.keys()] } });
  console.log(`\n  orders        ${historical} order(s) reference an old SKU. Left untouched — they record what was sold.`);

  if (!APPLY) {
    console.log('\n  Dry run. Nothing written. Re-run with APPLY=1 to commit.\n');
    await mongoose.disconnect();
    return;
  }

  if (productOps.length) await products.bulkWrite(productOps, { ordered: false });
  if (ledgerOps.length) await inventory.bulkWrite(ledgerOps, { ordered: false });
  for (const w of cartWrites) {
    await carts.updateOne({ _id: w._id }, { $set: { items: w.items } });
  }

  console.log('\n  Done.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
