import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avn_fitness';

const requiredCollections = [
  { name: 'admin', purpose: 'Super-admin identity/configuration' },
  { name: 'staff', purpose: 'Management users, roles and access' },
  { name: 'staffActivityLogs', purpose: 'Audit trail of management actions' },
  { name: 'payments', purpose: 'Payment transactions, refunds and reconciliation' },
  { name: 'shipments', purpose: 'Fulfilment, courier and delivery tracking' },
  { name: 'coupons', purpose: 'Promotional campaigns and discount rules' },
  { name: 'inventory', purpose: 'Stock levels, movements and inventory operations' },
  { name: 'supportRequests', purpose: 'Customer support tickets and resolution workflow' }
];

async function verifyAndCreate() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);
    const conn = await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    console.log(`\nConnected to Database: "${db.databaseName}"`);

    // List all existing collections
    const collections = await db.listCollections().toArray();
    const existingNames = collections.map(c => c.name);

    console.log('\n--- Current Existing Collections in DB ---');
    console.log(existingNames.length > 0 ? existingNames.join(', ') : '(No collections exist yet)');

    console.log('\n--- Checking Required Management Collections ---');
    const results = [];

    for (const item of requiredCollections) {
      // Check exact match or case-insensitive / mongoose plural variations if any
      const existsExact = existingNames.includes(item.name);
      
      if (existsExact) {
        console.log(`[EXISTS]  Collection '${item.name}' already exists.`);
        results.push({ name: item.name, status: 'Already Existed', purpose: item.purpose });
      } else {
        console.log(`[CREATING] Collection '${item.name}' does not exist. Creating now...`);
        await db.createCollection(item.name);
        console.log(`[CREATED]  Collection '${item.name}' created successfully.`);
        results.push({ name: item.name, status: 'Created', purpose: item.purpose });
      }
    }

    // List updated collections
    const updatedCollections = await db.listCollections().toArray();
    const updatedNames = updatedCollections.map(c => c.name);
    console.log('\n--- Updated Collections in DB ---');
    console.log(updatedNames.join(', '));

    console.log('\n=== Summary of Verification and Creation ===');
    console.table(results);

    await mongoose.disconnect();
    console.log('\nMongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during verification/creation:', error);
    process.exit(1);
  }
}

verifyAndCreate();
