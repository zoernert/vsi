const { DatabaseService } = require('../services/databaseService');
const { VectorService } = require('../services/vector.service');
const { LlmQaService } = require('../services/llm-qa.service');
const { UsageService } = require('../services/usageService');

// External content services
const WebBrowserService = require('../services/webBrowserService');
const WebSearchService = require('../services/webSearchService');
const ExternalContentService = require('../services/externalContentService');

// Controllers
const UserController = require('../controllers/userController');
const CollectionController = require('../controllers/collectionController');
const SearchController = require('../controllers/searchController');

class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, singleton = false) {
    this.services.set(name, { factory, singleton });
  }

  resolve(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found in container`);
    }

    if (service.singleton) {
      if (!this.singletons.has(name)) {
        this.singletons.set(name, service.factory(this));
      }
      return this.singletons.get(name);
    }

    return service.factory(this);
  }
}

function createContainer() {
  const container = new DIContainer();

  // Register services
  container.register('databaseService', () => new DatabaseService(), true);
  container.register('vectorService', () => new VectorService(), true);
  container.register('llmQaService', (container) => new LlmQaService(container.resolve('vectorService')), true);
  container.register('usageService', (container) => new UsageService(container.resolve('databaseService')), true);

  // Register external content services
  container.register('webBrowserService', () => new WebBrowserService({
    enabled: process.env.EXTERNAL_CONTENT_ENABLED === 'true',
    apiBase: process.env.BROWSER_API_BASE || 'https://browserless.corrently.cloud',
    timeout: parseInt(process.env.BROWSER_API_TIMEOUT) || 60000,
    maxCommands: 50,
    maxConcurrentSessions: 3
  }), true);
  
  container.register('webSearchService', () => new WebSearchService({
    enabled: process.env.WEB_SEARCH_ENABLED === 'true',
    provider: process.env.WEB_SEARCH_PROVIDER || 'duckduckgo',
    maxResults: parseInt(process.env.MAX_EXTERNAL_SOURCES) || 5,
    timeout: 30000
  }), true);
  
  container.register('externalContentService', (container) => new ExternalContentService({
    webBrowserService: container.resolve('webBrowserService'),
    webSearchService: container.resolve('webSearchService'),
    enableWebSearch: process.env.WEB_SEARCH_ENABLED === 'true',
    enableWebBrowsing: process.env.EXTERNAL_CONTENT_ENABLED === 'true',
    maxExternalSources: parseInt(process.env.MAX_EXTERNAL_SOURCES) || 5
  }), true);

  // Register controllers
  container.register('userController', (container) => new UserController(
    container.resolve('databaseService'),
    container.resolve('usageService')
  ));
  
  container.register('collectionController', (container) => new CollectionController(
    container.resolve('databaseService'),
    container.resolve('vectorService'),
    container.resolve('usageService')
  ));
  
  container.register('searchController', (container) => new SearchController(
    container.resolve('vectorService'),
    container.resolve('llmQaService'),
    container.resolve('usageService')
  ));

  return container;
}

module.exports = { createContainer };
