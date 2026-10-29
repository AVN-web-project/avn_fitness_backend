/**
 * build-sku-map.js
 *
 * Generates sku-map.json (old SKU -> new SKU) for the category-segment migration.
 *
 * Format: the category segment is inserted straight after the brand, everything else is left
 * alone:
 *     AVN-AS-04-BLK-M   ->   AVN-KS-AS-04-BLK-M
 *     AVN-EW-01-RED-L   ->   AVN-ES-EW-01-RED-L
 *
 * Product codes are NOT recomputed. Rebuilding them would renumber the whole catalogue and make
 * the map impossible to review by eye.
 *
 * Output feeds scripts/migrate-sku-format.js, which moves products, inventory_m and carts together.
 *
 * Safety
 *   - Writes sku-map.json only. It changes nothing in the database.
 *   - Aborts if two different SKUs would collapse onto the same new SKU.
 *   - Lists every variant it could not resolve a category for, so nothing is renamed silently.
 *
 * Usage (from the `back` directory)
 *   node scripts/build-sku-map.js
 *   $env:OUT="./sku-map.json"; node scripts/build-sku-map.js      # custom output path
 */

import mongoose from 'mongoose';
import fs from 'fs';
import dotenv from 'dotenv';
import { insertCategory, sizeCode } from '../src/utils/sku.js';

dotenv.config();

const OUT = process.env.MAP_OUT || './sku-map.json';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // A missing collection returns an empty array rather than throwing, so the old
  // try/catch never fell through to the second name. Check both explicitly.
  let categories = [];
  for (const name of ["categories_m", "categories"]) {
    categories = await db.collection(name).find({}).toArray();
    if (categories.length) break;
  }

  const nameById = new Map();
  categories.forEach((c) => {
    nameById.set(String(c._id), c.name || c.slug || "");
    nameById.set(String(c.slug || "").toLowerCase(), c.name || c.slug || "");
    nameById.set(String(c.name || "").toLowerCase(), c.name || c.slug || "");
  });

  const products = await db
    .collection('products')
    .find({}, { projection: { name: 1, category: 1, variants: 1 } })
    .toArray();

  const map = {};
  const unchanged = [];
  const unresolved = [];
  const sizeFixes = [];
  const targets = new Map();

  products.forEach((p) => {
    const categoryName = nameById.get(String(p.category)) || nameById.get(String(p.category || '').toLowerCase()) || '';
    (p.variants || []).forEach((v) => {
      const oldSku = String(v?.sku || '').trim().toUpperCase();
      if (!oldSku) return;

      if (!categoryName) {
        unresolved.push(`${oldSku}  (${p.name}) — product has no resolvable category`);
        return;
      }

      const newSku = insertCategory(oldSku, categoryName);

      // The size may have been normalised (8ft -> 96in) while the SKU still carries the old unit.
      // A trailing size segment that disagrees with the variant size is corrected here, so the SKU
      // and the size field never tell different stories.
      const sizeToken = sizeCode(v?.size);
      const skuParts = newSku.split("-");
      const lastPart = skuParts[skuParts.length - 1];
      const looksLikeSize = /^(\d+(IN|FT|CM)|S|M|L|XL|XXL|STD)$/.test(lastPart);
      let reconciled = newSku;
      if (sizeToken !== "STD" && looksLikeSize && lastPart !== sizeToken) {
        skuParts[skuParts.length - 1] = sizeToken;
        reconciled = skuParts.join("-");
        sizeFixes.push(`${oldSku} -> ${reconciled}  (size segment corrected to match "${v.size}")`);
      }
      if (!newSku) {
        unresolved.push(`${oldSku}  (${p.name}) — could not parse`);
        return;
      }

      if (reconciled === oldSku) {
        unchanged.push(oldSku);
        return;
      }

      if (targets.has(reconciled)) {
        console.error(
          `\n  Aborting: ${oldSku} and ${targets.get(oldSku)} both map to ${reconciled}.\n`
        );
        process.exit(1);
      }
      targets.set(reconciled, oldSku);
      map[oldSku] = reconciled;
    });
  });

  const changed = Object.keys(map).length;

  console.log(`\n  ${products.length} product(s), ${categories.length} categor(y/ies)\n`);
  console.log(`  to rename      ${changed}`);
  console.log(`  already correct ${unchanged.length}`);
  console.log(`  unresolved      ${unresolved.length}`);

  if (changed > 0) {
    console.log('\n  Sample:');
    Object.entries(map).slice(0, 12).forEach(([from, to]) => console.log(`    ${from.padEnd(22)} -> ${to}`));
    if (changed > 12) console.log(`    ...and ${changed - 12} more`);
  }

  if (sizeFixes.length) {
    console.log("\n  SIZE SEGMENT CORRECTED:");
    sizeFixes.forEach((f) => console.log(`    ${f}`));
  }

  if (unresolved.length) {
    console.log('\n  NOT renamed (fix these before migrating):');
    unresolved.forEach((u) => console.log(`    ${u}`));
  }

  fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
  console.log(`\n  Wrote ${OUT}\n`);
  console.log('  Next: node scripts/migrate-sku-format.js           (preview)');
  console.log('        $env:APPLY=1; node scripts/migrate-sku-format.js   (apply)\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
