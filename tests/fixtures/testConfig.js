module.exports = {
  server: {
    port: 3001,
    nodeEnv: 'test',
    baseUrl: 'http://localhost:3001'
  },
  
  database: {
    url: 'postgresql://test_user:test_password@localhost:5432/vsi_test',
    pool: {
      min: 1,
      max: 5,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 10000
    }
  },
  
  auth: {
    jwtSecret: 'test-secret-key-for-testing-only-minimum-32-characters-long',
    tokenExpiry: '1h',
    allowSelfRegistration: true
  },
  
  ai: {
    googleApiKey: 'test-api-key',
    modelName: 'test-model',
    embeddingModel: 'test-embedding-model'
  },
  
  storage: {
    uploadDir: './tests/fixtures/uploads',
    maxFileSize: 1024 * 1024, // 1MB for tests
    allowedTypes: ['txt', 'pdf']
  },

  cache: {
    ttl: 300, // 5 minutes for tests
    redisUrl: null // No Redis in tests
  }
};
