/**
 * backup-db.js
 *
 * Exports the collections the SKU migration touches, to plain files you can restore from.
 * A stand-in for mongodump, which needs the separate MongoDB Database Tools package.
 *
 * EJSON is used rather than JSON so ObjectId and Date values survive the round trip. A plain
 * JSON dump turns an _id into {"$oid": "..."} shaped text or, worse, a bare string — and a restore
 * from that produces documents whose ids no longer match the carts pointing at them.
 *
 * Usage (from the `back` directory)
 *   node scripts/backup-db.js
 *   $env:OUT="C:\backup\pre-sku"; node scripts/backup-db.js
 *   $env:COLLECTIONS="products,inventory_m,carts,orders"; node scripts/backup-db.js
 *
 * Restore with scripts/restore-db.js.
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { EJSON } from 'bson';

dotenv.config();

const OUT = process.env.OUT || './backup/pre-sku';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

// The migration rewrites SKUs in these three. Orders are included by default too: nothing writes
// to them, but having a copy means an "old order still opens correctly" check has something to
// compare against.
const COLLECTIONS = (process.env.COLLECTIONS || 'products,inventory_m,carts,orders')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const host = MONGODB_URI.replace(/\/\/[^@]*@/, '//***@');
  console.log(`\n  Backing up ${db.databaseName}\n  from ${host}\n  to   ${path.resolve(OUT)}\n`);

  const manifest = { database: db.databaseName, takenAt: new Date().toISOString(), collections: {} };

  for (const name of COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(OUT, `${name}.json`);
    fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }, 2));

    manifest.collections[name] = docs.length;
    const size = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`  ${name.padEnd(16)} ${String(docs.length).padStart(5)} doc(s)   ${size} KB`);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n  Done. Restore with:  node scripts/restore-db.js\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Backup failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
