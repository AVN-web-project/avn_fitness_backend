import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

let isConnected = false;

export const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    logger.info('Using existing database connection');
    return;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      // autoIndex rebuilds every index on each connection. Fine on a long-running server
      // (once, at boot), but on serverless every cold start re-walks the collections and
      // adds seconds to the first request — which is why small responses were taking ~2s.
      // Indexes already exist in the database; build them explicitly if that ever changes.
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });

    isConnected = conn.connections[0].readyState === 1;
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    isConnected = false;
    if (env.NODE_ENV === 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
  isConnected = false;
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB internal connection error: ${err.message}`);
});

export const disconnectDB = async () => {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed gracefully');
  }
};
