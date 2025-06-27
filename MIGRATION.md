# Collection ID to UUID Migration Plan

## Overview
Migrate from integer IDs to UUIDs for collection identification to enhance security. This plan ensures backward compatibility during the transition and maintains data integrity.

## Phase 1: Database Schema Migration

### Step 1.1: Add UUID Column to Collections Table
```sql
-- Migration: 005_add_collection_uuid.sql
ALTER TABLE collections ADD COLUMN uuid UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_collections_uuid ON collections(uuid);
UPDATE collections SET uuid = gen_random_uuid() WHERE uuid IS NULL;
ALTER TABLE collections ALTER COLUMN uuid SET NOT NULL;
```

### Step 1.2: Update Documents Table to Support UUID References
```sql
-- Migration: 006_add_collection_uuid_to_documents.sql
ALTER TABLE documents ADD COLUMN collection_uuid UUID;
UPDATE documents SET collection_uuid = (
    SELECT c.uuid FROM collections c WHERE c.id = documents.collection_id
);
CREATE INDEX idx_documents_collection_uuid ON documents(collection_uuid);
```

### Step 1.3: Create Migration Service Method
**File: `src/services/migrationService.js`**
Add method to populate UUIDs for existing collections and update references.

## Phase 2: Backend API Layer Updates

### Step 2.1: Update Repository Layer
**File: `src/repositories/CollectionRepository.js`**
- Add methods: `findByUuid()`, `findByUuidAndUser()`, `createWithUuid()`
- Modify existing methods to support both ID and UUID lookups during transition
- Add UUID validation helpers

### Step 2.2: Update Application Services
**File: `src/services/application/CollectionApplicationService.js`**
- Modify `getCollectionById()` to `getCollectionByUuid()`
- Update all collection operations to use UUID
- Add UUID validation in service methods

### Step 2.3: Update Vector Service Integration
**File: `src/services/vector.service.js`**
- Update `createCollection()` to use UUID in Qdrant collection naming
- Modify `getUserCollections()` to return UUIDs
- Update search methods to handle UUID-based collection references

## Phase 3: API Routes and Controllers

### Step 3.1: Update API Routes
**File: `src/routes/api.js`**
- Change route parameters from `:id` to `:uuid`
- Add UUID validation middleware
- Maintain backward compatibility with optional ID support

### Step 3.2: Update Controllers
**Files: `src/controllers/CollectionController.js`, `src/controllers/SearchController.js`**
- Replace `parseInt(req.params.id)` with UUID validation
- Update all collection lookup methods
- Add UUID format validation

### Step 3.3: Update Legacy Route Files
**Files: `src/routes/collections.js`, `src/routes/uploadRoutes.js`**
- Update collection parameter handling
- Replace ID-based collection lookups with UUID

## Phase 4: Frontend Updates

### Step 4.1: Update API Service
**File: `public/js/services/api-service.js`**
- Update all collection-related API calls to use UUIDs
- Modify URL construction for collection endpoints
- Update response parsing to handle UUID fields

### Step 4.2: Update Collection Module
**File: `public/js/modules/collections-module.js`**
- Replace collection ID references with UUIDs
- Update collection creation response handling
- Modify collection selection and navigation logic

### Step 4.3: Update Documents Module
**File: `public/js/modules/documents-module.js`**
- Update file upload to use collection UUID
- Modify document listing and management
- Update collection reference in document operations

### Step 4.4: Update Search and Chat Modules
**Files: `public/js/modules/search-module.js`, `public/js/modules/chat-module.js`**
- Update collection selection dropdowns
- Modify search API calls to use UUIDs
- Update chat interface collection references

## Phase 5: Database and Vector Store Integration

### Step 5.1: Update Qdrant Integration
**File: `src/config/qdrant.js`**
- Modify collection naming to use UUIDs: `collection_{uuid}`
- Update search and retrieval methods
- Add UUID-based collection existence checks

