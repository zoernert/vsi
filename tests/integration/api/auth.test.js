const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const setupApiRoutes = require('../../../src/routes/api');

describe('Authentication API', () => {
  let app;
  let testContainer;

  before(async function() {
    this.timeout(20000);

    // Wait for global.testContainer to be initialized by the global setup
    let attempts = 0;
    const maxAttempts = 100;
    while (!global.testContainer && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (!global.testContainer) {
      throw new Error('Global test container not initialized. Check test setup.');
    }

    testContainer = global.testContainer;

    // Create a simple express app for testing
    app = express();
    app.use(express.json());

    // Add basic error handling middleware before routes
    app.use((req, res, next) => {
      req.requestId = Math.random().toString(36).substring(2, 15);
      next();
    });

    // Use the API routes with test container
    app.use('/api/v1', setupApiRoutes(testContainer));

    // Error handler for tests
    app.use((err, req, res, next) => {
      console.error('Test error:', err.message);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
        details: err.details || null
      });
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'integrationtestuser',
        email: 'integration@example.com',
        password: 'TestPass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.have.property('username', 'integrationtestuser');
      expect(response.body.data).to.not.have.property('password');
    });

    it('should return 400 for invalid data', async () => {
      const userData = {
        username: 'tu', // Too short
        email: 'invalid-email',
        password: '123' // Too weak
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('details');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 401 for invalid credentials', async () => {
      const loginData = {
        username: 'nonexistent',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('success', false);
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('message', 'API is healthy');
    });
  });
});
