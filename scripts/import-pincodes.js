/**
 * Import the India Post pincode directory into the `pincodes` collection.
 *
 *   node scripts/import-pincodes.js PINCODE.csv            # dry run — prints what would change
 *   APPLY=1 node scripts/import-pincodes.js PINCODE.csv    # writes
 *
 * The CSV is one row per POST OFFICE (165,627 of them), which aggregates to 19,586 unique
 * pincodes. This script groups by pincode and keeps:
 *
 *   state / district / division / region / circle  — from the first office seen
 *   officeCount                                    — how many offices serve it
 *   hasDelivery                                    — true if any office is a delivery office
 *   latitude / longitude                           — centroid of its offices
 *
 * `city` is the DISTRICT, title-cased. That is deliberate: Mumbai is two districts (MUMBAI and
 * MUMBAI SUBURBAN) and Bengaluru is two, so a "Mumbai" rule has to name both. The admin groups
 * them under one label rather than the data pretending they are one city.
 *
 * Safe to re-run: it upserts by pincode and never deletes. A pincode that disappears from a newer
 * CSV stays in the database, because an order may reference it.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import mongoose from 'mongoose';
import 'dotenv/config';
import { Pincode } from '../src/models/pincode.model.js';

const APPLY = process.env.APPLY === '1';
const BATCH = 1000;

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();

const stripDivision = (value) => String(value || '').replace(/\s*Division\s*$/i, '').trim();

/** Minimal CSV line parser: handles quoted fields with commas inside. */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

async function main() {
  const file = process.argv[2] || 'PINCODE.csv';
  const abs = path.resolve(file);

  if (!fs.existsSync(abs)) {
    console.error(`CSV not found: ${abs}`);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set — copy .env.example or export it.');
    process.exit(1);
  }

  console.log(`Reading ${abs}`);
  console.log(APPLY ? 'Mode: APPLY (writing to the database)' : 'Mode: DRY RUN (no writes)');

  const byPincode = new Map();
  let lineNo = 0;
  let header = null;

  const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity });

  for await (const raw of rl) {
    lineNo += 1;
    if (lineNo === 1) {
      header = parseCsvLine(raw).map((h) => h.trim().toLowerCase());
      continue;
    }
    if (!raw.trim()) continue;

    const cells = parseCsvLine(raw);
    const row = Object.fromEntries(header.map((h, i) => [h, (cells[i] || '').trim()]));

    const pincode = row.pincode;
    if (!/^[1-9][0-9]{5}$/.test(pincode)) continue;

    const existing = byPincode.get(pincode);
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);

    if (!existing) {
      byPincode.set(pincode, {
        pincode,
        state: row.statename || '',
        district: row.district || '',
        city: titleCase(row.district || ''),
        division: stripDivision(row.divisionname),
        region: row.regionname || '',
        circle: row.circlename || '',
        officeCount: 1,
        hasDelivery: row.delivery === 'Delivery',
        latSum: hasLatLng ? lat : 0,
        lngSum: hasLatLng ? lng : 0,
        coordCount: hasLatLng ? 1 : 0,
      });
    } else {
      existing.officeCount += 1;
      if (row.delivery === 'Delivery') existing.hasDelivery = true;
      if (hasLatLng) {
        existing.latSum += lat;
        existing.lngSum += lng;
        existing.coordCount += 1;
      }
    }
  }

  const docs = [...byPincode.values()].map((p) => ({
    pincode: p.pincode,
    state: p.state,
    district: p.district,
    city: p.city,
    division: p.division,
    region: p.region,
    circle: p.circle,
    officeCount: p.officeCount,
    hasDelivery: p.hasDelivery,
    latitude: p.coordCount ? Number((p.latSum / p.coordCount).toFixed(6)) : null,
    longitude: p.coordCount ? Number((p.lngSum / p.coordCount).toFixed(6)) : null,
  }));

  const states = new Set(docs.map((d) => d.state));
  const withDelivery = docs.filter((d) => d.hasDelivery).length;

  console.log(`\n  rows read        : ${lineNo - 1}`);
  console.log(`  unique pincodes  : ${docs.length}`);
  console.log(`  states           : ${states.size}`);
  console.log(`  delivery-capable : ${withDelivery}`);
  console.log(`  sample           :`, docs.slice(0, 3));

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with APPLY=1 to write.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\nConnected to: ${mongoose.connection.name}`);

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    await Pincode.bulkWrite(
      chunk.map((doc) => ({
        updateOne: {
          filter: { pincode: doc.pincode },
          update: { $set: doc },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    written += chunk.length;
    if (written % 5000 === 0 || written === docs.length) {
      console.log(`  upserted ${written}/${docs.length}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error('Import failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // already closed
  }
  process.exit(1);
});
