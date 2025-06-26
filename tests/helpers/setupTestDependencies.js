const testConfig = require('../fixtures/testConfig');

// Mock services for testing
class MockDatabaseService {
  constructor() {
    this.queries = [];
  }
  
  async initialize() {
    // Mock initialization - don't actually connect to database
    return Promise.resolve();
  }
  
  async query(text, params = []) {
    this.queries.push({ text, params });
    return { rows: [], rowCount: 0 };
  }
  
  async close() {
    // Mock close
    return Promise.resolve();
  }

  async healthCheck() {
    return true;
  }

  async getClient() {
    return {
      query: this.query.bind(this),
      release: () => {}
    };
  }
}

class MockUserRepository {
  constructor() {
    this.users = new Map();
    this.nextId = 1;
  }
  
  async findById(id) {
    return this.users.get(id) || null;
  }
  
  async findByUsername(username) {
    return Array.from(this.users.values()).find(user => user.username === username) || null;
  }

  async findByEmail(email) {
    return Array.from(this.users.values()).find(user => user.email === email) || null;
  }
  
  async createUser(userData) {
    const user = {
      id: this.nextId++,
      ...userData,
      created_at: new Date(),
      updated_at: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateLastLogin(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.last_login = new Date();
    }
  }

  async getUserStats(userId) {
    return { collection_count: 0, document_count: 0, total_tokens_used: 0 };
  }

  async findActiveUsers(days = 30) {
    return Array.from(this.users.values());
  }

  async update(id, data) {
    const user = this.users.get(id);
    if (user) {
      Object.assign(user, data, { updated_at: new Date() });
      return user;
    }
    return null;
  }

  async delete(id) {
    const user = this.users.get(id);
    this.users.delete(id);
    return user;
  }
}

class MockCollectionRepository {
  constructor() {
    this.collections = new Map();
    this.nextId = 1;
  }

  async findById(id) {
    return this.collections.get(id) || null;
  }

  async findByUserId(userId, options = {}) {
    return Array.from(this.collections.values()).filter(c => c.user_id === userId);
  }

  async createCollection(data) {
    const collection = {
      id: this.nextId++,
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
    this.collections.set(collection.id, collection);
    return collection;
  }
}

class MockDocumentRepository {
  constructor() {
    this.documents = new Map();
    this.nextId = 1;
  }

  async findById(id) {
    return this.documents.get(id) || null;
  }

  async findByCollectionId(collectionId, options = {}) {
    return Array.from(this.documents.values()).filter(d => d.collection_id === collectionId);
  }

  async searchSimilar(embedding, collectionId = null, limit = 10, threshold = 0.5) {
    return []; // Mock empty search results
  }
}

const setupTestDependencies = async (container) => {
  try {
    // Register test configuration
    container.registerValue('config', testConfig);
    
    // Register mock services
    container.registerValue('database', new MockDatabaseService());
    container.registerValue('userRepository', new MockUserRepository());
    container.registerValue('collectionRepository', new MockCollectionRepository());
    container.registerValue('documentRepository', new MockDocumentRepository());
    
    // Register real services that don't need mocking
    const UserApplicationService = require('../../src/services/application/UserApplicationService');
    container.registerClass('userService', UserApplicationService, {
      dependencies: ['userRepository', 'config']
    });

    const CollectionApplicationService = require('../../src/services/application/CollectionApplicationService');
    container.registerClass('collectionService', CollectionApplicationService, {
      dependencies: ['collectionRepository', 'documentRepository', 'userRepository']
    });

    const SearchApplicationService = require('../../src/services/application/SearchApplicationService');
    container.registerClass('searchService', SearchApplicationService, {
      dependencies: ['documentRepository', 'collectionRepository', 'config']
    });
    
    const UserController = require('../../src/controllers/UserController');
    container.registerClass('userController', UserController, {
      dependencies: ['userService']
    });

    const CollectionController = require('../../src/controllers/CollectionController');
    container.registerClass('collectionController', CollectionController, {
      dependencies: ['collectionService']
    });

    const SearchController = require('../../src/controllers/SearchController');
    container.registerClass('searchController', SearchController, {
      dependencies: ['searchService']
    });

    // Test that all dependencies can be resolved
    const testDeps = ['config', 'userController', 'collectionController', 'searchController'];
    for (const dep of testDeps) {
      container.resolve(dep);
    }
    
    console.log('✅ Test dependencies setup completed successfully');
  } catch (error) {
    console.error('❌ Failed to setup test dependencies:', error.message);
    throw error;
  }
};

module.exports = setupTestDependencies;
