# Named Cluster Implementation Plan for VSI Vector Store

## Overview
Based on the Qdrant cluster test results, implement named cluster functionality to organize collections into logical groups with enhanced management capabilities.

## Phase 1: Backend Database Schema Updates

### 1.1 Database Migration
Create `src/migrations/007_add_cluster_support.sql`:

```sql
-- Add cluster table
CREATE TABLE clusters (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    cluster_type VARCHAR(50) DEFAULT 'logical', -- 'logical', 'sharded', 'replicated'
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Add cluster reference to collections
ALTER TABLE collections ADD COLUMN cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL;
ALTER TABLE collections ADD COLUMN cluster_name VARCHAR(255);
ALTER TABLE collections ADD COLUMN shard_config JSONB DEFAULT '{}';

-- Create indexes
CREATE INDEX idx_clusters_user_id ON clusters(user_id);
CREATE INDEX idx_clusters_uuid ON clusters(uuid);
CREATE INDEX idx_collections_cluster_id ON collections(cluster_id);
CREATE INDEX idx_collections_cluster_name ON collections(cluster_name);

-- Add cluster settings table for advanced configurations
CREATE TABLE cluster_settings (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER REFERENCES clusters(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, setting_key)
);
```

### 1.2 Update Migration Service
Add to `src/services/migrationService.js`:

```javascript
async runMigrations() {
    const migrations = [
        '001_initial_schema.sql',
        '002_add_usage_tracking.sql', 
        '003_add_user_tiers.sql',
        '004_make_qdrant_collection_name_nullable.sql',
        '005_add_collection_uuid.sql',
        '006_add_collection_uuid_to_documents.sql',
        '007_add_cluster_support.sql' // Add this line
    ];
    // ... rest of method
}
```

## Phase 2: Backend Services Layer

### 2.1 Create Cluster Repository
Create `src/repositories/ClusterRepository.js`:

```javascript
const BaseRepository = require('./BaseRepository');

class ClusterRepository extends BaseRepository {
    constructor(db) {
        super(db, 'clusters');
    }

    async findByUserIdAndName(userId, name) {
        const result = await this.db.query(
            'SELECT * FROM clusters WHERE user_id = $1 AND name = $2',
            [userId, name]
        );
        return result.rows[0] || null;
    }

    async findByUserId(userId, options = {}) {
        const { limit = 50, offset = 0, orderBy = 'created_at', sortOrder = 'DESC' } = options;
        
        const result = await this.db.query(
            `SELECT c.*, 
                    COUNT(col.id) as collection_count,
                    COALESCE(SUM(d.doc_count), 0) as total_documents
             FROM clusters c 
             LEFT JOIN collections col ON c.id = col.cluster_id
             LEFT JOIN (
                 SELECT collection_id, COUNT(*) as doc_count 
                 FROM documents 
                 GROUP BY collection_id
             ) d ON col.id = d.collection_id
             WHERE c.user_id = $1 
             GROUP BY c.id
             ORDER BY ${orderBy} ${sortOrder} 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows;
    }

    async getClusterCollections(clusterId, userId) {
        const result = await this.db.query(
            `SELECT col.*, COUNT(d.id) as document_count
             FROM collections col
             LEFT JOIN documents d ON col.id = d.collection_id
             JOIN clusters c ON col.cluster_id = c.id
             WHERE c.id = $1 AND c.user_id = $2
             GROUP BY col.id
             ORDER BY col.created_at DESC`,
            [clusterId, userId]
        );
        return result.rows;
    }

    async updateClusterSettings(clusterId, settings) {
        const result = await this.db.query(
            'UPDATE clusters SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [JSON.stringify(settings), clusterId]
        );
        return result.rows[0];
    }
}

module.exports = ClusterRepository;
```

### 2.2 Create Cluster Service
Create `src/services/clusterService.js`:

```javascript
const { ClusterRepository } = require('../repositories/ClusterRepository');
const { CollectionRepository } = require('../repositories/CollectionRepository');
const qdrantClient = require('../config/qdrant');

class ClusterService {
    constructor() {
        this.clusterRepo = new ClusterRepository();
        this.collectionRepo = new CollectionRepository();
    }

