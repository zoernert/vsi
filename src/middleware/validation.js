const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    // Basic validation - replace with proper validation library like Joi
    const data = source === 'body' ? req.body : req.query;
    
    // For now, just pass through - implement proper validation later
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
    register: {},
    login: {},
    update: {},
    changePassword: {},
    adminCreate: {},
    adminUpdate: {}
  },
  collection: {
    create: {},
    update: {}
  },
  document: {
    uploadUrl: {},
    createText: {}
  },
  search: {
    collection: {},
    ask: {},
    query: {}
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
