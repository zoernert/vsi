const { globalErrorHandler, errorLogger } = require('../utils/errorHandler');

// Export the middleware functions for use in routes
module.exports = {
  errorLogger,
  globalErrorHandler
};
