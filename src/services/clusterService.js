const ClusterRepository = require('../repositories/ClusterRepository');
const CollectionRepository = require('../repositories/CollectionRepository');
const { DatabaseService } = require('./databaseService');
const { ContentClusteringService } = require('./contentClusteringService');

class ClusterService {
    constructor() {
        this.db = new DatabaseService();
        this.clusterRepo = new ClusterRepository(this.db);
        this.collectionRepo = new CollectionRepository(this.db);
        this.contentClustering = new ContentClusteringService();
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
            settings: typeof cluster.settings === 'string' ? JSON.parse(cluster.settings || '{}') : (cluster.settings || {})
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

    async autoGenerateClusterForCollection(collectionId, userId) {
        // Get collection details
        const collection = await this.collectionRepo.findById(collectionId);
        if (!collection || collection.user_id !== userId) {
            throw new Error('Collection not found');
        }

        // Skip if collection already has a cluster
        if (collection.cluster_id) {
            return await this.getCluster(collection.cluster_id, userId);
        }

        // First, try to analyze collection content for semantic clustering
        try {
            const contentAnalysis = await this.contentClustering.analyzeCollectionContent(collectionId, userId);
            
            if (contentAnalysis && contentAnalysis.clusters.length > 0) {
                // Create multiple content-based clusters
                const createdClusters = [];
                
                for (const contentCluster of contentAnalysis.clusters) {
                    const clusterName = `${collection.name} - ${contentCluster.name}`;
                    
                    const cluster = await this.clusterRepo.create({
                        name: clusterName,
                        description: contentCluster.description,
                        user_id: userId,
                        cluster_type: 'content_based',
                        settings: JSON.stringify({
                            auto_generated: true,
                            content_based: true,
                            source_collection_id: collectionId,
                            created_from: 'content_analysis',
                            cluster_stats: contentCluster.stats,
                            topic_keywords: contentCluster.documents.map(doc => doc.filename),
                            cluster_size: contentCluster.size,
                            cohesion_score: contentCluster.stats.cohesion
                        })
                    });
                    
                    createdClusters.push(cluster);
                }

                // Associate collection with the first (main) cluster
                const mainCluster = createdClusters[0];
                await this.collectionRepo.update(collectionId, {
                    cluster_id: mainCluster.id,
                    cluster_name: mainCluster.name
                });

                return {
                    mainCluster: mainCluster,
                    allClusters: createdClusters,
                    contentAnalysis: contentAnalysis
                };
            }
        } catch (error) {
            console.warn('Content analysis failed, falling back to simple cluster generation:', error);
        }

        // Fallback: Generate simple cluster based on collection name
        const clusterName = `${collection.name}-cluster`;
        
        // Check if auto-generated cluster already exists
        let cluster = await this.clusterRepo.findByUserIdAndName(userId, clusterName);
        
        if (!cluster) {
            // Create new auto-generated cluster
            cluster = await this.clusterRepo.create({
                name: clusterName,
                description: `Auto-generated cluster for collection: ${collection.name}`,
                user_id: userId,
                cluster_type: 'logical',
                settings: JSON.stringify({
                    auto_generated: true,
                    source_collection_id: collectionId,
                    created_from: 'collection_view'
                })
            });
        }

        // Associate collection with cluster
        await this.collectionRepo.update(collectionId, {
            cluster_id: cluster.id,
            cluster_name: cluster.name
        });

        return cluster;
    }

    async getContentBasedClusters(collectionId, userId) {
        try {
            const contentAnalysis = await this.contentClustering.analyzeCollectionContent(collectionId, userId);
            return contentAnalysis;
        } catch (error) {
            console.error('Failed to get content-based clusters:', error);
            throw error;
        }
    }

    async getOrCreateCollectionCluster(collectionId, userId) {
        // Get collection details
        const collection = await this.collectionRepo.findById(collectionId);
        if (!collection || collection.user_id !== userId) {
            throw new Error('Collection not found');
        }

        // If collection already has a cluster, return it
        if (collection.cluster_id) {
            return await this.getCluster(collection.cluster_id, userId);
        }

        // Auto-generate cluster for this collection
        return await this.autoGenerateClusterForCollection(collectionId, userId);
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
