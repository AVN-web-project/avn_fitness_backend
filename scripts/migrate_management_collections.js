import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

// Management collections mapped from old names to new _m names
const managementMap = [
  { oldNames: ['admin'], target: 'admin_m', purpose: 'Super-admin identity/configuration' },
  { oldNames: ['staff'], target: 'staff_m', purpose: 'Management users, roles and access' },
  { oldNames: ['staffActivityLogs', 'activitylogs'], target: 'staffActivityLogs_m', purpose: 'Audit trail of management actions' },
  { oldNames: ['payments'], target: 'payments_m', purpose: 'Payment transactions, refunds and reconciliation' },
  { oldNames: ['shipments'], target: 'shipments_m', purpose: 'Fulfilment, courier and delivery tracking' },
  { oldNames: ['coupons'], target: 'coupons_m', purpose: 'Promotional campaigns and discount rules' },
  { oldNames: ['inventory'], target: 'inventory_m', purpose: 'Stock levels, movements and inventory operations' },
  { oldNames: ['supportRequests', 'supportrequests'], target: 'supportRequests_m', purpose: 'Customer support tickets and resolution workflow' },
];

async function migrateManagementCollections() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    console.log(`Connected to DB: ${db.databaseName}\n`);

    const initialCollections = (await db.listCollections().toArray()).map((c) => c.name);
    console.log('Collections before migration:\n', initialCollections.join(', '), '\n');

    for (const item of managementMap) {
      console.log(`\n--- Processing target: ${item.target} (${item.purpose}) ---`);

      // Ensure target collection exists
      const targetExists = (await db.listCollections({ name: item.target }).toArray()).length > 0;
      if (!targetExists) {
        console.log(`Creating collection: ${item.target}`);
        await db.createCollection(item.target);
      }

      const targetCol = db.collection(item.target);

      // Check if any old collection has documents and transfer them
      for (const oldName of item.oldNames) {
        const oldExists = (await db.listCollections({ name: oldName }).toArray()).length > 0;
        if (oldExists) {
          const oldCol = db.collection(oldName);
          const count = await oldCol.countDocuments();
          if (count > 0) {
            console.log(`Migrating ${count} document(s) from '${oldName}' to '${item.target}'...`);
            const docs = await oldCol.find({}).toArray();
            await targetCol.insertMany(docs);
            console.log(`Transferred ${docs.length} document(s).`);
          }
          console.log(`Dropping old collection '${oldName}'...`);
          await db.dropCollection(oldName);
        }
      }

      const finalCount = await targetCol.countDocuments();
      console.log(`✓ Collection '${item.target}' is active with ${finalCount} document(s).`);
    }

    // List all final collections
    const finalCollections = await db.listCollections().toArray();
    const finalReport = [];

    for (const c of finalCollections) {
      const count = await db.collection(c.name).countDocuments();
      const isManagement = c.name.endsWith('_m');
      finalReport.push({
        collection: c.name,
        type: isManagement ? 'Management' : 'Core/Customer',
        count,
      });
    }

    console.log('\n=== Final MongoDB Collections Status ===');
    console.table(finalReport);

    await mongoose.disconnect();
    console.log('\nMongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateManagementCollections();
