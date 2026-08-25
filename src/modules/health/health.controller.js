import { ApiResponse } from '../../utils/apiResponse.js';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';

export const getHealthStatus = (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const healthData = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: {
      status: dbStatusMap[dbState] || 'unknown',
      connected: dbState === 1,
    },
    version: '1.0.0',
  };

  return ApiResponse.success(res, healthData, 'AVN Fitness Backend API is operational');
};
