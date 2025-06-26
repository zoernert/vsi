const { expect } = require('chai');
const request = require('supertest');
const { before, after } = require('mocha');

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/vsi_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.GEMINI_API_KEY = 'test-key';
process.env.QDRANT_URL = 'http://localhost:6333';

before(async function() {
    console.log('Setting up test environment...');
    // Add any global test setup here
});

after(async function() {
    console.log('Cleaning up test environment...');
    // Add any global test cleanup here
});

global.expect = expect;
global.request = request;

let testContainer = null;
let initializationError = null;

async function initializeTestContainer() {
  try {
    // FIX: Correct import for DIContainer
    const DIContainer = require('../src/container/DIContainer');
    const setupTestDependencies = require('./helpers/setupTestDependencies');
    const { logger } = require('../src/utils/logger');

    const container = new DIContainer();
    await setupTestDependencies(container);

    const requiredDependencies = [
      'config', 'database', 'userRepository', 'collectionRepository',
      'documentRepository', 'userService', 'collectionService',
      'searchService', 'userController', 'collectionController', 'searchController'
    ];

    for (const dep of requiredDependencies) {
      try {
        container.resolve(dep);
      } catch (error) {
        throw new Error(`Failed to resolve dependency '${dep}': ${error.message}`);
      }
    }

    testContainer = container;
    global.testContainer = container;

    logger.info('Test environment initialized successfully', {
      dependencies: requiredDependencies.length
    });

    return container;
  } catch (error) {
    initializationError = error;
    throw error;
  }
}

exports.mochaHooks = {
  async beforeAll() {
    this.timeout(20000);
    if (initializationError) throw initializationError;
    if (!testContainer) await initializeTestContainer();
  },
  async afterAll() {
    this.timeout(5000);
    try {
      if (global.testContainer) {
        global.testContainer.clear();
        global.testContainer = null;
        testContainer = null;
      }
      const { logger } = require('../src/utils/logger');
      logger.info('Test environment cleaned up');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to cleanup test environment:', error.message);
    }
  }
};