    async createCluster(userId, clusterData) {
        const { name, description, type = 'logical', settings = {} } = clusterData;
        
        // Check if cluster name already exists for user
        const existing = await this.clusterRepo.findByUserIdAndName(userId, name);
        if (existing) {
            throw new Error('Cluster name already exists');
        }

        // Create cluster in database
        const cluster = await this.clusterRepo.create({
            name,
            description,
            user_id: userId,
            cluster_type: type,
            settings: JSON.stringify(settings)
        });

        // Initialize cluster in Qdrant if using advanced features
        if (type !== 'logical') {
            await this.initializeQdrantCluster(cluster, settings);
        }

        return cluster;
    }

    async getUserClusters(userId, options = {}) {
        return await this.clusterRepo.findByUserId(userId, options);
    }

    async getCluster(clusterId, userId) {
        const cluster = await this.clusterRepo.findById(clusterId);
        if (!cluster || cluster.user_id !== userId) {
            throw new Error('Cluster not found');
        }

        // Get collections in this cluster
        const collections = await this.clusterRepo.getClusterCollections(clusterId, userId);
        
        return {
            ...cluster,
            collections,
            settings: JSON.parse(cluster.settings || '{}')
        };
    }

    async updateCluster(clusterId, userId, updates) {
        const cluster = await this.clusterRepo.findById(clusterId);
        if (!cluster || cluster.user_id !== userId) {
            throw new Error('Cluster not found');
        }

        const { settings, ...otherUpdates } = updates;
        
        // Update basic fields
        if (Object.keys(otherUpdates).length > 0) {
            await this.clusterRepo.update(clusterId, otherUpdates);
        }

        // Update settings if provided
        if (settings) {
            await this.clusterRepo.updateClusterSettings(clusterId, settings);
        }

        return await this.getCluster(clusterId, userId);
    }

    async deleteCluster(clusterId, userId) {
        const cluster = await this.clusterRepo.findById(clusterId);
        if (!cluster || cluster.user_id !== userId) {
            throw new Error('Cluster not found');
        }

        // Remove cluster reference from collections (set to NULL)
        await this.db.query(
            'UPDATE collections SET cluster_id = NULL, cluster_name = NULL WHERE cluster_id = $1',
            [clusterId]
        );

        // Delete cluster
        await this.clusterRepo.delete(clusterId);
        
        return { message: 'Cluster deleted successfully' };
    }

    async addCollectionToCluster(clusterId, collectionId, userId) {
        const cluster = await this.clusterRepo.findById(clusterId);
        if (!cluster || cluster.user_id !== userId) {
            throw new Error('Cluster not found');
        }

        const collection = await this.collectionRepo.findById(collectionId);
        if (!collection || collection.user_id !== userId) {
            throw new Error('Collection not found');
        }

        // Update collection to reference cluster
        await this.collectionRepo.update(collectionId, {
            cluster_id: clusterId,
            cluster_name: cluster.name
        });

        return { message: 'Collection added to cluster successfully' };
    }

    async removeCollectionFromCluster(collectionId, userId) {
        const collection = await this.collectionRepo.findById(collectionId);
        if (!collection || collection.user_id !== userId) {
            throw new Error('Collection not found');
        }

        await this.collectionRepo.update(collectionId, {
            cluster_id: null,
            cluster_name: null
        });

        return { message: 'Collection removed from cluster successfully' };
    }

    async getClusterStats(clusterId, userId) {
        const cluster = await this.clusterRepo.findById(clusterId);
        if (!cluster || cluster.user_id !== userId) {
            throw new Error('Cluster not found');
        }

        const stats = await this.db.query(
            `SELECT 
                COUNT(DISTINCT col.id) as collection_count,
                COUNT(DISTINCT d.id) as document_count,
                COALESCE(SUM(LENGTH(d.content)), 0) as total_content_size,
                MAX(col.updated_at) as last_updated
             FROM clusters c
             LEFT JOIN collections col ON c.id = col.cluster_id
             LEFT JOIN documents d ON col.id = d.collection_id
             WHERE c.id = $1`,
            [clusterId]
        );

        return stats.rows[0] || {
            collection_count: 0,
            document_count: 0,
            total_content_size: 0,
            last_updated: null
        };
    }

    async initializeQdrantCluster(cluster, settings) {
        // Implementation for advanced Qdrant cluster features
        // This would handle sharding, replication, etc.
        console.log(`Initializing Qdrant cluster: ${cluster.name} with settings:`, settings);
        
        if (cluster.cluster_type === 'sharded') {
            // Configure sharding settings
            const shardConfig = {
                shard_number: settings.shardCount || 2,
                replication_factor: settings.replicationFactor || 1
            };
            // Apply to future collections in this cluster
        }
    }
}

