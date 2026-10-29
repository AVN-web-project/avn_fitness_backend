/**
 * normalise-sizes.js
 *
 * Puts every product on one of four size conventions and records which one it uses, so the PDP can
 * explain itself.
 *
 *   length     the size is the product's own length, in inches      18in, 79in, 96in
 *   apparel    standard fit letters                                 S, M, L, XL
 *   range      a fit letter; the inch range it covers is in the size guide   M, L
 *   one-size   nothing to choose                                    One Size
 *
 * Why: the catalogue mixed inches, feet, fit letters, body ranges and the word "Standard" — nine
 * products, five conventions. That breaks numeric filtering, and it breaks SKU generation, where a
 * range collapsed to its lower bound and "Standard" / "Standard 2" both vanished to nothing.
 *
 * What it changes, per product:
 *   1. variants[].size      the old label -> the new one
 *   2. variants[].title     the old label inside the title, where present
 *   3. product.sizes        rebuilt from the variants (the PDP seeds its size selection from this)
 *   4. sizeConvention       the convention, for the PDP note
 *   5. inventory_m.size     the ledger row with the same SKU
 *
 * Idempotent: a value that is already a target of its rule is skipped, so running twice is safe and
 * a second run reports nothing.
 *
 * Safety
 *   - DRY RUN by default. Nothing is written unless you pass APPLY=1.
 *   - Products missing from the table are reported and left untouched, never guessed at.
 *   - Any size value the table does not cover is reported rather than dropped.
 *
 * Usage (from the `back` directory)
 *   node scripts/normalise-sizes.js
 *   $env:APPLY=1; node scripts/normalise-sizes.js        # write (PowerShell)
 *   APPLY=1 node scripts/normalise-sizes.js              # write (bash)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

/**
 * Keyed by product name, uppercase. Anything not listed here is left alone and reported.
 */