### Step 5.2: Update Database Queries
**Files: Throughout codebase**
- Replace `collection_id` joins with `collection_uuid`
- Update all SQL queries to use UUID references
- Add proper UUID type casting in PostgreSQL queries

## Phase 6: Security and Validation

### Step 6.1: Add UUID Validation Middleware
**File: `src/middleware/validation.js`**
```javascript
const validateUUID = (paramName) => (req, res, next) => {
  const uuid = req.params[paramName];
  if (!isValidUUID(uuid)) {
    return res.status(400).json({
      error: 'Invalid UUID format',
      parameter: paramName
    });
  }
  next();
};
```

### Step 6.2: Update Authentication and Authorization
**File: `src/middleware/auth.js`**
- Ensure UUID-based collection access control
- Update user ownership verification
- Add UUID-specific rate limiting if needed

## Phase 7: Testing and Validation

### Step 7.1: Update Test Files
**Files: `tests/` directory**
- Update all collection-related tests to use UUIDs
- Add UUID validation tests
- Test backward compatibility during transition

### Step 7.2: Add Migration Tests
- Test data integrity during migration
- Verify all collection references are updated
- Test both old and new API endpoints during transition

## Phase 8: MCP Server and File Service Integration

### Step 8.1: Update MCP Server Integration
**File: `src/mcp-server.js`**
- Update `getUserCollectionName()` function to use UUIDs
- Modify collection naming from `mcp_${collectionName}` to `mcp_collection_${uuid}`
- Update database queries to use UUID references
- Modify all MCP tools to handle UUID-based collection references

### Step 8.2: Update File Service Integration
**File: `src/routes/fileRoutes.js`**
- Update file metadata to reference collection UUIDs
- Modify file permission checks to use UUID-based collection ownership
- Update any collection-file associations in database queries

### Step 8.3: Update Usage and Analytics Services
**Files: `src/services/usageService.js`, `src/routes/analyticsRoutes.js`**
- Update usage tracking to reference collection UUIDs
- Modify analytics queries to group by collection UUID
- Update collection-specific metrics and reporting

## Phase 9: Testing and Container Updates

### Step 9.1: Update Dependency Injection Container
**File: `src/container/setup.js`**
- Update any collection-specific service registrations
- Modify container setup for UUID-based collection references
- Update service resolution for collection-dependent services

### Step 9.2: Update Test Infrastructure
**Files: `tests/` directory**
- Update test fixtures to use UUIDs instead of integer IDs
- Modify mock data for collection references
- Update integration tests for UUID-based endpoints
- Add UUID validation test cases

### Step 9.3: Update Migration Service
**File: `src/services/migrationService.js`**
- Update existing migration logic for UUID support
- Add collection-document relationship migration
- Update foreign key constraint migrations

## Phase 10: Documentation and Configuration

### Step 10.1: Update API Documentation
**File: `public/openapi.json`**
- Update collection parameter schemas to UUID format
- Modify all collection-related endpoint documentation
- Add UUID validation patterns

### Step 10.2: Update Configuration Files
**Files: `docker-compose.yml`, `mcp-config.json`**
- Update MCP configuration for UUID-based collection patterns
- Modify Docker environment examples
- Update configuration documentation

### Step 10.3: Update README and Documentation
**Files: `README.md`, `USECASES.md`**
- Update API examples to use UUIDs
- Modify developer integration examples
- Update collection reference documentation

## Critical Additional Components Found

After comprehensive audit, several critical collection ID usages were identified that weren't in the original plan:

### **🚨 CRITICAL MISSING ITEMS:**

1. **MCP Server Integration** (`src/mcp-server.js`)
   - `getUserCollectionName()` function uses pattern matching
   - Collection naming: `mcp_${collectionName}` needs UUID conversion
   - Database queries within MCP tools reference collection_id
   - All MCP tool operations need UUID support

2. **File Service Integration** (`src/routes/fileRoutes.js`)
   - File metadata may reference collections via collection_id
   - Download permissions based on collection ownership
   - File-collection associations need UUID migration