module.exports = { ClusterService };
```

### 2.3 Create Cluster Controller
Create `src/controllers/clusterController.js`:

```javascript
const { ClusterService } = require('../services/clusterService');
const { auth } = require('../middleware');

class ClusterController {
    constructor() {
        this.clusterService = new ClusterService();
    }

    // GET /api/clusters
    async getUserClusters(req, res) {
        try {
            const userId = req.user.id;
            const options = {
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const clusters = await this.clusterService.getUserClusters(userId, options);
            
            res.json({
                success: true,
                data: clusters
            });
        } catch (error) {
            console.error('Get clusters error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /api/clusters
    async createCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterData = req.body;

            const cluster = await this.clusterService.createCluster(userId, clusterData);
            
            res.status(201).json({
                success: true,
                data: cluster,
                message: 'Cluster created successfully'
            });
        } catch (error) {
            console.error('Create cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/:id
    async getCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const cluster = await this.clusterService.getCluster(clusterId, userId);
            
            res.json({
                success: true,
                data: cluster
            });
        } catch (error) {
            console.error('Get cluster error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    // PUT /api/clusters/:id
    async updateCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);
            const updates = req.body;

            const cluster = await this.clusterService.updateCluster(clusterId, userId, updates);
            
            res.json({
                success: true,
                data: cluster,
                message: 'Cluster updated successfully'
            });
        } catch (error) {
            console.error('Update cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // DELETE /api/clusters/:id
    async deleteCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const result = await this.clusterService.deleteCluster(clusterId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Delete cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /api/clusters/:id/collections/:collectionId
    async addCollectionToCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);
            const collectionId = parseInt(req.params.collectionId);

            const result = await this.clusterService.addCollectionToCluster(clusterId, collectionId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Add collection to cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // DELETE /api/collections/:id/cluster
    async removeCollectionFromCluster(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.id);

            const result = await this.clusterService.removeCollectionFromCluster(collectionId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Remove collection from cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/:id/stats
    async getClusterStats(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const stats = await this.clusterService.getClusterStats(clusterId, userId);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get cluster stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = { ClusterController };
```

## Phase 3: Backend Routes Integration

### 3.1 Create Cluster Routes
Create `src/routes/clusterRoutes.js`:

```javascript
const express = require('express');
const { ClusterController } = require('../controllers/clusterController');
const { auth } = require('../middleware');

const router = express.Router();
const clusterController = new ClusterController();

// Apply authentication to all routes
router.use(auth);

// Cluster management routes
router.get('/', clusterController.getUserClusters.bind(clusterController));
router.post('/', clusterController.createCluster.bind(clusterController));
router.get('/:id', clusterController.getCluster.bind(clusterController));
router.put('/:id', clusterController.updateCluster.bind(clusterController));
router.delete('/:id', clusterController.deleteCluster.bind(clusterController));

// Cluster-collection association routes
router.post('/:id/collections/:collectionId', clusterController.addCollectionToCluster.bind(clusterController));
router.get('/:id/stats', clusterController.getClusterStats.bind(clusterController));

// Collection cluster management (remove from cluster)
router.delete('/collections/:id/cluster', clusterController.removeCollectionFromCluster.bind(clusterController));

module.exports = router;
```

### 3.2 Update Main App Routes
In `src/index.js`, add the cluster routes:

```javascript
// Import cluster routes
const clusterRoutes = require('./routes/clusterRoutes');

// Add cluster routes (add this line with other route registrations)
app.use('/api/clusters', clusterRoutes);
```

### 3.3 Update Collections Service
Update `src/services/vector.service.js` to include cluster awareness:

```javascript
async getUserCollections(userId, includeStats = false) {
    await this.initializeDatabase();
    
    let query = `
      SELECT c.*, 
             cl.name as cluster_name,
             cl.id as cluster_id,
             COALESCE(d1.doc_count, d2.doc_count, 0) as document_count 
      FROM collections c 
      LEFT JOIN clusters cl ON c.cluster_id = cl.id
      LEFT JOIN (
        SELECT collection_id, COUNT(*) as doc_count 
        FROM documents 
        WHERE collection_id IS NOT NULL 
        GROUP BY collection_id
      ) d1 ON c.id = d1.collection_id
      LEFT JOIN (
        SELECT collection_uuid, COUNT(*) as doc_count 
        FROM documents 
        WHERE collection_uuid IS NOT NULL 
        GROUP BY collection_uuid
      ) d2 ON c.uuid = d2.collection_uuid
      WHERE c.user_id = $1 
      ORDER BY cl.name NULLS LAST, c.created_at DESC
    `;
    
    const result = await this.db.pool.query(query, [userId]);
    return result.rows;
}
```

## Phase 4: OpenAPI Specification Updates

Update the `openapi.json` file to include cluster endpoints:

```json
{
  "paths": {
    "/api/clusters": {
      "get": {
        "summary": "Get user clusters",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50}},
          {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}}
        ],
        "responses": {
          "200": {
            "description": "List of clusters",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "data": {
                      "type": "array",
                      "items": {"$ref": "#/components/schemas/Cluster"}
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create a new cluster",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {"$ref": "#/components/schemas/CreateCluster"}
            }
          }
        },
        "responses": {
          "201": {
            "description": "Cluster created successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "data": {"$ref": "#/components/schemas/Cluster"},
                    "message": {"type": "string"}
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/clusters/{id}": {
      "get": {
        "summary": "Get cluster details",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "Cluster details",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "data": {"$ref": "#/components/schemas/ClusterDetail"}
                  }
                }
              }
            }
          }
        }
      },
      "put": {
        "summary": "Update cluster",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {"$ref": "#/components/schemas/UpdateCluster"}
            }
          }
        },
        "responses": {
          "200": {
            "description": "Cluster updated successfully"
          }
        }
      },
      "delete": {
        "summary": "Delete cluster",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "Cluster deleted successfully"
          }
        }
      }
    },
    "/api/clusters/{id}/collections/{collectionId}": {
      "post": {
        "summary": "Add collection to cluster",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}},
          {"name": "collectionId", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "Collection added to cluster successfully"
          }
        }
      }
    },
    "/api/clusters/{id}/stats": {
      "get": {
        "summary": "Get cluster statistics",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "Cluster statistics",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "data": {"$ref": "#/components/schemas/ClusterStats"}
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/collections/{id}/cluster": {
      "delete": {
        "summary": "Remove collection from cluster",
        "tags": ["Clusters"],
        "security": [{"bearerAuth": []}],
        "parameters": [
          {"name": "id", "in": "path", "required": true, "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "Collection removed from cluster successfully"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Cluster": {
        "type": "object",
        "properties": {
          "id": {"type": "integer"},
          "uuid": {"type": "string", "format": "uuid"},
          "name": {"type": "string"},
          "description": {"type": "string"},
          "cluster_type": {"type": "string", "enum": ["logical", "sharded", "replicated"]},
          "collection_count": {"type": "integer"},
          "total_documents": {"type": "integer"},
          "settings": {"type": "object"},
          "created_at": {"type": "string", "format": "date-time"},
          "updated_at": {"type": "string", "format": "date-time"}
        }
      },
      "ClusterDetail": {
        "allOf": [
          {"$ref": "#/components/schemas/Cluster"},
          {
            "type": "object",
            "properties": {
              "collections": {
                "type": "array",
                "items": {"$ref": "#/components/schemas/Collection"}
              }
            }
          }
        ]
      },
      "CreateCluster": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string", "maxLength": 255},
          "description": {"type": "string"},
          "type": {"type": "string", "enum": ["logical", "sharded", "replicated"], "default": "logical"},
          "settings": {
            "type": "object",
            "properties": {
              "shardCount": {"type": "integer", "minimum": 1, "maximum": 16},
              "replicationFactor": {"type": "integer", "minimum": 1, "maximum": 5}
            }
          }
        }
      },
      "UpdateCluster": {
        "type": "object",
        "properties": {
          "name": {"type": "string", "maxLength": 255},
          "description": {"type": "string"},
          "settings": {"type": "object"}
        }
      },
      "ClusterStats": {
        "type": "object",
        "properties": {
          "collection_count": {"type": "integer"},
          "document_count": {"type": "integer"},
          "total_content_size": {"type": "integer"},
          "last_updated": {"type": "string", "format": "date-time"}
        }
      }
    }
  }
}
```

## Phase 5: Frontend Implementation

### 5.1 Update Collections View
Modify `public/index.html` to add cluster management:

```html
<!-- Add cluster management section before collections -->
<div id="clustersView" class="hidden">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h3>My Clusters</h3>
        <button class="btn btn-primary" onclick="app.clusters.showCreateModal()">
            <i class="fas fa-plus me-2"></i>Create Cluster
        </button>
    </div>
    <div id="clustersGrid" class="row">
        <!-- Clusters will be loaded here -->
    </div>
