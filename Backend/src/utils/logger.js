'use strict';

/**
 * Logger (winston)
 * ----------------
 * Structured JSON logger used across the app. Console transport pretty-prints
 * locally; in production the JSON formatter is the default so log aggregators
 * (Datadog, CloudWatch, Loki, ...) get structured events out of the box.
 *
 * Morgan's HTTP logger streams into this logger via `logger.stream`.
 */

const winston = require('winston');

const level = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'matchhire-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
          const m = Object.keys(meta).filter((k) => k !== 'service').length
            ? ' ' + JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'service')))
            : '';
          return `${timestamp} ${lvl}: ${message}${m}`;
        })
      ),
    }),
  ],
});

logger.stream = {
  write: (msg) => logger.http ? logger.http(msg.trim()) : logger.info(msg.trim()),
};

module.exports = logger;
