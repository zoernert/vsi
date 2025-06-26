const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');
const { apiLimiter, authLimiter, searchLimiter } = require('../middleware/rateLimiting');

const setupApiRoutes = (container) => {
  if (!container) {
    throw new Error('Dependency injection container is required for API routes setup');
  }

  const router = express.Router();

  // Get controllers from DI container with error handling
  let userController, collectionController, searchController;
  
  try {
    userController = container.resolve('userController');
    collectionController = container.resolve('collectionController');
    searchController = container.resolve('searchController');
  } catch (error) {
    throw new Error(`Failed to resolve controllers from DI container: ${error.message}`);
  }

  // Apply general API rate limiting
  router.use(apiLimiter);

  // Auth routes
  router.post('/auth/register', 
    authLimiter,
    validate(schemas.user.register),
    userController.register
  );

  router.post('/auth/login',
    authLimiter,
    validate(schemas.user.login),
    userController.login
  );

  // User routes
  router.get('/users/profile', 
    authenticateToken,
    userController.getProfile
  );

  router.put('/users/profile',
    authenticateToken,
    validate(schemas.user.update),
    userController.updateProfile
  );

  router.post('/users/change-password',
    authenticateToken,
    validate(schemas.user.changePassword),
    userController.changePassword
  );

  router.delete('/users/account',
    authenticateToken,
    userController.deleteAccount
  );

  // Add user usage endpoint
  router.get('/users/usage',
    authenticateToken,
    userController.getUserUsage
  );

  // Admin user routes
  router.get('/admin/users/active',
    authenticateToken,
    requireAdmin,
    userController.getActiveUsers
  );

  // Collection routes
  router.post('/collections',
    authenticateToken,
    validate(schemas.collection.create),
    collectionController.createCollection
  );

  router.get('/collections',
    authenticateToken,
    collectionController.getUserCollections
  );

  router.get('/collections/:id',
    authenticateToken,
    collectionController.getCollection
  );

  router.put('/collections/:id',
    authenticateToken,
    validate(schemas.collection.update),
    collectionController.updateCollection
  );

  router.delete('/collections/:id',
    authenticateToken,
    collectionController.deleteCollection
  );

  router.get('/collections/:id/documents',
    authenticateToken,
    collectionController.getCollectionDocuments
  );

  router.get('/collections/:id/stats',
    authenticateToken,
    collectionController.getCollectionStats
  );

  // Document management routes
  router.post('/collections/:id/documents/upload',
    authenticateToken,
    collectionController.uploadDocument
  );

  router.post('/collections/:id/documents/upload-url',
    authenticateToken,
    validate(schemas.document.uploadUrl),
    collectionController.uploadFromUrl
  );

  router.post('/collections/:id/documents/create-text',
    authenticateToken,
    validate(schemas.document.createText),
    collectionController.createTextDocument
  );

  router.delete('/collections/:id/documents/:documentId',
    authenticateToken,
    collectionController.deleteDocument
  );

  router.post('/collections/:id/reindex',
    authenticateToken,
    collectionController.reindexCollection
  );

  // Search and Q&A routes
  router.post('/collections/:id/search',
    searchLimiter,
    authenticateToken,
    validate(schemas.search.collection),
    searchController.searchCollection
  );

  router.post('/collections/:id/ask',
    searchLimiter,
    authenticateToken,
    validate(schemas.search.ask),
    searchController.askQuestion
  );

  // Global search routes
  router.get('/search',
    searchLimiter,
    optionalAuth,
    validate(schemas.search.query, 'query'),
    searchController.searchDocuments
  );

  router.get('/search/my-collections',
    searchLimiter,
    authenticateToken,
    validate(schemas.search.query, 'query'),
    searchController.searchUserCollections
  );

  router.get('/search/public',
    searchLimiter,
    validate(schemas.search.query, 'query'),
    searchController.publicSearch
  );

  router.get('/documents/:id',
    authenticateToken,
    searchController.getDocumentContent
  );

  router.get('/documents/:id/similar',
    searchController.getSimilarDocuments
  );

  // Admin routes
  router.get('/admin/dashboard',
    authenticateToken,
    requireAdmin,
    userController.getAdminDashboard
  );

  router.get('/admin/users',
    authenticateToken,
    requireAdmin,
    userController.getAllUsers
  );

  router.post('/admin/users',
    authenticateToken,
    requireAdmin,
    validate(schemas.user.adminCreate),
    userController.createUser
  );

  router.put('/admin/users/:username',
    authenticateToken,
    requireAdmin,
    validate(schemas.user.adminUpdate),
    userController.updateUser
  );

  router.delete('/admin/users/:username',
    authenticateToken,
    requireAdmin,
    userController.deleteUser
  );

  router.get('/admin/system/health',
    authenticateToken,
    requireAdmin,
    userController.getSystemHealth
  );

  // Health check route
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'API is healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  return router;
};

module.exports = setupApiRoutes;
