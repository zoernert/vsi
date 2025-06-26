const { logger } = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Generate unique request ID
  req.requestId = Math.random().toString(36).substring(2, 15);
  
  // Log incoming request
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId || null
  });

  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(body) {
    res.responseBody = body;
    return originalJson.call(this, body);
  };

  // Log response when request finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    
    logger[logLevel]('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('content-length') || 0,
      userId: req.user?.userId || null,
      success: res.responseBody?.success || res.statusCode < 400
    });
  });

  next();
};

const errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode
    },
    userId: req.user?.userId || null
  });
  
  next(err);
};

module.exports = {
  requestLogger,
  errorLogger
};
