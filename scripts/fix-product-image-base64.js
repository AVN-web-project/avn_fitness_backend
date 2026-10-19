/**
 * One-off repair: move product images stored as base64 data URIs onto disk.
 *
 * A bug in the admin upload flow stored the raw data URI as images[].url whenever
 * the upload response shape didn't match — so the product document held a full
 * base64 string instead of a served path, and every storefront payload shipped
 * the whole image inline. This decodes each one, writes it under
 * public/uploads/products, and replaces the field with the same path shape the
 * upload endpoint returns (`/uploads/products/<file>`).
 *
 * Usage (from the backend root):
 *   node scripts/fix-product-image-base64.js            # DRY RUN — prints only
 *   APPLY=1 node scripts/fix-product-image-base64.js    # writes files + updates
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/product.model.js';

const APPLY = process.env.APPLY === '1';

const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');

const safeBase = (value, fallback) =>
  String(value || fallback)
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 35) || fallback;

const main = async () => {
  await mongoose.connect(env.MONGODB_URI);
  console.log(
    `Connected. Mode: ${APPLY ? 'APPLY (will write files + update products)' : 'DRY RUN (no changes)'}\n`
  );

  const products = await Product.find({ 'images.url': /^data:image\// }).lean();
  console.log(`Products holding a base64 image: ${products.length}\n`);

  let converted = 0;
  let skipped = 0;

  for (const product of products) {
    const images = Array.isArray(product.images) ? product.images : [];
    const updates = [];

    images.forEach((img, index) => {
      const match = DATA_URI.exec(String(img?.url || ''));
      if (!match) return;

      const mime = match[1].toLowerCase();
      const ext = EXT_BY_MIME[mime];
      if (!ext) {
        console.log(`  SKIP ${product.slug || product._id} image #${index + 1}: unsupported type ${mime}`);
        skipped++;
        return;
      }

      const buffer = Buffer.from(match[2], 'base64');
      const base = safeBase(product.slug || product.name, 'product');
      const fileName = `${base}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${ext}`;
      const filePath = path.join(uploadDir, fileName);
      const url = `/uploads/products/${fileName}`;

      console.log(
        `  ${product.slug || product._id} image #${index + 1}: ${mime}, ${(buffer.length / 1024).toFixed(0)} KB -> ${url}`
      );

      if (APPLY) {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(filePath, buffer);
        updates.push({ index, url });
      }
      converted++;
    });

    if (APPLY && updates.length) {
      const set = {};
      updates.forEach(({ index, url }) => {
        set[`images.${index}.url`] = url;
      });
      await Product.updateOne({ _id: product._id }, { $set: set });
    }
  }

  console.log(`\n${APPLY ? 'Converted' : 'Would convert'}: ${converted}   skipped: ${skipped}`);
  if (!APPLY) {
    console.log('Dry run only — re-run with APPLY=1 to write the files and update the products.');
  }
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
