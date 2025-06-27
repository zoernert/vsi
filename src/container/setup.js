const DIContainer = require('./DIContainer');
const config = require('../config');
const databaseConfig = require('../config/database');
const { validateConfig } = require('../utils/configValidator');

// Database
const { DatabaseService } = require('../services/databaseService');
const { VectorService } = require('../services/vector.service'); // Import VectorService

// Repositories
const UserRepository = require('../repositories/UserRepository');
const CollectionRepository = require('../repositories/CollectionRepository');
const DocumentRepository = require('../repositories/DocumentRepository');

// Services
const UserService = require('../services/application/UserApplicationService');
const CollectionService = require('../services/application/CollectionApplicationService');
const SearchService = require('../services/application/SearchApplicationService');

// Controllers
const UserController = require('../controllers/UserController');
const CollectionController = require('../controllers/CollectionController');
const SearchController = require('../controllers/SearchController');

const setupDependencies = () => {
  const container = new DIContainer();

  // Validate configuration
  const validatedConfig = validateConfig(config);

  // Register configuration
  container.registerValue('config', validatedConfig);
  container.registerValue('databaseConfig', databaseConfig);

  // Register database service with database config
  container.registerClass('database', DatabaseService, {
    dependencies: ['databaseConfig']
  });

  // Register VectorService
  container.registerClass('vectorService', VectorService, {
    dependencies: [] // Add its dependencies if any, assuming none for now
  });

  // Register repositories
  container.registerClass('userRepository', UserRepository, {
    dependencies: ['database']
  });

  container.registerClass('collectionRepository', CollectionRepository, {
    dependencies: ['database']
  });

  container.registerClass('documentRepository', DocumentRepository, {
    dependencies: ['database']
  });

  // Register application services
  container.registerClass('userService', UserService, {
    dependencies: ['userRepository', 'config']
  });

  container.registerClass('collectionService', CollectionService, {
    dependencies: ['collectionRepository', 'documentRepository', 'userRepository', 'vectorService']
  });

  container.registerClass('searchService', SearchService, {
    dependencies: ['documentRepository', 'collectionRepository', 'config']
  });

  // Register controllers
  container.registerClass('userController', UserController, {
    dependencies: ['userService']
  });

  container.registerClass('collectionController', CollectionController, {
    dependencies: ['collectionService']
  });

  container.registerClass('searchController', SearchController, {
    dependencies: ['searchService']
  });

  return container;
};

module.exports = setupDependencies;
