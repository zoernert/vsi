require('dotenv').config();
const createApp = require('./app');
const { logger } = require('./src/utils/logger');

async function startServer() {
  try {
    const app = await createApp();
    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, () => {
      logger.info(`VSI Vector Store server started on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', { error: error.message });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

startServer();
