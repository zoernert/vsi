const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'body' ? req.body : req.query;
    
    if (!schema || typeof schema !== 'object') {
      return next();
    }
    
    const errors = [];
    
    // Validate each field in the schema
    for (const [fieldName, rules] of Object.entries(schema)) {
      const value = data[fieldName];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${fieldName}' is required`);
        continue;
      }
      
      // Skip validation if field is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      if (rules.type) {
        if (rules.type === 'string' && typeof value !== 'string') {
          errors.push(`Field '${fieldName}' must be a string`);
          continue;
        }
        if (rules.type === 'number' && typeof value !== 'number') {
          errors.push(`Field '${fieldName}' must be a number`);
          continue;
        }
        if (rules.type === 'integer' && (!Number.isInteger(value) || typeof value !== 'number')) {
          errors.push(`Field '${fieldName}' must be an integer`);
          continue;
        }
        if (rules.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field '${fieldName}' must be a boolean`);
          continue;
        }
      }
      
      // String length validation
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`Field '${fieldName}' must be at least ${rules.minLength} characters long`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`Field '${fieldName}' must be no more than ${rules.maxLength} characters long`);
        }
        
        // Email format validation
        if (rules.format === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`Field '${fieldName}' must be a valid email address`);
          }
        }
        
        // URL format validation
        if (rules.format === 'url') {
          try {
            new URL(value);
          } catch {
            errors.push(`Field '${fieldName}' must be a valid URL`);
          }
        }
      }
      
      // Number range validation
      if (typeof value === 'number') {
        if (rules.minimum !== undefined && value < rules.minimum) {
          errors.push(`Field '${fieldName}' must be at least ${rules.minimum}`);
        }
        if (rules.maximum !== undefined && value > rules.maximum) {
          errors.push(`Field '${fieldName}' must be no more than ${rules.maximum}`);
        }
      }
      
      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`Field '${fieldName}' must be one of: ${rules.enum.join(', ')}`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    
    next();
  };
};

/**
 * UUID validation utility
 */
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Middleware to validate UUID parameters
 */
const validateUUID = (paramName) => (req, res, next) => {
  const uuid = req.params[paramName];
  if (!uuid) {
    return res.status(400).json({
      error: 'Missing UUID parameter',
      parameter: paramName
    });
  }
  
  if (!isValidUUID(uuid)) {
    return res.status(400).json({
      error: 'Invalid UUID format',
      parameter: paramName,
      received: uuid
    });
  }
  
  next();
};

/**
 * Middleware to validate collection UUID
 */
const validateCollectionUUID = validateUUID('uuid');

/**
 * Middleware to validate collection ID (supports both integer ID and UUID during transition)
 */
const validateCollectionId = (req, res, next) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({
      error: 'Missing collection identifier',
      parameter: 'id'
    });
  }
  
  // During transition period, accept both integer IDs and UUIDs
  const isInteger = /^\d+$/.test(id);
  const isUUID = isValidUUID(id);
  
  if (!isInteger && !isUUID) {
    return res.status(400).json({
      error: 'Invalid collection identifier format (must be integer ID or UUID)',
      parameter: 'id',
      received: id
    });
  }
  
  // Mark the request with the identifier type for downstream processing
  req.collectionIdType = isUUID ? 'uuid' : 'id';
  
  next();
};

const schemas = {
  user: {
    register: {
      username: { required: true, type: 'string', minLength: 3, maxLength: 50 },
      password: { required: true, type: 'string', minLength: 6, maxLength: 128 },
      email: { type: 'string', format: 'email' }
    },
    login: {
      username: { required: true, type: 'string' },
      password: { required: true, type: 'string' }
    },
    update: {
      username: { type: 'string', minLength: 3, maxLength: 50 },
      email: { type: 'string', format: 'email' }
    },
    changePassword: {
      currentPassword: { required: true, type: 'string' },
      newPassword: { required: true, type: 'string', minLength: 6, maxLength: 128 }
    },
    adminCreate: {
      username: { required: true, type: 'string', minLength: 3, maxLength: 50 },
      password: { required: true, type: 'string', minLength: 6, maxLength: 128 },
      email: { type: 'string', format: 'email' },
      isAdmin: { type: 'boolean', default: false },
      tier: { type: 'string', enum: ['free', 'pro', 'unlimited'], default: 'free' }
    },
    adminUpdate: {
      password: { type: 'string', minLength: 6, maxLength: 128 },
      isAdmin: { type: 'boolean' },
      tier: { type: 'string', enum: ['free', 'pro', 'unlimited'] },
      email: { type: 'string', format: 'email' }
    }
  },
  collection: {
    create: {
      name: { required: true, type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', maxLength: 1000 }
    },
    update: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', maxLength: 1000 }
    }
  },
  document: {
    uploadUrl: {
      url: { required: true, type: 'string', format: 'url' },
      filename: { type: 'string', maxLength: 255 }
    },
    createText: {
      title: { required: true, type: 'string', minLength: 1, maxLength: 255 },
      content: { required: true, type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['txt', 'md'], default: 'txt' }
    }
  },
  search: {
    collection: {
      query: { required: true, type: 'string', minLength: 1 },
      threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 }
    },
    ask: {
      question: { required: true, type: 'string', minLength: 1 },
      maxQueries: { type: 'integer', minimum: 1, maximum: 10, default: 3 }
    },
    query: {
      q: { required: true, type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.5 }
    }
  }
};

module.exports = { 
  validate, 
  schemas, 
  isValidUUID, 
  validateUUID, 
  validateCollectionUUID, 
  validateCollectionId 
};
