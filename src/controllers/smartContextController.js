const { SmartContextService } = require('../services/smartContextService');
const { createUsageMiddleware } = require('../middleware/usageTracking');

/**
 * Smart Context Controller
 * Handles API endpoints for intelligent context creation
 */
class SmartContextController {
    constructor() {
        this.smartContextService = new SmartContextService();
    }

    /**
     * POST /api/collections/:id/smart-context
     * Create intelligent context for a query within a collection
     */
    async createSmartContext(req, res) {
        try {
            const collectionId = parseInt(req.params.id);
            const userId = req.user.id;
            const { 
                query,
                maxContextSize = 8000,
                maxChunks = 20,
                includeClusterMetadata = true,
                diversityWeight = 0.3,
                crossClusterThreshold = 0.7,
                clusterContextWeight = 0.2
            } = req.body;

            // Validation
            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Query is required and must be a non-empty string'
                });
            }

            if (maxContextSize < 100 || maxContextSize > 50000) {
                return res.status(400).json({
                    success: false,
                    message: 'maxContextSize must be between 100 and 50000 characters'
                });
            }

            if (maxChunks < 1 || maxChunks > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'maxChunks must be between 1 and 100'
                });
            }

            // Create smart context
            const result = await this.smartContextService.createSmartContext(
                userId, 
                collectionId, 
                query, 
                {
                    maxContextSize,
                    maxChunks,
                    includeClusterMetadata,
                    diversityWeight,
                    crossClusterThreshold,
                    clusterContextWeight
                }
            );

            res.json(result);

        } catch (error) {
            console.error('Smart context creation error:', error);
            
            if (error.message.includes('not found') || error.message.includes('access denied')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to create smart context',
                error: error.message
            });
        }
    }

    /**
     * POST /api/collections/:id/smart-context/preview
     * Preview smart context configuration without full execution
     */
    async previewSmartContext(req, res) {
        try {
            const collectionId = parseInt(req.params.id);
            const userId = req.user.id;
            const { query, maxContextSize = 8000, maxChunks = 20 } = req.body;

            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Query is required for preview'
                });
            }

            // Get collection and cluster info for preview
            const collection = await this.smartContextService.validateCollectionAccess(userId, collectionId);
            const clusterInfo = await this.smartContextService.getCollectionClusterInfo(userId, collectionId);

            // Perform limited search for preview
            const searchResults = await this.smartContextService.performSemanticSearch(
                collection.qdrant_collection_name, 
                query, 
                { limit: Math.min(maxChunks, 10) }
            );

            const preview = {
                success: true,
                preview: {
                    query,
                    collectionName: collection.name,
                    clusterInfo: clusterInfo.hasCluster ? {
                        clusterName: clusterInfo.primaryCluster.name,
                        hasRelatedClusters: clusterInfo.relatedClusters.length > 0
                    } : null,
                    estimatedChunks: searchResults.length,
                    estimatedContextSize: Math.min(
                        searchResults.reduce((sum, r) => sum + (r.payload?.text?.length || 0), 0),
                        maxContextSize
                    ),
                    topResults: searchResults.slice(0, 3).map(r => ({
                        filename: r.payload?.filename || 'Unknown',
                        similarity: (r.similarity * 100).toFixed(1),
                        preview: (r.payload?.text || '').substring(0, 150) + '...'
                    }))
                }
            };

            res.json(preview);

        } catch (error) {
            console.error('Smart context preview error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate preview',
                error: error.message
            });
        }
    }

    /**
     * GET /api/collections/:id/smart-context/capabilities
     * Get smart context capabilities for a collection
     */
    async getCapabilities(req, res) {
        try {
            const collectionId = parseInt(req.params.id);
            const userId = req.user.id;

            const collection = await this.smartContextService.validateCollectionAccess(userId, collectionId);
            const clusterInfo = await this.smartContextService.getCollectionClusterInfo(userId, collectionId);

            // Get collection statistics
            const stats = await this.smartContextService.db.query(
                `SELECT 
                    COUNT(d.id) as document_count,
                    COALESCE(SUM(LENGTH(d.content)), 0) as total_content_size,
                    AVG(LENGTH(d.content)) as avg_document_size
                 FROM documents d
                 WHERE d.collection_id = $1`,
                [collectionId]
            );

            const capabilities = {
                success: true,
                capabilities: {
                    collectionName: collection.name,
                    hasClusterSupport: clusterInfo.hasCluster,
                    clusterInfo: clusterInfo.hasCluster ? {
                        clusterName: clusterInfo.primaryCluster.name,
                        clusterDescription: clusterInfo.primaryCluster.description,
                        relatedClustersCount: clusterInfo.relatedClusters.length
                    } : null,
                    statistics: stats.rows[0] || {
                        document_count: 0,
                        total_content_size: 0,
                        avg_document_size: 0
                    },
                    recommendedSettings: {
                        maxContextSize: Math.min(8000, parseInt(stats.rows[0]?.total_content_size / 4) || 4000),
                        maxChunks: Math.min(20, parseInt(stats.rows[0]?.document_count * 2) || 10),
                        diversityWeight: clusterInfo.hasCluster ? 0.4 : 0.3,
                        includeClusterMetadata: clusterInfo.hasCluster
                    },
                    features: {
                        semanticSearch: true,
                        clusterAwareScoring: clusterInfo.hasCluster,
                        crossClusterSupport: clusterInfo.relatedClusters.length > 0,
                        diversityOptimization: true,
                        intelligentSizing: true
                    }
                }
            };

            res.json(capabilities);

        } catch (error) {
            console.error('Get capabilities error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get capabilities',
                error: error.message
            });
        }
    }
}

module.exports = { SmartContextController };
