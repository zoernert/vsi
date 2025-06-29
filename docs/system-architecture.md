# System Architecture Overview

## Introduction

The VSI Vector Store is a comprehensive, enterprise-grade vector database and intelligent research platform. This document provides a detailed technical overview of the system architecture, components, and integration patterns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Web UI    │  │  REST API   │  │  MCP API    │           │
│  │ (Frontend)  │  │   Server    │  │   Server    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                      Application Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Agent     │  │   Smart     │  │  External   │           │
│  │   System    │  │  Context    │  │  Content    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                      Business Logic Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Collection  │  │   Search    │  │ Clustering  │           │
│  │  Services   │  │  Services   │  │  Services   │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                         Data Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ PostgreSQL  │  │   Vector    │  │   File      │           │
│  │  Database   │  │   Store     │  │  Storage    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Presentation Layer

#### Web User Interface
- **Location**: `public/` directory
- **Technology**: HTML5, CSS3, JavaScript
- **Features**: 
  - Responsive design for desktop and mobile
  - Real-time search and analytics
  - Collection management interface
  - Admin dashboard for system management
  - Dark/light theme support

#### REST API Server
- **Location**: `src/routes/` directory
- **Technology**: Express.js with middleware stack
- **Authentication**: JWT-based with role management
- **Features**:
  - RESTful endpoints for all operations
  - OpenAPI/Swagger documentation
  - Rate limiting and security middleware
  - Multi-format response support (JSON, XML, CSV)

#### MCP API Server
- **Location**: `src/mcp-server.js`
- **Technology**: Model Context Protocol implementation
- **Features**:
  - Standardized AI tool interface
  - HTTP and Stdio transport support
  - Full REST API feature parity
  - Token-in-path authentication for limited clients

### 2. Application Layer

#### Agent System
- **Location**: `src/agents/` directory
- **Architecture**: Multi-agent orchestration
- **Components**:
  - Orchestrator Agent: Research coordination
  - Source Discovery Agent: Multi-source content discovery
  - Content Analysis Agent: Deep content analysis
  - Synthesis Agent: Research synthesis and reporting
  - Fact-Checking Agent: Claim verification

#### Smart Context Engine
- **Location**: `src/services/smartContextService.js`
- **Purpose**: Intelligent context generation for LLM interactions
- **Features**:
  - Vector similarity-based context selection
  - Multiple context strategies (relevance, diversity, recency)
  - Token-aware context sizing
  - Metadata enrichment

#### External Content Integration
- **Location**: `src/services/externalContentService.js`
- **Components**:
  - Web Search Service: Multi-provider search (DuckDuckGo, Google, Bing)
  - Web Browser Service: Automated content extraction
  - Content Orchestration: Quality control and deduplication

### 3. Business Logic Layer

#### Collection Services
- **Location**: `src/services/collectionService.js`
- **Responsibilities**:
  - Collection lifecycle management
  - Document ingestion and processing
  - Metadata management
  - User access control

#### Search Services
- **Location**: `src/services/searchService.js`
- **Capabilities**:
  - Vector similarity search
  - Hybrid search (vector + text)
  - Advanced filtering and sorting
  - Search analytics and optimization

#### Clustering Services
- **Location**: `src/services/clusteringService.js`
- **Features**:
  - Automated document clustering
  - Hierarchical cluster organization
  - Cluster analysis and insights
  - Cross-cluster bridge analysis

### 4. Data Layer

#### PostgreSQL Database
- **Purpose**: Primary data store
- **Schema**: Comprehensive relational model
- **Tables**:
  - Users, Collections, Documents
  - Clusters, Agent Sessions, Analytics
  - External content cache and logs

#### Vector Store
- **Technology**: PostgreSQL with pgvector extension
- **Features**:
  - High-dimensional vector storage
  - Optimized similarity search
  - Index management and optimization
  - Vector analytics and insights

#### File Storage
- **Location**: `uploads/` directory
- **Purpose**: Document file storage
- **Features**:
  - Organized file hierarchy
  - Metadata tracking
  - File type validation
  - Automatic cleanup

## Service Architecture

### Dependency Injection Container

```javascript
// src/config/container.js
class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, options = {}) {
    this.services.set(name, { factory, options });
  }

  get(name) {
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    const instance = service.factory(this);
    
    if (service.options.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }
}
```

### Service Registration

