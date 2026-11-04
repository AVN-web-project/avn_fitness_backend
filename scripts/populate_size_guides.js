import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../src/models/product.model.js';
import { SIZE_GUIDES_BY_SLUG } from './sizeGuideData.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

const populateSizeGuides = async () => {
  try {
    await mongoose.connect(MONGODB_URI);

    let updated = 0;
    for (const [slug, sizeGuide] of Object.entries(SIZE_GUIDES_BY_SLUG)) {
      const result = await Product.updateOne({ slug }, { $set: { sizeGuide } });
      if (result.matchedCount > 0) {
        updated += result.modifiedCount;
        console.log(`${result.modifiedCount ? 'Updated' : 'Already populated'}: ${slug}`);
      } else {
        console.warn(`Product not found: ${slug}`);
      }
    }

    console.log(`Finished populating ${updated} product size chart(s).`);
  } catch (error) {
    console.error('Error populating product size charts:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

populateSizeGuides();
