'use strict';

/**
 * Process entrypoint
 * ------------------
 * Boots the Express app, initialises the MySQL pool, connects to Redis (or
 * falls back gracefully if unreachable), and installs SIGINT/SIGTERM hooks
 * so the process drains in flight requests on shutdown.
 *
 * If Redis is unavailable the API still runs - cache helpers transparently
 * short-circuit and the database serves every request directly.
 */

const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const db = require('./config/database');
const redis = require('./config/redis');

async function start() {
  try {
    const dbOk = await db.ping();
    if (!dbOk) {
      logger.warn('Database not reachable on startup - the API will attempt reconnection on demand.');
    } else {
      logger.info('Database connection OK');
    }

    await redis.init();
    if (!redis.isReady()) {
      logger.warn('Redis not connected - cache operations will fall back to MySQL only.');
    }

    const server = app.listen(config.port, () => {
      logger.info(`MatchHire API listening on http://localhost:${config.port}${config.apiPrefix} [${config.nodeEnv}]`);
      logger.info(`Swagger UI:   http://localhost:${config.port}/api-docs`);
      logger.info(`OpenAPI JSON: http://localhost:${config.port}/api-docs.json`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });

    /**
     * Graceful shutdown - drain HTTP, close DB pool and Redis client.
     *
     * Listens to SIGINT (Ctrl+C), SIGTERM (orchestrators), and SIGUSR2
     * (nodemon's restart signal). SIGUSR2 is registered with `once` so
     * nodemon's own listener still fires after we exit and it can spawn
     * the replacement process. Without this, nodemon restarts would
     * orphan the previous server and bind to :3500 would fail with
     * EADDRINUSE on every save during development.
     */
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        try {
          await db.close();
          await redis.close();
        } catch (err) { logger.warn('Error during shutdown', { error: err.message }); }
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGUSR2', () => shutdown('SIGUSR2'));
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.message : reason });
    });
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    });
  } catch (err) {
    logger.error('Server failed to start', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();
