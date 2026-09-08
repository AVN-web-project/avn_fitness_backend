import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

export default async function handler(req, res) {
  try {
    await connectDB();

    // Workaround for Vercel rewriting req.url to /api/index.js
    if (req.url && (req.url.startsWith('/api/index.js') || req.url.startsWith('/api/index') || req.url === '/api')) {
      if (req.originalUrl && req.originalUrl !== req.url) {
        req.url = req.originalUrl;
      }
    }

    return app(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Serverless execution error: ' + error.message,
    });
  }
}