```javascript
// Core services
container.register('database', () => new DatabaseService(config.database), { singleton: true });
container.register('vector', (c) => new VectorService(c.get('database')), { singleton: true });
container.register('collection', (c) => new CollectionService(c.get('database'), c.get('vector')));
container.register('search', (c) => new SearchService(c.get('vector'), c.get('database')));
container.register('clustering', (c) => new ClusteringService(c.get('vector'), c.get('database')));

// Advanced services
container.register('smartContext', (c) => new SmartContextService(c.get('search'), c.get('collection')));
container.register('webSearch', () => new WebSearchService(config.externalContent.webSearch));
container.register('webBrowser', () => new WebBrowserService(config.externalContent.webBrowser));
container.register('externalContent', (c) => new ExternalContentService(
  c.get('webSearch'), 
  c.get('webBrowser')
));

// Agent services
container.register('agentMemory', (c) => new AgentMemoryService(c.get('database')));
container.register('agent', (c) => new AgentService(
  c.get('database'),
  c.get('agentMemory'),
  c.get('collection'),
  c.get('search'),
  c.get('smartContext'),
  c.get('externalContent')
));
```

## Data Models

### Core Entities

#### User Model
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  preferences JSONB DEFAULT '{}'
);
```

#### Collection Model
```sql
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  document_count INTEGER DEFAULT 0,
  total_size BIGINT DEFAULT 0,
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  settings JSONB DEFAULT '{}'
);
```

#### Document Model
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  title VARCHAR(500),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  file_path VARCHAR(500),
  file_size BIGINT,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  embedding vector(1536),
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002'
);
```

#### Vector Index
```sql
-- Create vector similarity index
CREATE INDEX documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create hybrid search index
CREATE INDEX documents_content_gin_idx ON documents 
USING gin(to_tsvector('english', content));
```

### Advanced Models

#### Cluster Model
```sql
CREATE TABLE clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  document_count INTEGER DEFAULT 0,
  centroid_embedding vector(1536),
  coherence_score FLOAT,
  settings JSONB DEFAULT '{}'
);

CREATE TABLE cluster_documents (
  cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  similarity_score FLOAT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cluster_id, document_id)
);
```

#### Agent Session Model
```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  research_topic VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  preferences JSONB DEFAULT '{}',
  results JSONB DEFAULT '{}',
  statistics JSONB DEFAULT '{}'
);

CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  agent_id VARCHAR(100) NOT NULL,
  memory_key VARCHAR(255) NOT NULL,
  memory_value JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  INDEX (session_id, agent_id, memory_key)
);
```

## API Architecture

### RESTful Endpoint Structure

```
/api/
├── auth/                   # Authentication endpoints
│   ├── POST /login
│   ├── POST /register
│   ├── POST /logout
│   └── GET /profile
├── collections/            # Collection management
│   ├── GET /
│   ├── POST /
│   ├── GET /:id
│   ├── PUT /:id
│   ├── DELETE /:id
│   └── GET /:id/analytics
├── documents/              # Document operations
│   ├── GET /collections/:id/documents
│   ├── POST /collections/:id/documents
│   ├── GET /collections/:id/documents/:docId
│   ├── PUT /collections/:id/documents/:docId
│   ├── DELETE /collections/:id/documents/:docId
│   └── POST /collections/:id/upload
├── search/                 # Search operations
│   ├── POST /collections/:id/search
│   ├── POST /collections/:id/ask
│   └── POST /collections/:id/context
├── clusters/               # Clustering operations
│   ├── GET /
│   ├── POST /
│   ├── GET /:id
│   ├── DELETE /:id
│   └── GET /:id/documents
├── agents/                 # Agent system
│   ├── POST /sessions
│   ├── GET /sessions
│   ├── GET /sessions/:id
│   ├── DELETE /sessions/:id
│   └── POST /sessions/:id/execute
├── analytics/              # Analytics endpoints
│   ├── GET /user
│   ├── GET /collections/:id
│   └── GET /system
├── admin/                  # Admin operations
│   ├── GET /users
│   ├── GET /system/health
│   ├── GET /system/stats
│   └── POST /system/maintenance
└── mcp/                    # MCP integration
    ├── GET /
    ├── GET /tools
    ├── POST /call-tool
    └── GET|POST /token/:token/*
```

### Middleware Stack

```javascript
// Express middleware stack
app.use(helmet());                    // Security headers
app.use(cors(corsOptions));           // CORS configuration
app.use(compression());               // Response compression
app.use(express.json({ limit: '50mb' })); // JSON parsing
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());              // Cookie parsing
app.use(rateLimiter);                 // Rate limiting
app.use(requestLogger);               // Request logging
app.use(authMiddleware);              // Authentication
app.use(validationMiddleware);        // Input validation
app.use(errorHandler);                // Error handling
```

