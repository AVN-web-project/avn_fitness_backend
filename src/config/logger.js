/**
 * Structured Application Logger
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  reset: '\x1b[0m',
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  http: '\x1b[35m',  // Magenta
  debug: '\x1b[32m', // Green
};

const formatMessage = (level, message, meta = '') => {
  const timestamp = new Date().toISOString();
  const color = colors[level] || colors.reset;
  const metaStr = meta && Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset} ${message}${metaStr}`;
};

export const logger = {
  error: (msg, meta) => console.error(formatMessage('error', msg, meta)),
  warn: (msg, meta) => console.warn(formatMessage('warn', msg, meta)),
  info: (msg, meta) => console.log(formatMessage('info', msg, meta)),
  http: (msg, meta) => console.log(formatMessage('http', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(formatMessage('debug', msg, meta));
    }
  },
};
