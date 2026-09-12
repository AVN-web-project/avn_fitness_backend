import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

// Redundant duplicate collection names to drop
const redundantCollections = ['activitylogs', 'supportrequests'];

async function cleanRedundantCollections() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    const collectionsBefore = await db.listCollections().toArray();
    const beforeNames = collectionsBefore.map((c) => c.name);
    console.log('\nCollections before cleanup:', beforeNames);

    const dropped = [];

    for (const name of redundantCollections) {
      if (beforeNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        console.log(`Dropping redundant collection '${name}' (${count} documents)...`);
        await db.dropCollection(name);
        dropped.push({ name, count, status: 'Dropped' });
      } else {
        console.log(`Collection '${name}' not found.`);
      }
    }

    const collectionsAfter = await db.listCollections().toArray();
    const afterNames = collectionsAfter.map((c) => c.name);
    console.log('\nCollections after cleanup:', afterNames);

    console.log('\n=== Summary of Removed Collections ===');
    console.table(dropped);

    await mongoose.disconnect();
    console.log('\nMongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error removing redundant collections:', error);
    process.exit(1);
  }
}

cleanRedundantCollections();
