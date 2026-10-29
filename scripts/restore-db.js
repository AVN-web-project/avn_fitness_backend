/**
 * restore-db.js
 *
 * Restores a dump written by backup-db.js. DESTRUCTIVE: it drops each collection it restores.
 *
 * Safety
 *   - DRY RUN by default. Nothing is dropped unless you pass APPLY=1.
 *   - Refuses to run if the dump's database name differs from the one you are connected to, which
 *     is how a local dump ends up wiping Atlas.
 *
 * Usage (from the `back` directory)
 *   $env:IN="C:\backup\pre-sku"; node scripts/restore-db.js
 *   $env:APPLY=1; node scripts/restore-db.js
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { EJSON } from 'bson';

dotenv.config();

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const IN = process.env.IN || './backup/pre-sku';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

async function main() {
  const manifestPath = path.join(IN, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`\n  No manifest at ${manifestPath}. Point IN at a backup-db.js dump.\n`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  if (manifest.database !== db.databaseName) {
    console.error(
      `\n  Refusing to restore: the dump is from "${manifest.database}" but you are connected to ` +
      `"${db.databaseName}".\n`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\n  ${APPLY ? 'RESTORING' : 'DRY RUN'} — ${IN} -> ${db.databaseName}\n`);

  for (const [name, count] of Object.entries(manifest.collections)) {
    const file = path.join(IN, `${name}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`  ${name}: file missing, skipped`);
      continue;
    }
    const docs = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
    console.log(`  ${name.padEnd(16)} would drop and reinsert ${docs.length} doc(s) (dump had ${count})`);

    if (APPLY) {
      await db.collection(name).deleteMany({});
      if (docs.length) await db.collection(name).insertMany(docs);
    }
  }

  console.log(APPLY ? '\n  Restored.\n' : '\n  Dry run. Re-run with APPLY=1 to restore.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n  Restore failed:', err.message, '\n');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