const TABLE = {
  'ANKLE COMPRESSION SLEEVE': {
    convention: 'apparel',
    map: { Large: 'L', Medium: 'M' },
  },
  'ELBOW WRAP': {
    convention: 'apparel',
    map: { Large: 'L', Medium: 'M' },
  },
  'KNEE WRAP': {
    // "Standard 79\"" and "XL Heavy 90\"" carried a letter, a resistance and a length at once.
    // The length is the size; resistance belongs on the product, not in the size.
    convention: 'length',
    map: { 'Standard 79"': '79in', 'XL Heavy 90"': '90in' },
  },
  'WRIST WRAP': {
    convention: 'length',
    map: { '18 Inch': '18in', '24 Inch': '24in' },
  },
  'HAND WRAP': {
    convention: 'length',
    map: { '4 inch': '4in' },
  },
  'YOGA BELT': {
    // 8ft expressed in inches, so the whole catalogue reads in one unit.
    convention: 'length',
    map: { '8ft Standard': '96in' },
  },
  'LEVER WEIGHTLIFTING BELT': {
    // The letter is the size; 30"-34" is a fit range for the size guide, not a product length.
    convention: 'range',
    map: { 'Medium (30"-34")': 'M', 'Large (34"-38")': 'L' },
  },
  'LEGACY POWER WRAPS': {
    // Convention 4: "Standard" is not a size. Discontinued product, so there is no length to
    // recover — the honest label is One Size. Both variants land on it, which is safe because
    // variants are keyed by SKU, not by size.
    convention: 'one-size',
    map: { Standard: 'One Size', 'Standard 2': 'One Size' },
  },
  'LIFTING STRAPS': {
    // Length-based, in inches, per the product's own strap-length guide:
    //   50 cm ~ 20in   general barbell work, average wrists
    //   65 cm ~ 26in   larger hands, extra tail, thick bars
    //   71 cm ~ 28in   heavy strongman / max-load work
    convention: 'length',
    map: { Standard: '20in', '20in': '20in', '26in': '26in', '28in': '28in' },
  },
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const inventory = db.collection('inventory_m');

  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);

  const docs = await products.find({}, { projection: { name: 1, sizes: 1, variants: 1 } }).toArray();

  let variantWrites = 0;
  let productWrites = 0;
  let ledgerWrites = 0;
  const untouched = [];
  const missingValues = [];
  const sizeListFixes = [];

  for (const p of docs) {
    const name = String(p.name || '').trim().toUpperCase();
    const rule = TABLE[name];

    if (!rule) {
      untouched.push(`${p.name} (no convention in the table)`);
      continue;
    }

    const targets = new Set(Object.values(rule.map));
    const variants = p.variants || [];
    const changes = [];

    for (const v of variants) {
      const oldSize = String(v.size || '').trim();

      // Already normalised on a previous run — nothing to do, and no warning.
      if (targets.has(oldSize)) continue;

      const newSize = rule.map[oldSize];
      if (!newSize) {
        missingValues.push(`${p.name} / ${oldSize || '(blank)'} — not in the table`);
        continue;
      }

      changes.push({ sku: v.sku, from: oldSize, to: newSize });

      if (APPLY) {
        const title = String(v.title || '');
        const newTitle = title.includes(oldSize) ? title.split(oldSize).join(newSize) : title;

        await products.updateOne(
          { _id: p._id, 'variants._id': v._id },
          { $set: { 'variants.$.size': newSize, 'variants.$.title': newTitle } }
        );
        variantWrites += 1;

        if (v.sku) {
          const res = await inventory.updateOne(
            { sku: String(v.sku).toUpperCase() },
            { $set: { size: newSize } }
          );
          if (res.modifiedCount) ledgerWrites += 1;
        }
      }
    }

    // The product-level list is what the PDP seeds its size selection from. Leaving it on the old
    // labels after renaming the variants makes the seed match no variant, so the PDP ends up with
    // no variant selected and shows a stale product-level SKU. Rebuild it from the variants.
    const freshSizes = [...new Set(variants.map((v) => rule.map[v.size] || v.size).filter(Boolean))];
    const currentSizes = (Array.isArray(p.sizes) ? p.sizes : []).map((s) => String(s).trim());
    const sizesDiffer =
      currentSizes.length !== freshSizes.length || !currentSizes.every((s) => freshSizes.includes(s));

    if (sizesDiffer) {
      sizeListFixes.push(`${p.name}: ${JSON.stringify(currentSizes)} -> ${JSON.stringify(freshSizes)}`);
    }

    if (APPLY) {
      const update = { sizeConvention: rule.convention };
      if (sizesDiffer) update.sizes = freshSizes;
      const res = await products.updateOne({ _id: p._id }, { $set: update });
      if (res.modifiedCount) productWrites += 1;
    }

    if (changes.length) {
      console.log(`  ${p.name}  [${rule.convention}]`);
      changes.forEach((c) => console.log(`      ${String(c.sku).padEnd(20)} ${c.from.padEnd(20)} -> ${c.to}`));
      console.log('');
    }
  }

  console.log(`  products to touch   ${docs.length - untouched.length}`);
  console.log(`  variant sizes       ${variantWrites}`);
  console.log(`  product.sizes       ${sizeListFixes.length}`);
  console.log(`  ledger rows         ${ledgerWrites}`);

  if (sizeListFixes.length) {
    console.log('\n  PRODUCT SIZE LIST REBUILT FROM VARIANTS:');
    sizeListFixes.forEach((s) => console.log(`    ${s}`));
  }

  if (untouched.length) {
    console.log('\n  LEFT ALONE:');
    untouched.forEach((u) => console.log(`    ${u}`));
  }
  if (missingValues.length) {
    console.log('\n  SIZE VALUES NOT COVERED BY THE TABLE:');
    missingValues.forEach((m) => console.log(`    ${m}`));
  }

  // Lifting Straps advertises three lengths but stocks one variant. Renaming the standard length to
  // 20in is safe; the other two are a catalogue decision, not a rename, so they are reported here
  // rather than invented.
  const straps = docs.find((d) => String(d.name || '').trim().toUpperCase() === 'LIFTING STRAPS');
  if (straps) {
    const lengths = (straps.variants || []).map((v) => String(v.size || '').trim()).filter(Boolean);
    const documented = ['20in', '26in', '28in'];
    const absent = documented.filter((len) => !lengths.includes(len));
    if (absent.length) {
      console.log(`\n  LIFTING STRAPS offers ${lengths.length} length(s); the guide documents 3.`);
      console.log(`  Missing as variants: ${absent.join(', ')} — add these in the admin before they can be sold.`);
    }
  }

  if (!APPLY) console.log('\n  Dry run. Nothing written. Re-run with APPLY=1 to commit.\n');
  else console.log('\n  Done.\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
