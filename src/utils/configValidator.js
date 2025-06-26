const Joi = require('joi');

const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().port().required(),
    nodeEnv: Joi.string().valid('development', 'production', 'test').required(),
    baseUrl: Joi.string().uri().required()
  }).required(),
  
  // Remove database validation since it's in a separate config file
  
  auth: Joi.object({
    jwtSecret: Joi.string().min(32).required(),
    tokenExpiry: Joi.string().required(),
    allowSelfRegistration: Joi.boolean().required()
  }).required(),
  
  ai: Joi.object({
    googleApiKey: Joi.string().when('$nodeEnv', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    modelName: Joi.string().required(),
    embeddingModel: Joi.string().required()
  }).required(),

  storage: Joi.object({
    uploadDir: Joi.string().required(),
    maxFileSize: Joi.number().positive().required(),
    allowedTypes: Joi.array().items(Joi.string()).required()
  }).required(),

  cache: Joi.object({
    ttl: Joi.number().positive().required(),
    redisUrl: Joi.string().optional()
  }).required()
});

const validateConfig = (config) => {
  const errors = [];

  // Validate required fields
  if (!config.auth.jwtSecret || config.auth.jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
    console.warn('Warning: Using default JWT secret. Please set JWT_SECRET environment variable in production.');
  }

  if (!config.database.host) {
    errors.push('Database host is required');
  }

  if (!config.database.user) {
    errors.push('Database user is required');
  }

  if (!config.database.password) {
    errors.push('Database password is required');
  }

  if (!config.ai.googleApiKey) {
    console.warn('Warning: Google AI API key not set. AI features will be limited.');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }

  return config;
};

module.exports = { validateConfig };