</div>

<!-- Update navigation to include clusters -->
<a class="nav-link" href="#" onclick="showClusters()">
    <i class="fas fa-layer-group me-2"></i> Clusters
</a>
```

### 5.2 Create Cluster Management Module
Create `public/js/modules/clusters-module.js`:

```javascript
window.app = window.app || {};
window.app.clusters = {
    async loadClusters() {
        try {
            const response = await window.app.api.get('/api/clusters');
            if (response.success) {
                this.displayClusters(response.data);
            }
        } catch (error) {
            console.error('Error loading clusters:', error);
            window.app.ui.showError('Failed to load clusters');
        }
    },

    displayClusters(clusters) {
        const grid = document.getElementById('clustersGrid');
        if (!clusters || clusters.length === 0) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-layer-group fa-3x text-muted mb-3"></i>
                            <h5>No clusters yet</h5>
                            <p class="text-muted">Create your first cluster to organize your collections</p>
                            <button class="btn btn-primary" onclick="app.clusters.showCreateModal()">
                                <i class="fas fa-plus me-2"></i>Create Cluster
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = clusters.map(cluster => `
            <div class="col-md-4 mb-4">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">${cluster.name}</h5>
                        <span class="badge bg-${this.getClusterTypeColor(cluster.cluster_type)}">
                            ${cluster.cluster_type}
                        </span>
                    </div>
                    <div class="card-body">
                        <p class="card-text">${cluster.description || 'No description'}</p>
                        <div class="row text-center">
                            <div class="col-6">
                                <div class="stat-item">
                                    <div class="stat-value">${cluster.collection_count || 0}</div>
                                    <div class="stat-label">Collections</div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="stat-item">
                                    <div class="stat-value">${cluster.total_documents || 0}</div>
                                    <div class="stat-label">Documents</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="btn-group w-100">
                            <button class="btn btn-outline-primary" onclick="app.clusters.viewCluster(${cluster.id})">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-outline-secondary" onclick="app.clusters.editCluster(${cluster.id})">
                                <i class="fas fa-edit me-1"></i>Edit
                            </button>
                            <button class="btn btn-outline-danger" onclick="app.clusters.deleteCluster(${cluster.id})">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    getClusterTypeColor(type) {
        const colors = {
            'logical': 'primary',
            'sharded': 'success',
            'replicated': 'info'
        };
        return colors[type] || 'secondary';
    },

    async showCreateModal() {
        const modal = new bootstrap.Modal(document.getElementById('createClusterModal'));
        modal.show();
    },

    async createCluster() {
        try {
            const form = document.getElementById('createClusterForm');
            const formData = new FormData(form);
            
            const clusterData = {
                name: formData.get('name'),
                description: formData.get('description'),
                type: formData.get('type') || 'logical',
                settings: {}
            };

            // Add advanced settings based on type
            if (clusterData.type === 'sharded') {
                clusterData.settings.shardCount = parseInt(formData.get('shardCount')) || 2;
            }
            if (clusterData.type === 'replicated') {
                clusterData.settings.replicationFactor = parseInt(formData.get('replicationFactor')) || 2;
            }

            const response = await window.app.api.post('/api/clusters', clusterData);
            if (response.success) {
                window.app.ui.showSuccess('Cluster created successfully');
                bootstrap.Modal.getInstance(document.getElementById('createClusterModal')).hide();
                form.reset();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error creating cluster:', error);
            window.app.ui.showError('Failed to create cluster');
        }
    },

    async viewCluster(clusterId) {
        try {
            const response = await window.app.api.get(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.displayClusterDetail(response.data);
                window.app.ui.showView('clusterDetailView');
            }
        } catch (error) {
            console.error('Error loading cluster:', error);
            window.app.ui.showError('Failed to load cluster details');
        }
    },

    displayClusterDetail(cluster) {
        document.getElementById('clusterDetailTitle').textContent = cluster.name;
        document.getElementById('clusterDescription').textContent = cluster.description || 'No description';
        document.getElementById('clusterType').textContent = cluster.cluster_type;
        
        // Display collections in cluster
        const collectionsGrid = document.getElementById('clusterCollectionsGrid');
        if (!cluster.collections || cluster.collections.length === 0) {
            collectionsGrid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        No collections in this cluster yet. 
                        <a href="#" onclick="app.clusters.showAddCollectionModal(${cluster.id})">Add collections</a>
                    </div>
                </div>
            `;
            return;
        }

        collectionsGrid.innerHTML = cluster.collections.map(collection => `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">${collection.name}</h6>
                        <p class="card-text text-muted">${collection.description || 'No description'}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${collection.document_count || 0} documents</small>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-primary" onclick="app.collections.viewCollection('${collection.id}')">
                                    View
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="app.clusters.removeCollectionFromCluster('${collection.id}')">
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    async editCluster(clusterId) {
        try {
            const response = await window.app.api.get(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.populateEditForm(response.data);
                const modal = new bootstrap.Modal(document.getElementById('editClusterModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading cluster for edit:', error);
            window.app.ui.showError('Failed to load cluster details');
        }
    },

    populateEditForm(cluster) {
        document.getElementById('editClusterId').value = cluster.id;
        document.getElementById('editClusterName').value = cluster.name;
        document.getElementById('editClusterDescription').value = cluster.description || '';
    },

    async updateCluster() {
        try {
            const clusterId = document.getElementById('editClusterId').value;
            const updates = {
                name: document.getElementById('editClusterName').value,
                description: document.getElementById('editClusterDescription').value
            };

            const response = await window.app.api.put(`/api/clusters/${clusterId}`, updates);
            if (response.success) {
                window.app.ui.showSuccess('Cluster updated successfully');
                bootstrap.Modal.getInstance(document.getElementById('editClusterModal')).hide();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error updating cluster:', error);
            window.app.ui.showError('Failed to update cluster');
        }
    },

    async deleteCluster(clusterId) {
        if (!confirm('Are you sure you want to delete this cluster? Collections will not be deleted, only removed from the cluster.')) {
            return;
        }

        try {
            const response = await window.app.api.delete(`/api/clusters/${clusterId}`);
            if (response.success) {
                window.app.ui.showSuccess('Cluster deleted successfully');
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error deleting cluster:', error);
            window.app.ui.showError('Failed to delete cluster');
        }
    },

    async showAddCollectionModal(clusterId) {
        try {
            // Load available collections (not in any cluster)
            const response = await window.app.api.get('/api/collections?filter=unassigned');
            if (response.success) {
                this.populateCollectionsList(response.data, clusterId);
                const modal = new bootstrap.Modal(document.getElementById('addCollectionModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading collections:', error);
            window.app.ui.showError('Failed to load collections');
        }
    },

    populateCollectionsList(collections, clusterId) {
        document.getElementById('addCollectionClusterId').value = clusterId;
        const select = document.getElementById('availableCollections');
        
        select.innerHTML = '<option value="">Select a collection...</option>' +
            collections.filter(c => !c.cluster_id).map(collection => 
                `<option value="${collection.id}">${collection.name}</option>`
            ).join('');
    },

    async addCollectionToCluster() {
        try {
            const clusterId = document.getElementById('addCollectionClusterId').value;
            const collectionId = document.getElementById('availableCollections').value;
            
            if (!collectionId) {
                window.app.ui.showError('Please select a collection');
                return;
            }

            const response = await window.app.api.post(`/api/clusters/${clusterId}/collections/${collectionId}`);
            if (response.success) {
                window.app.ui.showSuccess('Collection added to cluster successfully');
                bootstrap.Modal.getInstance(document.getElementById('addCollectionModal')).hide();
                this.viewCluster(clusterId);
            }
        } catch (error) {
            console.error('Error adding collection to cluster:', error);
            window.app.ui.showError('Failed to add collection to cluster');
        }
    },

    async removeCollectionFromCluster(collectionId) {
        if (!confirm('Remove this collection from the cluster?')) {
            return;
        }

        try {
            const response = await window.app.api.delete(`/api/collections/${collectionId}/cluster`);
            if (response.success) {
                window.app.ui.showSuccess('Collection removed from cluster successfully');
                // Refresh current view
                const currentClusterId = new URLSearchParams(window.location.search).get('cluster');
                if (currentClusterId) {
                    this.viewCluster(currentClusterId);
                }
            }
        } catch (error) {
            console.error('Error removing collection from cluster:', error);
            window.app.ui.showError('Failed to remove collection from cluster');
        }
    }
};
```

### 5.3 Add Cluster Modals to HTML
Add these modals to `public/index.html`:

```html
<!-- Create Cluster Modal -->
<div class="modal fade" id="createClusterModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create New Cluster</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="createClusterForm">
                    <div class="mb-3">
                        <label class="form-label">Cluster Name</label>
                        <input type="text" class="form-control" name="name" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Description</label>
                        <textarea class="form-control" name="description" rows="3"></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Cluster Type</label>
                        <select class="form-select" name="type" onchange="toggleAdvancedSettings(this.value)">
                            <option value="logical">Logical (Default)</option>
                            <option value="sharded">Sharded</option>
                            <option value="replicated">Replicated</option>
                        </select>
                        <small class="form-text text-muted">Logical clusters organize collections logically. Sharded and replicated clusters use advanced Qdrant features.</small>
                    </div>
                    
                    <!-- Advanced Settings -->
                    <div id="shardedSettings" class="mb-3" style="display: none;">
                        <label class="form-label">Number of Shards</label>
                        <input type="number" class="form-control" name="shardCount" value="2" min="1" max="16">
                        <small class="form-text text-muted">Number of shards to distribute data across</small>
                    </div>
                    
                    <div id="replicatedSettings" class="mb-3" style="display: none;">
                        <label class="form-label">Replication Factor</label>
                        <input type="number" class="form-control" name="replicationFactor" value="2" min="1" max="5">
                        <small class="form-text text-muted">Number of replicas for high availability</small>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="app.clusters.createCluster()">Create Cluster</button>
            </div>
        </div>
    </div>
</div>

<!-- Edit Cluster Modal -->
<div class="modal fade" id="editClusterModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Cluster</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="editClusterForm">
                    <input type="hidden" id="editClusterId">
                    <div class="mb-3">
                        <label class="form-label">Cluster Name</label>
                        <input type="text" class="form-control" id="editClusterName" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Description</label>
                        <textarea class="form-control" id="editClusterDescription" rows="3"></textarea>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="app.clusters.updateCluster()">Update Cluster</button>
            </div>
        </div>
    </div>
</div>

<!-- Add Collection to Cluster Modal -->
<div class="modal fade" id="addCollectionModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add Collection to Cluster</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="addCollectionClusterId">
                <div class="mb-3">
                    <label class="form-label">Select Collection</label>
                    <select class="form-select" id="availableCollections">
                        <option value="">Loading collections...</option>
                    </select>
                    <small class="form-text text-muted">Only collections not assigned to any cluster are shown</small>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="app.clusters.addCollectionToCluster()">Add to Cluster</button>
            </div>
        </div>
    </div>
</div>

<!-- Cluster Detail View -->
<div id="clusterDetailView" class="hidden">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <button class="btn btn-outline-secondary me-3" onclick="showClusters()">
                <i class="fas fa-arrow-left me-2"></i>Back to Clusters
            </button>
            <h3 id="clusterDetailTitle">Cluster Details</h3>
            <p class="text-muted" id="clusterDescription"></p>
        </div>
        <div>
            <span class="badge bg-primary me-2" id="clusterType"></span>
            <button class="btn btn-outline-primary me-2" onclick="app.clusters.showAddCollectionModal()">
                <i class="fas fa-plus me-2"></i>Add Collections
            </button>
        </div>
    </div>

    <div class="row" id="clusterCollectionsGrid">
        <!-- Collections in cluster will be loaded here -->
    </div>
</div>
```

### 5.4 Add JavaScript Functions
Add to `public/js/vsi-init.js`:

```javascript
// Add cluster-related functions
function showClusters() {
    hideAllViews();
    document.getElementById('clustersView').classList.remove('hidden');
    document.getElementById('pageTitle').textContent = 'Clusters';
    updateActiveNavLink('clusters');
    window.app.clusters.loadClusters();
}

function toggleAdvancedSettings(type) {
    document.getElementById('shardedSettings').style.display = type === 'sharded' ? 'block' : 'none';
    document.getElementById('replicatedSettings').style.display = type === 'replicated' ? 'block' : 'none';
}
```

### 5.5 Update Collections View to Show Cluster Info
Modify the collections display function to show cluster information:

```javascript
// Update in collections-module.js
displayCollections(collections) {
    const grid = document.getElementById('collectionsGrid');
    
    if (!collections || collections.length === 0) {
        // ... existing empty state code
        return;
    }

    // Group collections by cluster
    const grouped = this.groupCollectionsByCluster(collections);
    
    grid.innerHTML = Object.keys(grouped).map(clusterName => {
        const clusterCollections = grouped[clusterName];
        const isUnclustered = clusterName === 'Unclustered';
        
        return `
            <div class="col-12 mb-4">
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">
                            <i class="fas fa-${isUnclustered ? 'folder' : 'layer-group'} me-2"></i>
                            ${clusterName}
                        </h5>
                        <span class="badge bg-secondary">${clusterCollections.length} collections</span>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            ${clusterCollections.map(collection => this.renderCollectionCard(collection)).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
},

groupCollectionsByCluster(collections) {
    const grouped = {};
    
    collections.forEach(collection => {
        const clusterName = collection.cluster_name || 'Unclustered';
        if (!grouped[clusterName]) {
            grouped[clusterName] = [];
        }
        grouped[clusterName].push(collection);
    });
    
    return grouped;
},

renderCollectionCard(collection) {
    return `
        <div class="col-md-6 col-lg-4 mb-3">
            <div class="card h-100">
                <div class="card-body">
                    <h6 class="card-title">${collection.name}</h6>
                    <p class="card-text text-muted">${collection.description || 'No description'}</p>
                    ${collection.cluster_name ? `
                        <small class="text-primary">
                            <i class="fas fa-layer-group me-1"></i>${collection.cluster_name}
                        </small>
                    ` : ''}
                    <div class="mt-2">
                        <small class="text-muted">${collection.document_count || 0} documents</small>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="btn-group w-100">
                        <button class="btn btn-sm btn-outline-primary" onclick="app.collections.viewCollection('${collection.id}')">
                            View
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="app.collections.editCollection('${collection.id}')">
                            Edit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
```

## Phase 6: Testing Strategy

### 6.1 Backend Testing
Create tests for cluster functionality:

```javascript
// tests/integration/clusters.test.js
describe('Cluster Management', () => {
    it('should create a logical cluster', async () => {
        const response = await request(app)
            .post('/api/clusters')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                name: 'Test Cluster',
                description: 'Test cluster description',
                type: 'logical'
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Test Cluster');
    });

    it('should add collection to cluster', async () => {
        // ... test implementation
    });

    it('should get cluster statistics', async () => {
        // ... test implementation
    });
});
```

### 6.2 Frontend Testing
Test cluster UI components:

```javascript
// Test cluster creation modal
// Test collection assignment
// Test cluster deletion
// Test cluster statistics display
```

## Phase 7: Documentation Updates

### 7.1 Update README.md
Add cluster functionality documentation:

```markdown
## Cluster Management

VSI Vector Store supports organizing collections into named clusters for better organization and management.

### Cluster Types
- **Logical**: Simple grouping for organization
- **Sharded**: Distributed storage across multiple shards
- **Replicated**: High availability with data replication

### API Usage
```bash
# Create a cluster
curl -X POST /api/clusters \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"My Cluster","type":"logical"}'

# Add collection to cluster
curl -X POST /api/clusters/1/collections/5 \
  -H "Authorization: Bearer $TOKEN"
```

### 7.2 Update API Documentation
Ensure OpenAPI specification is complete and accurate for all cluster endpoints.

## Implementation Timeline

1. **Week 1**: Database schema and migrations
2. **Week 2**: Backend services and controllers
3. **Week 3**: API routes and testing
4. **Week 4**: Frontend implementation
5. **Week 5**: Integration testing and documentation

## Success Criteria

- [ ] Users can create logical clusters to organize collections
- [ ] Collections can be assigned to and removed from clusters
- [ ] Cluster statistics are accurately displayed
- [ ] Advanced cluster types (sharded/replicated) are configurable
- [ ] All cluster operations are properly authenticated and authorized
- [ ] OpenAPI specification is complete and accurate
- [ ] Frontend provides intuitive cluster management interface
- [ ] Performance impact is minimal
- [ ] All functionality is thoroughly tested

This plan provides a comprehensive approach to implementing named cluster functionality that builds upon the existing VSI Vector Store architecture while adding powerful organizational capabilities.