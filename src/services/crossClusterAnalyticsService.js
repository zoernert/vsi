const { DatabaseService } = require('./databaseService');
const { QdrantService } = require('./qdrantService');
const { EmbeddingService } = require('./embeddingService');
const ClusterRepository = require('../repositories/ClusterRepository');
const CollectionRepository = require('../repositories/CollectionRepository');
const DocumentRepository = require('../repositories/DocumentRepository');

/**
 * Cross-cluster analytics service for finding relationships and patterns
 * across different clusters within a user's knowledge base
 */
class CrossClusterAnalyticsService {
    constructor() {
        this.db = new DatabaseService();
        this.qdrant = new QdrantService();
        this.embedding = new EmbeddingService();
        this.clusterRepo = new ClusterRepository(this.db);
        this.collectionRepo = new CollectionRepository(this.db);
        this.documentRepo = new DocumentRepository(this.db);
    }

    /**
     * Find documents that act as bridges between different clusters
     * @param {number} userId - User ID
     * @param {object} options - Analysis options
     * @returns {Promise<Array>} Bridge documents with cluster connections
     */
    async findBridgeDocuments(userId, options = {}) {
        const { 
            minClusters = 2, 
            similarityThreshold = 0.7, 
            limit = 20 
        } = options;

        try {
            // Get all user's clusters and their collections
            const clusters = await this.clusterRepo.findByUserId(userId);
            if (clusters.length < minClusters) {
                return {
                    bridgeDocuments: [],
                    analysis: {
                        totalClusters: clusters.length,
                        message: `Need at least ${minClusters} clusters for bridge analysis`
                    }
                };
            }

            const bridgeDocuments = [];

            // For each cluster, find documents that are similar to documents in other clusters
            for (let i = 0; i < clusters.length; i++) {
                const sourceCluster = clusters[i];
                const sourceCollections = await this.clusterRepo.getClusterCollections(sourceCluster.id, userId);

                for (let j = i + 1; j < clusters.length; j++) {
                    const targetCluster = clusters[j];
                    const bridges = await this.findBridgesBetweenClusters(
                        sourceCluster, 
                        targetCluster, 
                        userId, 
                        similarityThreshold
                    );
                    bridgeDocuments.push(...bridges);
                }
            }

            // Sort by bridge strength (number of clusters connected)
            const sortedBridges = bridgeDocuments
                .sort((a, b) => b.bridgeStrength - a.bridgeStrength)
                .slice(0, limit);

            return {
                bridgeDocuments: sortedBridges,
                analysis: {
                    totalClusters: clusters.length,
                    bridgesFound: sortedBridges.length,
                    strongBridges: sortedBridges.filter(b => b.bridgeStrength >= 0.8).length,
                    clusterConnections: this.analyzeClusterConnections(sortedBridges)
                }
            };

        } catch (error) {
            console.error('Error finding bridge documents:', error);
            throw error;
        }
    }

    /**
     * Analyze overlaps and similarities between clusters
     * @param {number} userId - User ID
     * @returns {Promise<object>} Cluster overlap analysis
     */
    async analyzeClusterOverlaps(userId) {
        try {
            const clusters = await this.clusterRepo.findByUserId(userId);
            if (clusters.length < 2) {
                return {
                    overlaps: [],
                    summary: {
                        totalClusters: clusters.length,
                        message: 'Need at least 2 clusters for overlap analysis'
                    }
                };
            }

            const overlaps = [];

            // Compare each pair of clusters
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const overlap = await this.calculateClusterOverlap(clusters[i], clusters[j], userId);
                    if (overlap.similarity > 0.3) { // Only include significant overlaps
                        overlaps.push(overlap);
                    }
                }
            }

            // Sort by similarity strength
            overlaps.sort((a, b) => b.similarity - a.similarity);