## Security Architecture

### Authentication and Authorization

#### JWT Token Structure
```javascript
{
  "userId": 123,
  "email": "user@example.com",
  "role": "user",
  "permissions": ["read", "write"],
  "iat": 1642680000,
  "exp": 1642766400
}
```

#### Role-Based Access Control
```javascript
const roles = {
  'admin': ['read', 'write', 'delete', 'admin'],
  'user': ['read', 'write'],
  'viewer': ['read']
};

function hasPermission(userRole, requiredPermission) {
  return roles[userRole]?.includes(requiredPermission) || false;
}
```

### Input Validation and Sanitization

```javascript
// Document upload validation
const documentSchema = {
  title: { type: 'string', maxLength: 500, required: true },
  content: { type: 'string', maxLength: 1000000, required: true },
  metadata: { type: 'object', maxProperties: 50 },
  tags: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 50 }}
};

// Search query validation
const searchSchema = {
  query: { type: 'string', maxLength: 1000, required: true },
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  threshold: { type: 'number', minimum: 0, maximum: 1 },
  includeMetadata: { type: 'boolean' }
};
```

### Data Protection

#### Encryption at Rest
- Database encryption using PostgreSQL TDE
- File storage encryption with AES-256
- Configuration secrets encryption

#### Encryption in Transit
- TLS 1.3 for all HTTP connections
- Certificate pinning for external APIs
- Secure WebSocket connections

## Performance Architecture

### Caching Strategy

#### Multi-Level Caching
```javascript
// Memory cache (Redis)
const memoryCache = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100
});

// Application cache (Node.js)
const appCache = new NodeCache({ 
  stdTTL: 600,        // 10 minutes
  checkperiod: 120,   // Check for expired keys every 2 minutes
  maxKeys: 10000      // Maximum number of keys
});

// Database query cache
const queryCache = new Map();
```

#### Cache Invalidation
```javascript
class CacheManager {
  async invalidateUserCache(userId) {
    await this.memoryCache.del(`user:${userId}:*`);
    await this.memoryCache.del(`collections:user:${userId}`);
  }

  async invalidateCollectionCache(collectionId) {
    await this.memoryCache.del(`collection:${collectionId}:*`);
    await this.memoryCache.del(`documents:collection:${collectionId}`);
  }
}
```

### Database Optimization

#### Query Optimization
```sql
-- Optimized search query with proper indexing
EXPLAIN (ANALYZE, BUFFERS) 
SELECT d.id, d.title, d.content, d.metadata,
       (d.embedding <=> $1::vector) as similarity
FROM documents d
JOIN collections c ON d.collection_id = c.id
WHERE c.user_id = $2
  AND (d.embedding <=> $1::vector) < $3
ORDER BY similarity
LIMIT $4;
```

#### Connection Pooling
```javascript
// PostgreSQL connection pool
const pool = new Pool({
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
  max: 20,              // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Monitoring and Observability

#### Health Checks
```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabaseHealth(),
      redis: await checkRedisHealth(),
      vectorStore: await checkVectorStoreHealth(),
      externalServices: await checkExternalServices()
    }
  };
  
  const isHealthy = Object.values(health.services).every(service => service.status === 'healthy');
  health.status = isHealthy ? 'healthy' : 'degraded';
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

#### Metrics Collection
```javascript
// Custom metrics
const promClient = require('prom-client');

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const vectorSearchDuration = new promClient.Histogram({
  name: 'vector_search_duration_seconds',
  help: 'Duration of vector searches in seconds',
  labelNames: ['collection_id', 'result_count']
});
```

## Deployment Architecture

### Containerization

#### Docker Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S vsi -u 1001
USER vsi

EXPOSE 3000

CMD ["node", "src/server.js"]
```

#### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  vsi-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://vsi:password@postgres:5432/vsi
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: vsi
      POSTGRES_USER: vsi
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Scaling Considerations

#### Horizontal Scaling
- Load balancer configuration for multi-instance deployment
- Session state externalization to Redis
- Database read replicas for read-heavy workloads
- CDN integration for static asset delivery

#### Vertical Scaling
- Memory optimization for vector operations
- CPU optimization for embedding generation
- Storage optimization for large document collections
- Network optimization for external content integration

## See Also

- [Admin Guide](admin-guide.md) - System administration and configuration
- [API User Guide](api-user-guide.md) - REST API reference
- [Feature Overview](feature-overview.md) - Complete system capabilities
- [Business Overview](business-overview.md) - Business context and value proposition