3. **Usage & Analytics Services** 
   - `src/services/usageService.js`: Usage tracking with collection_id
   - `src/routes/analyticsRoutes.js`: Analytics grouped by collection
   - Collection-specific metrics and reporting

4. **Testing Infrastructure**
   - Test fixtures using integer collection IDs
   - Mock data with collection references
   - Integration test endpoints

5. **Container & Configuration**
   - Dependency injection container collection references
   - MCP configuration patterns
   - Docker environment examples

### **🔍 DETAILED PATTERN ANALYSIS:**

**Collection Naming Patterns:**
- Current: `user_{userId}_{collectionName}` 
- MCP: `mcp_${collectionName}`
- Target: `collection_{uuid}` (consistent across all services)

**Database References:**
- Foreign keys: `collection_id` → `collection_uuid`
- Indexes: Need UUID indexing strategy
- Constraints: Update referential integrity

**API Parameter Parsing:**
- Current: `parseInt(req.params.id)`
- Target: UUID validation with proper error handling
- Impact: All collection endpoint parameter handling

### Execution Order for GitHub Copilot Agent

1. **Database First**: Execute Phase 1 (Schema Migration)
2. **Backend Core**: Execute Phase 2 (Repository and Services)
3. **API Layer**: Execute Phase 3 (Routes and Controllers)
4. **Frontend**: Execute Phase 4 (UI Components)
5. **Integration**: Execute Phase 5 (Database and Vector Store)
6. **Security**: Execute Phase 6 (Validation and Auth)
7. **Quality**: Execute Phase 7 (Testing)
8. **MCP & Services**: Execute Phase 8 (MCP Server and File Service)
9. **Infrastructure**: Execute Phase 9 (Testing and Container Updates)
10. **Documentation**: Execute Phase 10 (Documentation and Configuration)

### Backward Compatibility Strategy

During transition period:
- Support both ID and UUID in API endpoints
- Maintain dual lookups in repository layer
- Gradual deprecation of ID-based endpoints
- Clear migration timeline in API responses

### Rollback Plan

- Maintain original ID column during transition
- Keep backup of collection-document relationships
- Document rollback procedures for each phase
- Test rollback scenarios before production deployment

### Success Criteria

- [ ] All collection operations use UUIDs
- [ ] No integer IDs exposed in API responses
- [ ] Frontend completely migrated to UUID usage
- [ ] All tests pass with UUID implementation
- [ ] Documentation updated and accurate
- [ ] Performance impact minimal (< 5% degradation)
- [ ] Zero data loss during migration
- [ ] Backward compatibility maintained during transition period

## Risk Mitigation

1. **Data Loss Prevention**: Multiple backups before each phase
2. **Performance Monitoring**: UUID indexing and query optimization
3. **API Breaking Changes**: Versioned API with deprecation notices
4. **Frontend Compatibility**: Gradual rollout with feature flags
5. **Vector Store Consistency**: Qdrant collection name mapping validation

## Timeline Estimate

- **Phase 1-2**: 2-3 days (Database and Core Backend)
- **Phase 3**: 1-2 days (API Layer)
- **Phase 4**: 2-3 days (Frontend)
- **Phase 5-6**: 1-2 days (Integration and Security)
- **Phase 7**: 2-3 days (Testing)
- **Phase 8**: 2-3 days (MCP Server and File Service)
- **Phase 9**: 1-2 days (Infrastructure and Container Updates)
- **Phase 10**: 1-2 days (Documentation and Configuration)

**Total Estimated Time**: 12-20 days

### **⚠️ High-Risk Areas Requiring Special Attention:**

1. **MCP Server**: Collection naming patterns affect external integrations
2. **Qdrant Integration**: Collection name changes impact vector storage
3. **File Service**: UUID migration affects file-collection associations
4. **Analytics**: Historical data queries need backward compatibility
5. **Frontend State**: Collection references in JavaScript state management

This plan ensures a systematic, safe migration from integer IDs to UUIDs while maintaining system functionality and data integrity throughout the process.