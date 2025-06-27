const express = require('express');
const path = require('path');
const setupDependencies = require('../src/container/setup');
const setupApiRoutes = require('../src/routes/api');
const { securityMiddleware } = require('../src/middleware/security');
const { requestLogger, errorLogger } = require('../src/middleware/logging');
const { globalErrorHandler } = require('../src/utils/errorHandler');
const { logger } = require('../src/utils/logger');

async function createApp() {
  const app = express();

  try {
    // Setup dependency injection container
    const container = setupDependencies();

    // Initialize database
    const database = container.resolve('database');
    await database.initialize();

    // Security middleware (helmet, cors)
    app.use(securityMiddleware);

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    app.use(requestLogger);

    // API routes
    app.use('/api/v1', setupApiRoutes(container));

    // Serve static files if needed
    app.use(express.static(path.join(__dirname, 'public')));

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        timestamp: new Date().toISOString()
      });
    });

    // Error handling middleware
    app.use(errorLogger);
    app.use(globalErrorHandler);

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await database.close();
        logger.info('Database connections closed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return app;

  } catch (error) {
    logger.error('Failed to create application', { error: error.message });
    throw error;
  }
}

module.exports = createApp;
