import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './config/logger.js';

const server = http.createServer(app);

const startServer = async () => {
  try {
    // Connect Database
    await connectDB();

    // Start Listening
    server.listen(env.PORT, () => {
      logger.info(` AVN Fitness Backend Server Running in ${env.NODE_ENV} mode`);
      logger.info(` Port: ${env.PORT}`);
      logger.info(` API Prefix: ${env.API_PREFIX}`);
      logger.info(` Health Check: http://localhost:${env.PORT}/health`);
    });
  } catch (error) {
    logger.error(`Fatal Startup Error: ${error.message}`);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await disconnectDB();
    logger.info('Process terminated.');
    process.exit(0);
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection detected:', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', { error: error.message, stack: error.stack });
  process.exit(1);
});

startServer();