            return {
                overlaps,
                summary: {
                    totalClusters: clusters.length,
                    significantOverlaps: overlaps.length,
                    highOverlaps: overlaps.filter(o => o.similarity >= 0.7).length,
                    recommendations: this.generateOverlapRecommendations(overlaps)
                }
            };

        } catch (error) {
            console.error('Error analyzing cluster overlaps:', error);
            throw error;
        }
    }

    /**
     * Find collaboration opportunities based on cluster relationships
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Collaboration opportunities
     */
    async findCollaborationOpportunities(userId) {
        try {
            // Find bridge documents first
            const bridgeAnalysis = await this.findBridgeDocuments(userId, { minClusters: 2 });
            
            // Find cluster overlaps
            const overlapAnalysis = await this.analyzeClusterOverlaps(userId);

            const opportunities = [];

            // Generate collaboration opportunities from bridge documents
            const bridgeOpportunities = this.generateBridgeCollaborations(bridgeAnalysis.bridgeDocuments);
            opportunities.push(...bridgeOpportunities);

            // Generate collaboration opportunities from overlaps
            const overlapOpportunities = this.generateOverlapCollaborations(overlapAnalysis.overlaps);
            opportunities.push(...overlapOpportunities);

            // Deduplicate and score opportunities
            const uniqueOpportunities = this.deduplicateOpportunities(opportunities);
            uniqueOpportunities.sort((a, b) => b.score - a.score);

            return {
                opportunities: uniqueOpportunities.slice(0, 10), // Top 10 opportunities
                summary: {
                    totalOpportunities: uniqueOpportunities.length,
                    highPotential: uniqueOpportunities.filter(o => o.score >= 0.8).length,
                    categories: this.categorizeOpportunities(uniqueOpportunities)
                }
            };

        } catch (error) {
            console.error('Error finding collaboration opportunities:', error);
            throw error;
        }
    }

    /**
     * Detect content duplication across clusters
     * @param {number} userId - User ID
     * @param {number} threshold - Similarity threshold for duplication
     * @returns {Promise<object>} Duplication analysis
     */
    async detectCrossClusterDuplication(userId, threshold = 0.8) {
        try {
            const clusters = await this.clusterRepo.findByUserId(userId);
            const duplications = [];

            // Compare documents across different clusters
            for (let i = 0; i < clusters.length; i++) {
                const sourceCluster = clusters[i];
                const sourceCollections = await this.clusterRepo.getClusterCollections(sourceCluster.id, userId);

                for (let j = i + 1; j < clusters.length; j++) {
                    const targetCluster = clusters[j];
                    const targetCollections = await this.clusterRepo.getClusterCollections(targetCluster.id, userId);

                    const clusterDuplications = await this.findDuplicationsBetweenClusters(
                        sourceCluster,
                        sourceCollections,
                        targetCluster,
                        targetCollections,
                        threshold
                    );

                    duplications.push(...clusterDuplications);
                }
            }

            return {
                duplications,
                summary: {
                    totalClusters: clusters.length,
                    duplicationsFound: duplications.length,
                    highSimilarity: duplications.filter(d => d.similarity >= 0.9).length,
                    recommendations: this.generateDeduplicationRecommendations(duplications)
                }
            };

        } catch (error) {
            console.error('Error detecting cross-cluster duplication:', error);
            throw error;
        }
    }

    /**
     * Get cluster evolution trends and patterns
     * @param {number} userId - User ID
     * @param {number} daysPeriod - Analysis period in days
     * @returns {Promise<object>} Trend analysis
     */
    async getClusterTrends(userId, daysPeriod = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysPeriod);

            // Get cluster activity data
            const trends = await this.db.query(
                `SELECT 
                    cl.id as cluster_id,
                    cl.name as cluster_name,
                    COUNT(c.id) as collection_count,
                    COUNT(d.id) as document_count,
                    MAX(d.created_at) as last_document_added,
                    COUNT(CASE WHEN d.created_at >= $2 THEN 1 END) as recent_documents
                 FROM clusters cl
                 LEFT JOIN collections c ON cl.id = c.cluster_id
                 LEFT JOIN documents d ON c.id = d.collection_id
                 WHERE cl.user_id = $1
                 GROUP BY cl.id, cl.name
                 ORDER BY recent_documents DESC, last_document_added DESC`,
                [userId, cutoffDate]
            );

            return {
                trends: trends.rows.map(trend => ({
                    clusterId: trend.cluster_id,
                    clusterName: trend.cluster_name,
                    collectionCount: parseInt(trend.collection_count),
                    documentCount: parseInt(trend.document_count),
                    recentDocuments: parseInt(trend.recent_documents),
                    lastActivity: trend.last_document_added,
                    activityLevel: this.calculateActivityLevel(parseInt(trend.recent_documents), daysPeriod),
                    trend: this.calculateTrendDirection(trend)
                })),
                summary: {
                    analysisPeriod: daysPeriod,
                    totalClusters: trends.rows.length,
                    activeClusters: trends.rows.filter(t => parseInt(t.recent_documents) > 0).length,
                    fastestGrowing: trends.rows[0]?.cluster_name || 'None'
                }
            };

        } catch (error) {
            console.error('Error analyzing cluster trends:', error);
            throw error;
        }
    }

    // Private helper methods

    async findBridgesBetweenClusters(sourceCluster, targetCluster, userId, threshold) {
        try {
            const sourceCollections = await this.clusterRepo.getClusterCollections(sourceCluster.id, userId);
            const targetCollections = await this.clusterRepo.getClusterCollections(targetCluster.id, userId);

            const bridges = [];

            // Compare documents between clusters using content similarity
            for (const sourceCollection of sourceCollections) {
                const sourceDocuments = await this.getCollectionDocuments(sourceCollection.id);

                for (const targetCollection of targetCollections) {
                    const targetDocuments = await this.getCollectionDocuments(targetCollection.id);

                    for (const sourceDoc of sourceDocuments) {
                        for (const targetDoc of targetDocuments) {
                            const similarity = await this.calculateDocumentSimilarity(sourceDoc, targetDoc);

                            if (similarity >= threshold) {
                                bridges.push({
                                    sourceDocument: {
                                        id: sourceDoc.id,
                                        filename: sourceDoc.filename,
                                        clusterId: sourceCluster.id,
                                        clusterName: sourceCluster.name,
                                        collectionId: sourceCollection.id,
                                        collectionName: sourceCollection.name
                                    },
                                    targetDocument: {
                                        id: targetDoc.id,
                                        filename: targetDoc.filename,
                                        clusterId: targetCluster.id,
                                        clusterName: targetCluster.name,
                                        collectionId: targetCollection.id,
                                        collectionName: targetCollection.name
                                    },
                                    bridgeStrength: similarity,
                                    bridgeType: 'content_similarity'
                                });
                            }
                        }
                    }
                }
            }

            return bridges;

        } catch (error) {
            console.warn(`Failed to find bridges between clusters ${sourceCluster.id} and ${targetCluster.id}:`, error.message);
            return [];
        }
    }

    async calculateClusterOverlap(cluster1, cluster2, userId) {
        try {
            const collections1 = await this.clusterRepo.getClusterCollections(cluster1.id, userId);
            const collections2 = await this.clusterRepo.getClusterCollections(cluster2.id, userId);

            // Calculate semantic similarity between cluster content
            const topics1 = await this.getClusterTopics(collections1);
            const topics2 = await this.getClusterTopics(collections2);

            const topicSimilarity = this.calculateTopicSimilarity(topics1, topics2);

            // Calculate document similarity across clusters
            const documentSimilarity = await this.calculateClusterDocumentSimilarity(collections1, collections2);

            // Combined similarity score
            const similarity = (topicSimilarity * 0.6) + (documentSimilarity * 0.4);

            return {
                cluster1: {
                    id: cluster1.id,
                    name: cluster1.name,
                    collectionCount: collections1.length
                },
                cluster2: {
                    id: cluster2.id,
                    name: cluster2.name,
                    collectionCount: collections2.length
                },
                similarity,
                topicSimilarity,
                documentSimilarity,
                overlapType: this.classifyOverlapType(similarity),
                recommendations: this.generateOverlapRecommendation(cluster1, cluster2, similarity)
            };

        } catch (error) {
            console.warn(`Failed to calculate overlap between clusters ${cluster1.id} and ${cluster2.id}:`, error.message);
            return {
                cluster1: { id: cluster1.id, name: cluster1.name },
                cluster2: { id: cluster2.id, name: cluster2.name },
                similarity: 0,
                error: error.message
            };
        }
    }

    async getCollectionDocuments(collectionId) {
        try {
            const result = await this.db.query(
                'SELECT id, filename, content_preview FROM documents WHERE collection_id = $1 LIMIT 50',
                [collectionId]
            );
            return result.rows;
        } catch (error) {
            console.warn(`Failed to get documents for collection ${collectionId}:`, error.message);
            return [];
        }
    }

    async calculateDocumentSimilarity(doc1, doc2) {
        try {
            // Simple text similarity based on content preview
            const text1 = (doc1.content_preview || doc1.filename || '').toLowerCase();
            const text2 = (doc2.content_preview || doc2.filename || '').toLowerCase();

            if (!text1 || !text2) return 0;

            // Calculate word overlap
            const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
            const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));

            const intersection = new Set([...words1].filter(w => words2.has(w)));
            const union = new Set([...words1, ...words2]);

            return union.size > 0 ? intersection.size / union.size : 0;

        } catch (error) {
            return 0;
        }
    }

    async getClusterTopics(collections) {
        const allTopics = [];

        for (const collection of collections) {
            // Extract topics from collection names and descriptions
            const text = `${collection.name} ${collection.description || ''}`.toLowerCase();
            const words = text.split(/\s+/)
                .filter(word => word.length > 2 && !this.isStopWord(word));
            allTopics.push(...words);
        }

        // Return unique topics
        return [...new Set(allTopics)];
    }

    calculateTopicSimilarity(topics1, topics2) {
        if (!topics1.length || !topics2.length) return 0;

        const set1 = new Set(topics1);
        const set2 = new Set(topics2);
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    async calculateClusterDocumentSimilarity(collections1, collections2) {
        // Simplified document similarity calculation
        // In production, this would use vector embeddings
        try {
            let totalSimilarity = 0;
            let comparisons = 0;

            for (const collection1 of collections1.slice(0, 3)) { // Limit for performance
                const docs1 = await this.getCollectionDocuments(collection1.id);
                
                for (const collection2 of collections2.slice(0, 3)) {
                    const docs2 = await this.getCollectionDocuments(collection2.id);
                    
                    for (const doc1 of docs1.slice(0, 5)) {
                        for (const doc2 of docs2.slice(0, 5)) {
                            const similarity = await this.calculateDocumentSimilarity(doc1, doc2);
                            totalSimilarity += similarity;
                            comparisons++;
                        }
                    }
                }
            }

            return comparisons > 0 ? totalSimilarity / comparisons : 0;

        } catch (error) {
            console.warn('Failed to calculate cluster document similarity:', error.message);
            return 0;
        }
    }

    isStopWord(word) {
        const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
        return stopWords.has(word);
    }

    classifyOverlapType(similarity) {
        if (similarity >= 0.8) return 'high_overlap';
        if (similarity >= 0.6) return 'moderate_overlap';
        if (similarity >= 0.4) return 'low_overlap';
        return 'minimal_overlap';
    }

    generateOverlapRecommendation(cluster1, cluster2, similarity) {
        if (similarity >= 0.8) {
            return `Consider merging "${cluster1.name}" and "${cluster2.name}" - they have very similar content.`;
        } else if (similarity >= 0.6) {
            return `Review the organization of "${cluster1.name}" and "${cluster2.name}" - there may be opportunities to reorganize.`;
        } else if (similarity >= 0.4) {
            return `Some content overlap detected between "${cluster1.name}" and "${cluster2.name}" - monitor for potential consolidation.`;
        }
        return null;
    }

    generateOverlapRecommendations(overlaps) {
        const recommendations = [];
        
        const highOverlaps = overlaps.filter(o => o.similarity >= 0.8);
        if (highOverlaps.length > 0) {
            recommendations.push(`Consider merging ${highOverlaps.length} highly similar cluster pair(s).`);
        }

        const moderateOverlaps = overlaps.filter(o => o.similarity >= 0.6 && o.similarity < 0.8);
        if (moderateOverlaps.length > 0) {
            recommendations.push(`Review organization of ${moderateOverlaps.length} moderately overlapping cluster pair(s).`);
        }

        return recommendations;
    }

    analyzeClusterConnections(bridgeDocuments) {
        const connections = {};
        
        bridgeDocuments.forEach(bridge => {
            const sourceCluster = bridge.sourceDocument.clusterName;
            const targetCluster = bridge.targetDocument.clusterName;
            
            const key = `${sourceCluster} ↔ ${targetCluster}`;
            connections[key] = (connections[key] || 0) + 1;
        });

        return Object.entries(connections)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([connection, count]) => ({ connection, bridgeCount: count }));
    }

    generateBridgeCollaborations(bridgeDocuments) {
        const opportunities = [];
        const clusterPairs = new Map();

        // Group bridges by cluster pairs
        bridgeDocuments.forEach(bridge => {
            const key = `${bridge.sourceDocument.clusterId}-${bridge.targetDocument.clusterId}`;
            if (!clusterPairs.has(key)) {
                clusterPairs.set(key, {
                    sourceCluster: bridge.sourceDocument,
                    targetCluster: bridge.targetDocument,
                    bridges: []
                });
            }
            clusterPairs.get(key).bridges.push(bridge);
        });

        // Generate opportunities from cluster pairs with multiple bridges
        clusterPairs.forEach(({ sourceCluster, targetCluster, bridges }) => {
            if (bridges.length >= 2) {
                const avgStrength = bridges.reduce((sum, b) => sum + b.bridgeStrength, 0) / bridges.length;
                
                opportunities.push({
                    type: 'cross_cluster_collaboration',
                    description: `Strong content connections between "${sourceCluster.clusterName}" and "${targetCluster.clusterName}"`,
                    clusters: [sourceCluster.clusterName, targetCluster.clusterName],
                    score: Math.min(0.95, avgStrength + (bridges.length * 0.1)),
                    details: `${bridges.length} bridge document(s) with average similarity of ${(avgStrength * 100).toFixed(1)}%`,
                    actionSuggestion: 'Consider joint projects or knowledge sharing between these clusters.'
                });
            }
        });

        return opportunities;
    }

    generateOverlapCollaborations(overlaps) {
        return overlaps
            .filter(overlap => overlap.similarity >= 0.6)
            .map(overlap => ({
                type: 'cluster_merge_opportunity',
                description: `Potential collaboration between "${overlap.cluster1.name}" and "${overlap.cluster2.name}"`,
                clusters: [overlap.cluster1.name, overlap.cluster2.name],
                score: overlap.similarity,
                details: `${(overlap.similarity * 100).toFixed(1)}% content similarity`,
                actionSuggestion: overlap.similarity >= 0.8 ? 
                    'Consider merging these clusters.' : 
                    'Consider joint initiatives or cross-pollination.'
            }));
    }

    deduplicateOpportunities(opportunities) {
        const seen = new Set();
        return opportunities.filter(opp => {
            const key = [...opp.clusters].sort().join('-');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    categorizeOpportunities(opportunities) {
        const categories = {};
        opportunities.forEach(opp => {
            categories[opp.type] = (categories[opp.type] || 0) + 1;
        });
        return categories;
    }

    async findDuplicationsBetweenClusters(sourceCluster, sourceCollections, targetCluster, targetCollections, threshold) {
        const duplications = [];

        try {
            for (const sourceCollection of sourceCollections) {
                const sourceDocs = await this.getCollectionDocuments(sourceCollection.id);
                
                for (const targetCollection of targetCollections) {
                    const targetDocs = await this.getCollectionDocuments(targetCollection.id);
                    
                    for (const sourceDoc of sourceDocs) {
                        for (const targetDoc of targetDocs) {
                            const similarity = await this.calculateDocumentSimilarity(sourceDoc, targetDoc);
                            
                            if (similarity >= threshold) {
                                duplications.push({
                                    sourceDocument: {
                                        ...sourceDoc,
                                        clusterName: sourceCluster.name,
                                        collectionName: sourceCollection.name
                                    },
                                    targetDocument: {
                                        ...targetDoc,
                                        clusterName: targetCluster.name,
                                        collectionName: targetCollection.name
                                    },
                                    similarity,
                                    duplicationType: similarity >= 0.95 ? 'exact_duplicate' : 'similar_content'
                                });
                            }
                        }
                    }
                }
            }

            return duplications;

        } catch (error) {
            console.warn(`Failed to find duplications between clusters:`, error.message);
            return [];
        }
    }

    generateDeduplicationRecommendations(duplications) {
        const recommendations = [];
        
        const exactDuplicates = duplications.filter(d => d.similarity >= 0.95);
        if (exactDuplicates.length > 0) {
            recommendations.push(`Remove ${exactDuplicates.length} exact duplicate(s) to reduce redundancy.`);
        }

        const similarContent = duplications.filter(d => d.similarity >= 0.8 && d.similarity < 0.95);
        if (similarContent.length > 0) {
            recommendations.push(`Review ${similarContent.length} highly similar document(s) for potential consolidation.`);
        }

        return recommendations;
    }

    calculateActivityLevel(recentDocuments, daysPeriod) {
        const docsPerDay = recentDocuments / daysPeriod;
        if (docsPerDay >= 1) return 'very_active';
        if (docsPerDay >= 0.5) return 'active';
        if (docsPerDay >= 0.1) return 'moderate';
        if (recentDocuments > 0) return 'low';
        return 'inactive';
    }

    calculateTrendDirection(trend) {
        const recentActivity = parseInt(trend.recent_documents);
        const totalActivity = parseInt(trend.document_count);
        
        if (totalActivity === 0) return 'new';
        
        const recentRatio = recentActivity / totalActivity;
        if (recentRatio >= 0.3) return 'growing';
        if (recentRatio >= 0.1) return 'stable';
        return 'declining';
    }
}

module.exports = { CrossClusterAnalyticsService };
