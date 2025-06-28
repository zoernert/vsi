const { ClusterIntelligenceService } = require('../services/clusterIntelligenceService');
const { CrossClusterAnalyticsService } = require('../services/crossClusterAnalyticsService');
const { DynamicClusteringService } = require('../services/dynamicClusteringService');

/**
 * Advanced clustering features controller
 * Handles intelligent suggestions, analytics, and dynamic clustering
 */
class AdvancedClusteringController {
    constructor() {
        this.intelligence = new ClusterIntelligenceService();
        this.analytics = new CrossClusterAnalyticsService();
        this.dynamic = new DynamicClusteringService();
    }

    // ==================== CLUSTER INTELLIGENCE ENDPOINTS ====================

    /**
     * GET /api/clusters/intelligence/suggestions/:collectionId
     * Get intelligent cluster suggestions for a collection
     */
    async getClusterSuggestions(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.collectionId);
            const options = {
                threshold: parseFloat(req.query.threshold) || 0.7,
                maxSuggestions: parseInt(req.query.maxSuggestions) || 5
            };

            const suggestions = await this.intelligence.suggestClustersForCollection(
                collectionId, 
                userId, 
                options
            );

            res.json({
                success: true,
                data: {
                    collectionId,
                    suggestions,
                    options,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error getting cluster suggestions:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/intelligence/suggestions/:suggestionId/accept
     * Accept a cluster suggestion
     */
    async acceptSuggestion(req, res) {
        try {
            const userId = req.user.id;
            const suggestionId = parseInt(req.params.suggestionId);

            // Get suggestion details
            const result = await this.intelligence.db.query(
                'SELECT * FROM cluster_suggestions WHERE id = $1 AND user_id = $2 AND status = $3',
                [suggestionId, userId, 'pending']
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Suggestion not found or already processed'
                });
            }

            const suggestion = result.rows[0];

            // Execute the suggestion
            let actionResult;
            if (suggestion.suggestion_type === 'move_to_existing') {
                // Move collection to suggested cluster
                await this.intelligence.collectionRepo.update(suggestion.collection_id, {
                    cluster_id: suggestion.suggested_cluster_id,
                    cluster_name: suggestion.suggested_name
                });
                actionResult = { type: 'moved_to_cluster', clusterId: suggestion.suggested_cluster_id };

            } else if (suggestion.suggestion_type === 'create_new') {
                // Create new cluster and move collection
                const newCluster = await this.intelligence.clusterRepo.create({
                    name: suggestion.suggested_name,
                    description: `Cluster created from AI suggestion for collection`,
                    user_id: userId,
                    cluster_type: 'suggested',
                    settings: JSON.stringify({
                        created_from_suggestion: true,
                        suggestion_id: suggestionId
                    })
                });

                await this.intelligence.collectionRepo.update(suggestion.collection_id, {
                    cluster_id: newCluster.id,
                    cluster_name: newCluster.name
                });

                actionResult = { type: 'created_new_cluster', clusterId: newCluster.id, clusterName: newCluster.name };
            }

            // Mark suggestion as accepted
            await this.intelligence.db.query(
                'UPDATE cluster_suggestions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['accepted', suggestionId]
            );

            res.json({
                success: true,
                data: {
                    suggestionId,
                    action: actionResult,
                    message: 'Suggestion applied successfully'
                }
            });

        } catch (error) {
            console.error('Error accepting suggestion:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/intelligence/suggestions/:suggestionId/dismiss
     * Dismiss a cluster suggestion
     */
    async dismissSuggestion(req, res) {
        try {
            const userId = req.user.id;
            const suggestionId = parseInt(req.params.suggestionId);

            const result = await this.intelligence.db.query(
                'UPDATE cluster_suggestions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 AND status = $4 RETURNING *',
                ['dismissed', suggestionId, userId, 'pending']
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Suggestion not found or already processed'
                });
            }

            res.json({
                success: true,
                data: {
                    suggestionId,
                    message: 'Suggestion dismissed'
                }
            });

        } catch (error) {
            console.error('Error dismissing suggestion:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/intelligence/related/:collectionId
     * Find collections related to the given collection
     */
    async getRelatedCollections(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.collectionId);
            const threshold = parseFloat(req.query.threshold) || 0.7;

            const relatedCollections = await this.intelligence.findRelatedCollections(
                collectionId, 
                userId, 
                threshold
            );

            res.json({
                success: true,
                data: {
                    sourceCollectionId: collectionId,
                    relatedCollections,
                    threshold,
                    count: relatedCollections.length
                }
            });

        } catch (error) {
            console.error('Error finding related collections:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/intelligence/analyze-fit
     * Analyze how well a collection fits in its current cluster
     */
    async analyzeClusterFit(req, res) {
        try {
            const userId = req.user.id;
            const { collectionId, clusterId } = req.body;

            if (!collectionId || !clusterId) {
                return res.status(400).json({
                    success: false,
                    message: 'collectionId and clusterId are required'
                });
            }

            const fitAnalysis = await this.intelligence.analyzeClusterFit(
                parseInt(collectionId), 
                parseInt(clusterId), 
                userId
            );

            res.json({
                success: true,
                data: fitAnalysis
            });

        } catch (error) {
            console.error('Error analyzing cluster fit:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // ==================== CROSS-CLUSTER ANALYTICS ENDPOINTS ====================

    /**
     * GET /api/clusters/analytics/overlaps
     * Get cluster overlap analysis
     */
    async getClusterOverlaps(req, res) {
        try {
            const userId = req.user.id;

            const overlapAnalysis = await this.analytics.analyzeClusterOverlaps(userId);

            res.json({
                success: true,
                data: overlapAnalysis
            });

        } catch (error) {
            console.error('Error analyzing cluster overlaps:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/analytics/bridges
     * Find bridge documents across clusters
     */
    async getBridgeDocuments(req, res) {
        try {
            const userId = req.user.id;
            const options = {
                minClusters: parseInt(req.query.minClusters) || 2,
                similarityThreshold: parseFloat(req.query.similarityThreshold) || 0.7,
                limit: parseInt(req.query.limit) || 20
            };

            const bridgeAnalysis = await this.analytics.findBridgeDocuments(userId, options);

            res.json({
                success: true,
                data: bridgeAnalysis
            });

        } catch (error) {
            console.error('Error finding bridge documents:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/analytics/collaborations
     * Find collaboration opportunities between clusters
     */
    async getCollaborationOpportunities(req, res) {
        try {
            const userId = req.user.id;

            const collaborationAnalysis = await this.analytics.findCollaborationOpportunities(userId);

            res.json({
                success: true,
                data: collaborationAnalysis
            });

        } catch (error) {
            console.error('Error finding collaboration opportunities:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/analytics/duplications
     * Find cross-cluster content duplication
     */
    async getContentDuplications(req, res) {
        try {
            const userId = req.user.id;
            const threshold = parseFloat(req.query.threshold) || 0.8;

            const duplicationAnalysis = await this.analytics.detectCrossClusterDuplication(userId, threshold);

            res.json({
                success: true,
                data: duplicationAnalysis
            });

        } catch (error) {
            console.error('Error detecting content duplications:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/analytics/trends
     * Get cluster evolution trends
     */
    async getClusterTrends(req, res) {
        try {
            const userId = req.user.id;
            const daysPeriod = parseInt(req.query.days) || 30;

            const trendAnalysis = await this.analytics.getClusterTrends(userId, daysPeriod);

            res.json({
                success: true,
                data: trendAnalysis
            });

        } catch (error) {
            console.error('Error analyzing cluster trends:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // ==================== DYNAMIC CLUSTERING ENDPOINTS ====================

    /**
     * GET /api/clusters/health
     * Get cluster health analysis
     */
    async getClusterHealth(req, res) {
        try {
            const userId = req.user.id;

            const healthAnalysis = await this.dynamic.analyzeClusterHealth(userId);

            res.json({
                success: true,
                data: healthAnalysis
            });

        } catch (error) {
            console.error('Error analyzing cluster health:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/:clusterId/split
     * Split a cluster into smaller clusters
     */
    async splitCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.clusterId);
            const options = {
                maxClustersAfterSplit: parseInt(req.body.maxClusters) || 3,
                minCollectionsPerCluster: parseInt(req.body.minCollections) || 2,
                preserveOriginal: req.body.preserveOriginal || false
            };

            const splitResult = await this.dynamic.splitCluster(clusterId, userId, options);

            res.json({
                success: true,
                data: splitResult
            });

        } catch (error) {
            console.error('Error splitting cluster:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/merge
     * Merge multiple clusters into one
     */
    async mergeClusters(req, res) {
        try {
            const userId = req.user.id;
            const { clusterIds, newClusterName, newClusterDescription } = req.body;

            if (!Array.isArray(clusterIds) || clusterIds.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'At least 2 cluster IDs are required for merging'
                });
            }

            const mergeResult = await this.dynamic.mergeClusters(
                clusterIds.map(id => parseInt(id)), 
                userId, 
                { newClusterName, newClusterDescription }
            );

            res.json({
                success: true,
                data: mergeResult
            });

        } catch (error) {
            console.error('Error merging clusters:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/clusters/rebalance
     * Trigger cluster rebalancing
     */
    async rebalanceClusters(req, res) {
        try {
            const userId = req.user.id;
            const options = {
                maxClusterSize: parseInt(req.body.maxClusterSize) || 8,
                minClusterSize: parseInt(req.body.minClusterSize) || 2,
                similarityThreshold: parseFloat(req.body.similarityThreshold) || 0.6,
                dryRun: req.body.dryRun || false
            };

            const rebalanceResult = await this.dynamic.rebalanceClusters(userId, options);

            res.json({
                success: true,
                data: rebalanceResult
            });

        } catch (error) {
            console.error('Error rebalancing clusters:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/events
     * Get cluster management events history
     */
    async getClusterEvents(req, res) {
        try {
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const eventType = req.query.eventType;

            let query = `
                SELECT ce.*, 
                       ARRAY_AGG(DISTINCT c1.name) FILTER (WHERE c1.name IS NOT NULL) as source_cluster_names,
                       ARRAY_AGG(DISTINCT c2.name) FILTER (WHERE c2.name IS NOT NULL) as target_cluster_names
                FROM cluster_events ce
                LEFT JOIN clusters c1 ON c1.id = ANY(ce.source_cluster_ids)
                LEFT JOIN clusters c2 ON c2.id = ANY(ce.target_cluster_ids)
                WHERE ce.user_id = $1
            `;
            
            const params = [userId];
            let paramIndex = 2;

            if (eventType) {
                query += ` AND ce.event_type = $${paramIndex}`;
                params.push(eventType);
                paramIndex++;
            }

            query += ` GROUP BY ce.id ORDER BY ce.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limit, offset);

            const result = await this.dynamic.db.query(query, params);

            res.json({
                success: true,
                data: {
                    events: result.rows,
                    pagination: {
                        limit,
                        offset,
                        hasMore: result.rows.length === limit
                    }
                }
            });

        } catch (error) {
            console.error('Error getting cluster events:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/clusters/suggestions
     * Get all pending suggestions for the user
     */
    async getUserSuggestions(req, res) {
        try {
            const userId = req.user.id;
            const status = req.query.status || 'pending';
            const limit = parseInt(req.query.limit) || 20;

            const result = await this.intelligence.db.query(
                `SELECT cs.*, c.name as collection_name, cl.name as suggested_cluster_name
                 FROM cluster_suggestions cs
                 LEFT JOIN collections c ON cs.collection_id = c.id
                 LEFT JOIN clusters cl ON cs.suggested_cluster_id = cl.id
                 WHERE cs.user_id = $1 AND cs.status = $2
                 ORDER BY cs.confidence_score DESC, cs.created_at DESC
                 LIMIT $3`,
                [userId, status, limit]
            );

            res.json({
                success: true,
                data: {
                    suggestions: result.rows,
                    count: result.rows.length,
                    status
                }
            });

        } catch (error) {
            console.error('Error getting user suggestions:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = AdvancedClusteringController;
