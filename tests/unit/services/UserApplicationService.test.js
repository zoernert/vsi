const { expect } = require('chai');
const UserApplicationService = require('../../../src/services/application/UserApplicationService');
const { ValidationError, UnauthorizedError } = require('../../../src/utils/errorHandler');

describe('UserApplicationService', () => {
  it('should be able to run basic tests', () => {
    expect(true).to.equal(true);
  });

  it('should have access to test globals', () => {
    expect(global.expect).to.be.a('function');
    expect(global.request).to.be.a('function');
  });

  let userService;
  let mockUserRepository;
  let mockConfig;
  
  beforeEach(() => {
    mockUserRepository = {
      findByUsername: async () => null,
      findByEmail: async () => null,
      createUser: async (userData) => ({ id: 1, ...userData }),
      updateLastLogin: async () => {},
      getUserStats: async () => ({ collection_count: 0, document_count: 0 })
    };
    
    mockConfig = {
      auth: {
        jwtSecret: 'test-secret',
        tokenExpiry: '1h'
      }
    };
    
    userService = new UserApplicationService(mockUserRepository, mockConfig);
  });
  
  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPass123!'
      };
      
      const result = await userService.registerUser(userData);
      
      expect(result).to.have.property('id');
      expect(result).to.have.property('username', 'testuser');
      expect(result).to.have.property('email', 'test@example.com');
      expect(result).to.not.have.property('password');
    });
    
    it('should throw ValidationError if username already exists', async () => {
      mockUserRepository.findByUsername = async () => ({ id: 1, username: 'testuser' });
      
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPass123!'
      };
      
      try {
        await userService.registerUser(userData);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.equal('Username already exists');
      }
    });
  });
  
  describe('authenticateUser', () => {
    it('should throw UnauthorizedError for invalid credentials', async () => {
      try {
        await userService.authenticateUser('nonexistent', 'password');
        expect.fail('Should have thrown UnauthorizedError');
      } catch (error) {
        expect(error).to.be.instanceOf(UnauthorizedError);
        expect(error.message).to.equal('Invalid credentials');
      }
    });
  });
});
