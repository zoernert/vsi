const { DatabaseService } = require('./databaseService');
const { ContentClusteringService } = require('./contentClusteringService');
const { ClusterIntelligenceService } = require('./clusterIntelligenceService');
const { CrossClusterAnalyticsService } = require('./crossClusterAnalyticsService');
const ClusterRepository = require('../repositories/ClusterRepository');
const CollectionRepository = require('../repositories/CollectionRepository');

/**
 * Dynamic clustering service for automated cluster management and evolution
 * Handles automatic cluster splitting, merging, and rebalancing
 */
class DynamicClusteringService {
    constructor() {
        this.db = new DatabaseService();
        this.contentClustering = new ContentClusteringService();
        this.clusterIntelligence = new ClusterIntelligenceService();
        this.crossClusterAnalytics = new CrossClusterAnalyticsService();
        this.clusterRepo = new ClusterRepository(this.db);
        this.collectionRepo = new CollectionRepository(this.db);
    }

    /**
     * Analyze the health of all clusters for a user and suggest improvements
     * @param {number} userId - User ID
     * @returns {Promise<object>} Cluster health analysis with recommendations
     */
    async analyzeClusterHealth(userId) {
        try {
            const clusters = await this.clusterRepo.findByUserId(userId);
            if (clusters.length === 0) {
                return {
                    healthScore: 1.0,
                    clusters: [],
                    recommendations: ['Create your first cluster to organize your collections.'],
                    summary: { totalClusters: 0, healthyClusters: 0 }
                };
            }

            const clusterHealth = [];
            let totalHealthScore = 0;

            for (const cluster of clusters) {
                const health = await this.analyzeIndividualClusterHealth(cluster, userId);
                clusterHealth.push(health);
                totalHealthScore += health.healthScore;
            }

            const averageHealthScore = totalHealthScore / clusters.length;
            const recommendations = this.generateHealthRecommendations(clusterHealth);

            // Find clusters that need attention
            const unhealthyClusters = clusterHealth.filter(h => h.healthScore < 0.6);
            const oversizedClusters = clusterHealth.filter(h => h.metrics.collectionCount > 10);
            const undersizedClusters = clusterHealth.filter(h => h.metrics.collectionCount === 1);

            return {
                healthScore: averageHealthScore,
                clusters: clusterHealth,
                recommendations,
                summary: {
                    totalClusters: clusters.length,
                    healthyClusters: clusterHealth.filter(h => h.healthScore >= 0.7).length,
                    needsAttention: unhealthyClusters.length,
                    oversized: oversizedClusters.length,
                    undersized: undersizedClusters.length
                },
                actionItems: [
                    ...unhealthyClusters.map(c => ({
                        type: 'improve_health',
                        clusterId: c.clusterId,
                        clusterName: c.clusterName,
                        action: 'Review cluster organization',
                        priority: 'high'
                    })),
                    ...oversizedClusters.map(c => ({
                        type: 'split_cluster',
                        clusterId: c.clusterId,
                        clusterName: c.clusterName,
                        action: 'Consider splitting into smaller clusters',
                        priority: 'medium'
                    })),
                    ...undersizedClusters.map(c => ({
                        type: 'merge_or_expand',
                        clusterId: c.clusterId,
                        clusterName: c.clusterName,
                        action: 'Consider merging with similar cluster or adding related collections',
                        priority: 'low'
                    }))
                ]
            };

        } catch (error) {
            console.error('Error analyzing cluster health:', error);
            throw error;
        }
    }

    /**
     * Automatically split an overgrown cluster into smaller, more focused clusters
     * @param {number} clusterId - Cluster to split
     * @param {number} userId - User ID
     * @param {object} options - Split options
     * @returns {Promise<object>} Split results
     */
    async splitCluster(clusterId, userId, options = {}) {
        const { 
            maxClustersAfterSplit = 3, 
            minCollectionsPerCluster = 2,
            preserveOriginal = false 
        } = options;

        try {
            const cluster = await this.clusterRepo.findById(clusterId);
            if (!cluster || cluster.user_id !== userId) {
                throw new Error('Cluster not found or access denied');
            }

            const collections = await this.clusterRepo.getClusterCollections(clusterId, userId);
            if (collections.length < minCollectionsPerCluster * 2) {
                throw new Error(`Cluster has insufficient collections for splitting (minimum: ${minCollectionsPerCluster * 2})`);
            }

            // Analyze content to determine optimal split
            const splitAnalysis = await this.analyzeSplitOpportunities(collections, maxClustersAfterSplit);

            if (!splitAnalysis.canSplit) {
                return {
                    success: false,
                    reason: splitAnalysis.reason,
                    originalCluster: cluster,
                    suggestions: splitAnalysis.suggestions
                };
            }

            // Create new clusters based on content analysis
            const newClusters = [];
            
            for (let i = 0; i < splitAnalysis.suggestedClusters.length; i++) {
                const clusterData = splitAnalysis.suggestedClusters[i];
                
                const newCluster = await this.clusterRepo.create({
                    name: clusterData.name,
                    description: clusterData.description,
                    user_id: userId,
                    cluster_type: 'content_based',
                    settings: JSON.stringify({
                        split_from: clusterId,
                        split_date: new Date().toISOString(),
                        auto_generated: true,
                        split_method: 'content_analysis'
                    })
                });

                // Move collections to new cluster
                for (const collection of clusterData.collections) {
                    await this.collectionRepo.update(collection.id, {
                        cluster_id: newCluster.id,
                        cluster_name: newCluster.name
                    });
                }

                newClusters.push({
                    cluster: newCluster,
                    collections: clusterData.collections
                });
            }

            // Handle original cluster
            let originalClusterResult;
            if (preserveOriginal && splitAnalysis.remainingCollections.length > 0) {
                // Keep original cluster with remaining collections
                await this.clusterRepo.update(clusterId, {
                    description: `${cluster.description} (Split on ${new Date().toLocaleDateString()})`
                });
                originalClusterResult = {
                    kept: true,
                    collections: splitAnalysis.remainingCollections
                };
            } else {
                // Remove original cluster if empty or not preserving
                if (splitAnalysis.remainingCollections.length === 0) {
                    await this.clusterRepo.delete(clusterId);
                    originalClusterResult = { removed: true, reason: 'All collections moved to new clusters' };
                } else {
                    // Move remaining collections to first new cluster
                    for (const collection of splitAnalysis.remainingCollections) {
                        await this.collectionRepo.update(collection.id, {
                            cluster_id: newClusters[0].cluster.id,
                            cluster_name: newClusters[0].cluster.name
                        });
                    }
                    newClusters[0].collections.push(...splitAnalysis.remainingCollections);
                    await this.clusterRepo.delete(clusterId);
                    originalClusterResult = { removed: true, reason: 'Merged with new clusters' };
                }
            }

            // Log the split event
            await this.logClusterEvent(userId, 'split', {
                sourceClusterIds: [clusterId],
                targetClusterIds: newClusters.map(nc => nc.cluster.id),
                affectedCollections: collections.map(c => c.id),
                triggerReason: 'Manual cluster split',
                newClustersCount: newClusters.length
            });

            return {
                success: true,
                originalCluster: {
                    id: clusterId,
                    name: cluster.name,
                    result: originalClusterResult
                },
                newClusters: newClusters.map(nc => ({
                    id: nc.cluster.id,
                    name: nc.cluster.name,
                    collectionCount: nc.collections.length,
                    collections: nc.collections.map(c => ({ id: c.id, name: c.name }))
                })),
                summary: {
                    originalCollections: collections.length,
                    newClustersCreated: newClusters.length,
                    collectionsRedistributed: collections.length
                }
            };

        } catch (error) {
            console.error('Error splitting cluster:', error);
            throw error;
        }
    }

    /**
     * Merge multiple similar clusters into a single consolidated cluster
     * @param {Array} clusterIds - Array of cluster IDs to merge
     * @param {number} userId - User ID
     * @param {object} options - Merge options
     * @returns {Promise<object>} Merge results
     */
    async mergeClusters(clusterIds, userId, options = {}) {
        const { newClusterName, newClusterDescription } = options;

        try {
            if (clusterIds.length < 2) {
                throw new Error('Need at least 2 clusters to merge');
            }

            // Validate all clusters belong to user
            const clusters = [];
            const allCollections = [];

            for (const clusterId of clusterIds) {
                const cluster = await this.clusterRepo.findById(clusterId);
                if (!cluster || cluster.user_id !== userId) {
                    throw new Error(`Cluster ${clusterId} not found or access denied`);
                }
                clusters.push(cluster);

                const collections = await this.clusterRepo.getClusterCollections(clusterId, userId);
                allCollections.push(...collections);
            }

            // Analyze merge compatibility
            const mergeAnalysis = await this.analyzeMergeCompatibility(clusters, userId);
            if (!mergeAnalysis.canMerge) {
                return {
                    success: false,
                    reason: mergeAnalysis.reason,
                    compatibility: mergeAnalysis.compatibility,
                    suggestions: mergeAnalysis.suggestions
                };
            }

            // Generate merged cluster name and description
            const mergedName = newClusterName || await this.generateMergedClusterName(clusters);
            const mergedDescription = newClusterDescription || await this.generateMergedClusterDescription(clusters, allCollections);

            // Create new merged cluster
            const mergedCluster = await this.clusterRepo.create({
                name: mergedName,
                description: mergedDescription,
                user_id: userId,
                cluster_type: 'merged',
                settings: JSON.stringify({
                    merged_from: clusterIds,
                    merge_date: new Date().toISOString(),
                    merge_compatibility: mergeAnalysis.compatibility,
                    auto_generated: !newClusterName // True if name was auto-generated
                })
            });

            // Move all collections to merged cluster
            for (const collection of allCollections) {
                await this.collectionRepo.update(collection.id, {
                    cluster_id: mergedCluster.id,
                    cluster_name: mergedCluster.name
                });
            }

            // Remove original clusters
            for (const clusterId of clusterIds) {
                await this.clusterRepo.delete(clusterId);
            }

            // Log the merge event
            await this.logClusterEvent(userId, 'merge', {
                sourceClusterIds: clusterIds,
                targetClusterIds: [mergedCluster.id],
                affectedCollections: allCollections.map(c => c.id),
                triggerReason: 'Cluster merge operation',
                mergedClustersCount: clusterIds.length
            });

            return {
                success: true,
                mergedCluster: {
                    id: mergedCluster.id,
                    name: mergedCluster.name,
                    description: mergedCluster.description,
                    collectionCount: allCollections.length
                },
                originalClusters: clusters.map(c => ({
                    id: c.id,
                    name: c.name,
                    collectionCount: allCollections.filter(col => col.cluster_id === c.id).length
                })),
                summary: {
                    clustersmerged: clusterIds.length,
                    totalCollections: allCollections.length,
                    compatibility: mergeAnalysis.compatibility
                }
            };

        } catch (error) {
            console.error('Error merging clusters:', error);
            throw error;
        }
    }

    /**
     * Rebalance all clusters for optimal organization
     * @param {number} userId - User ID
     * @param {object} options - Rebalancing options
     * @returns {Promise<object>} Rebalancing results
     */
    async rebalanceClusters(userId, options = {}) {
        const { 
            maxClusterSize = 8, 
            minClusterSize = 2, 
            similarityThreshold = 0.6,
            dryRun = false 
        } = options;

        try {
            const clusters = await this.clusterRepo.findByUserId(userId);
            if (clusters.length < 2) {
                return {
                    success: false,
                    reason: 'Need at least 2 clusters for rebalancing',
                    currentClusters: clusters.length
                };
            }

            // Analyze current cluster state
            const rebalanceAnalysis = await this.analyzeRebalanceOpportunities(
                clusters, 
                userId, 
                { maxClusterSize, minClusterSize, similarityThreshold }
            );

            if (!rebalanceAnalysis.needsRebalancing) {
                return {
                    success: true,
                    message: 'Clusters are already well-balanced',
                    analysis: rebalanceAnalysis,
                    changes: []
                };
            }

            if (dryRun) {
                return {
                    success: true,
                    dryRun: true,
                    analysis: rebalanceAnalysis,
                    proposedChanges: rebalanceAnalysis.proposedChanges
                };
            }

            // Execute rebalancing operations
            const changes = [];

            // Handle oversized clusters (split)
            for (const oversizedCluster of rebalanceAnalysis.oversizedClusters) {
                try {
                    const splitResult = await this.splitCluster(oversizedCluster.id, userId, {
                        maxClustersAfterSplit: Math.ceil(oversizedCluster.collectionCount / maxClusterSize),
                        minCollectionsPerCluster: minClusterSize
                    });

                    if (splitResult.success) {
                        changes.push({
                            type: 'split',
                            clusterId: oversizedCluster.id,
                            clusterName: oversizedCluster.name,
                            result: splitResult,
                            reason: `Cluster too large (${oversizedCluster.collectionCount} collections)`
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to split cluster ${oversizedCluster.id}:`, error.message);
                }
            }

            // Handle undersized clusters (merge)
            const undersizedGroups = this.groupUndersizedClustersForMerging(
                rebalanceAnalysis.undersizedClusters, 
                similarityThreshold
            );

            for (const group of undersizedGroups) {
                if (group.length >= 2) {
                    try {
                        const mergeResult = await this.mergeClusters(
                            group.map(c => c.id), 
                            userId
                        );

                        if (mergeResult.success) {
                            changes.push({
                                type: 'merge',
                                clusterIds: group.map(c => c.id),
                                clusterNames: group.map(c => c.name),
                                result: mergeResult,
                                reason: 'Undersized clusters with similar content'
                            });
                        }
                    } catch (error) {
                        console.warn(`Failed to merge clusters ${group.map(c => c.id).join(', ')}:`, error.message);
                    }
                }
            }

            // Handle misplaced collections
            for (const move of rebalanceAnalysis.suggestedMoves) {
                try {
                    await this.collectionRepo.update(move.collectionId, {
                        cluster_id: move.targetClusterId,
                        cluster_name: move.targetClusterName
                    });

                    changes.push({
                        type: 'move',
                        collectionId: move.collectionId,
                        collectionName: move.collectionName,
                        fromCluster: move.fromClusterName,
                        toCluster: move.targetClusterName,
                        reason: move.reason
                    });
                } catch (error) {
                    console.warn(`Failed to move collection ${move.collectionId}:`, error.message);
                }
            }

            // Log the rebalancing event
            await this.logClusterEvent(userId, 'rebalance', {
                sourceClusterIds: clusters.map(c => c.id),
                affectedCollections: rebalanceAnalysis.allCollections.map(c => c.id),
                triggerReason: 'Automated cluster rebalancing',
                changesCount: changes.length,
                rebalanceMetrics: {
                    clustersBeforeRebalance: clusters.length,
                    maxClusterSize,
                    minClusterSize,
                    similarityThreshold
                }
            });

            return {
                success: true,
                analysis: rebalanceAnalysis,
                changes,
                summary: {
                    totalChanges: changes.length,
                    splits: changes.filter(c => c.type === 'split').length,
                    merges: changes.filter(c => c.type === 'merge').length,
                    moves: changes.filter(c => c.type === 'move').length
                }
            };

        } catch (error) {
            console.error('Error rebalancing clusters:', error);
            throw error;
        }
    }

    // Private helper methods

    async analyzeIndividualClusterHealth(cluster, userId) {
        try {
            const collections = await this.clusterRepo.getClusterCollections(cluster.id, userId);
            
            // Calculate various health metrics
            const collectionCount = collections.length;
            const hasDocuments = collections.some(c => c.document_count > 0);
            
            // Size health (optimal size is 3-8 collections)
            let sizeHealth;
            if (collectionCount === 0) sizeHealth = 0;
            else if (collectionCount === 1) sizeHealth = 0.3;
            else if (collectionCount >= 2 && collectionCount <= 8) sizeHealth = 1.0;
            else if (collectionCount <= 12) sizeHealth = 0.7;
            else sizeHealth = 0.4; // Too large

            // Content health (has documents and consistent themes)
            const contentHealth = hasDocuments ? 0.8 : 0.2;

            // Activity health (recent activity)
            const recentActivity = collections.filter(c => {
                const updatedAt = new Date(c.updated_at);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return updatedAt > thirtyDaysAgo;
            }).length;
            
            const activityHealth = collectionCount > 0 ? Math.min(1.0, recentActivity / collectionCount + 0.3) : 0;

            // Combined health score
            const healthScore = (sizeHealth * 0.4) + (contentHealth * 0.3) + (activityHealth * 0.3);

            // Generate issues and recommendations
            const issues = [];
            const recommendations = [];

            if (collectionCount === 0) {
                issues.push('Empty cluster');
                recommendations.push('Add collections or consider removing this cluster');
            } else if (collectionCount === 1) {
                issues.push('Only one collection');
                recommendations.push('Add related collections or merge with similar cluster');
            } else if (collectionCount > 10) {
                issues.push('Too many collections');
                recommendations.push('Consider splitting into smaller, more focused clusters');
            }

            if (!hasDocuments) {
                issues.push('No documents in collections');
                recommendations.push('Add documents to collections or remove empty collections');
            }

            if (recentActivity === 0 && collectionCount > 0) {
                issues.push('No recent activity');
                recommendations.push('Review if this cluster is still relevant');
            }

            return {
                clusterId: cluster.id,
                clusterName: cluster.name,
                healthScore: Math.round(healthScore * 100) / 100,
                status: healthScore >= 0.8 ? 'healthy' : 
                       healthScore >= 0.6 ? 'fair' : 
                       healthScore >= 0.4 ? 'poor' : 'critical',
                metrics: {
                    collectionCount,
                    documentsPresent: hasDocuments,
                    recentActivity,
                    sizeHealth,
                    contentHealth,
                    activityHealth
                },
                issues,
                recommendations
            };

        } catch (error) {
            console.warn(`Failed to analyze health for cluster ${cluster.id}:`, error.message);
            return {
                clusterId: cluster.id,
                clusterName: cluster.name,
                healthScore: 0,
                status: 'error',
                error: error.message
            };
        }
    }

    generateHealthRecommendations(clusterHealth) {
        const recommendations = [];
        
        const criticalClusters = clusterHealth.filter(h => h.healthScore < 0.4);
        const emptyClusters = clusterHealth.filter(h => h.metrics?.collectionCount === 0);
        const oversizedClusters = clusterHealth.filter(h => h.metrics?.collectionCount > 10);
        const inactiveClusters = clusterHealth.filter(h => h.metrics?.recentActivity === 0);

        if (criticalClusters.length > 0) {
            recommendations.push(`${criticalClusters.length} cluster(s) need immediate attention due to poor health scores.`);
        }

        if (emptyClusters.length > 0) {
            recommendations.push(`Remove ${emptyClusters.length} empty cluster(s) or add collections to them.`);
        }

        if (oversizedClusters.length > 0) {
            recommendations.push(`Consider splitting ${oversizedClusters.length} oversized cluster(s) for better organization.`);
        }

        if (inactiveClusters.length > 0) {
            recommendations.push(`Review ${inactiveClusters.length} inactive cluster(s) - they may need updating or archiving.`);
        }

        if (recommendations.length === 0) {
            recommendations.push('Your clusters are in good health! Consider regular maintenance to keep them organized.');
        }

        return recommendations;
    }

    async logClusterEvent(userId, eventType, metadata) {
        try {
            await this.db.query(
                `INSERT INTO cluster_events 
                 (user_id, event_type, source_cluster_ids, target_cluster_ids, affected_collections, trigger_reason, metadata) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    userId,
                    eventType,
                    metadata.sourceClusterIds || [],
                    metadata.targetClusterIds || [],
                    metadata.affectedCollections || [],
                    metadata.triggerReason || 'Unknown',
                    JSON.stringify(metadata)
                ]
            );
        } catch (error) {
            console.warn('Failed to log cluster event:', error.message);
            // Don't throw - logging failure shouldn't break the main operation
        }
    }

    async analyzeSplitOpportunities(collections, maxClusters) {
        // Analyze content diversity to determine if split is beneficial
        try {
            if (collections.length < 4) {
                return {
                    canSplit: false,
                    reason: 'Too few collections for meaningful split',
                    suggestions: ['Add more collections before considering split']
                };
            }

            // Simple content-based grouping (in production, use vector analysis)
            const groups = await this.groupCollectionsByContent(collections, maxClusters);
            
            if (groups.length < 2) {
                return {
                    canSplit: false,
                    reason: 'Collections are too similar for splitting',
                    suggestions: ['Collections appear to belong together - split may not be beneficial']
                };
            }

            // Generate cluster names and descriptions for each group
            const suggestedClusters = await Promise.all(
                groups.map(async (group, index) => ({
                    name: await this.generateGroupClusterName(group, index),
                    description: `Split cluster containing ${group.length} related collections`,
                    collections: group
                }))
            );

            return {
                canSplit: true,
                suggestedClusters,
                remainingCollections: [], // All collections will be distributed
                splitReason: `Content analysis suggests ${groups.length} distinct themes`
            };

        } catch (error) {
            return {
                canSplit: false,
                reason: 'Failed to analyze split opportunities',
                error: error.message
            };
        }
    }

    async groupCollectionsByContent(collections, maxGroups) {
        // Simplified content grouping - in production use vector clustering
        const groups = [];
        const ungrouped = [...collections];

        // Group by similar names/descriptions
        while (ungrouped.length > 0 && groups.length < maxGroups) {
            const seed = ungrouped.shift();
            const group = [seed];

            // Find similar collections
            for (let i = ungrouped.length - 1; i >= 0; i--) {
                const collection = ungrouped[i];
                if (this.calculateNameSimilarity(seed.name, collection.name) > 0.3) {
                    group.push(collection);
                    ungrouped.splice(i, 1);
                }
            }

            groups.push(group);
        }

        // Add remaining ungrouped collections to smallest group
        if (ungrouped.length > 0 && groups.length > 0) {
            const smallestGroup = groups.reduce((min, group) => 
                group.length < min.length ? group : min
            );
            smallestGroup.push(...ungrouped);
        }

        return groups.filter(group => group.length >= 1);
    }

    calculateNameSimilarity(name1, name2) {
        const words1 = new Set(name1.toLowerCase().split(/\s+/));
        const words2 = new Set(name2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return union.size > 0 ? intersection.size / union.size : 0;
    }

    async generateGroupClusterName(group, index) {
        try {
            // Extract common themes from group
            const allWords = group.flatMap(c => 
                c.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
            );
            
            const wordCounts = {};
            allWords.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });

            const commonWords = Object.entries(wordCounts)
                .filter(([word, count]) => count > 1)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 2)
                .map(([word]) => word);

            if (commonWords.length > 0) {
                return commonWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Cluster';
            }

            return `Content Group ${index + 1}`;

        } catch (error) {
            return `Split Cluster ${index + 1}`;
        }
    }

    async analyzeMergeCompatibility(clusters, userId) {
        try {
            // Calculate content similarity between clusters
            const similarities = [];
            
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const similarity = await this.calculateClusterContentSimilarity(
                        clusters[i], 
                        clusters[j], 
                        userId
                    );
                    similarities.push(similarity);
                }
            }

            const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
            const minSimilarity = Math.min(...similarities);

            const canMerge = avgSimilarity >= 0.4 && minSimilarity >= 0.2;

            return {
                canMerge,
                compatibility: avgSimilarity,
                reason: canMerge ? 
                    'Clusters have compatible content themes' : 
                    'Clusters have too dissimilar content for merging',
                suggestions: canMerge ? 
                    ['Merge will create a coherent combined cluster'] :
                    ['Consider reorganizing content before merging', 'Create bridge collections to connect themes']
            };

        } catch (error) {
            return {
                canMerge: false,
                compatibility: 0,
                reason: 'Failed to analyze merge compatibility',
                error: error.message
            };
        }
    }

    async calculateClusterContentSimilarity(cluster1, cluster2, userId) {
        try {
            const collections1 = await this.clusterRepo.getClusterCollections(cluster1.id, userId);
            const collections2 = await this.clusterRepo.getClusterCollections(cluster2.id, userId);

            // Simple name-based similarity (in production, use vector analysis)
            const names1 = collections1.map(c => c.name.toLowerCase());
            const names2 = collections2.map(c => c.name.toLowerCase());

            let totalSimilarity = 0;
            let comparisons = 0;

            names1.forEach(name1 => {
                names2.forEach(name2 => {
                    totalSimilarity += this.calculateNameSimilarity(name1, name2);
                    comparisons++;
                });
            });

            return comparisons > 0 ? totalSimilarity / comparisons : 0;

        } catch (error) {
            return 0;
        }
    }

    async generateMergedClusterName(clusters) {
        try {
            // Find common themes in cluster names
            const allWords = clusters.flatMap(c => 
                c.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
            );
            
            const wordCounts = {};
            allWords.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });

            const commonWords = Object.entries(wordCounts)
                .filter(([word, count]) => count > 1)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 2)
                .map(([word]) => word);

            if (commonWords.length > 0) {
                return commonWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Cluster';
            }

            return `Merged ${clusters[0].name.split(' ')[0]} Cluster`;

        } catch (error) {
            return 'Merged Cluster';
        }
    }

    async generateMergedClusterDescription(clusters, collections) {
        const clusterNames = clusters.map(c => c.name).join(', ');
        return `Merged cluster combining content from: ${clusterNames}. Contains ${collections.length} collections covering related topics.`;
    }

    async analyzeRebalanceOpportunities(clusters, userId, options) {
        const { maxClusterSize, minClusterSize, similarityThreshold } = options;
        
        const oversizedClusters = [];
        const undersizedClusters = [];
        const allCollections = [];
        const suggestedMoves = [];

        // Analyze each cluster
        for (const cluster of clusters) {
            const collections = await this.clusterRepo.getClusterCollections(cluster.id, userId);
            allCollections.push(...collections);

            const clusterData = {
                id: cluster.id,
                name: cluster.name,
                collectionCount: collections.length,
                collections
            };

            if (collections.length > maxClusterSize) {
                oversizedClusters.push(clusterData);
            } else if (collections.length < minClusterSize && collections.length > 0) {
                undersizedClusters.push(clusterData);
            }
        }

        // Analyze potential collection moves
        for (const cluster of clusters) {
            const collections = await this.clusterRepo.getClusterCollections(cluster.id, userId);
            
            for (const collection of collections) {
                // Check if collection might fit better in another cluster
                const betterFit = await this.findBetterClusterFit(
                    collection, 
                    cluster, 
                    clusters, 
                    userId, 
                    similarityThreshold
                );
                
                if (betterFit) {
                    suggestedMoves.push({
                        collectionId: collection.id,
                        collectionName: collection.name,
                        fromClusterId: cluster.id,
                        fromClusterName: cluster.name,
                        targetClusterId: betterFit.clusterId,
                        targetClusterName: betterFit.clusterName,
                        similarity: betterFit.similarity,
                        reason: `Better content fit (${(betterFit.similarity * 100).toFixed(1)}% similarity)`
                    });
                }
            }
        }

        const needsRebalancing = oversizedClusters.length > 0 || 
                               undersizedClusters.length > 1 || 
                               suggestedMoves.length > 0;

        return {
            needsRebalancing,
            oversizedClusters,
            undersizedClusters,
            suggestedMoves,
            allCollections,
            proposedChanges: {
                splits: oversizedClusters.length,
                merges: Math.floor(undersizedClusters.length / 2),
                moves: suggestedMoves.length
            }
        };
    }

    async findBetterClusterFit(collection, currentCluster, allClusters, userId, threshold) {
        let bestFit = null;
        let bestSimilarity = 0;

        for (const cluster of allClusters) {
            if (cluster.id === currentCluster.id) continue;

            // Calculate similarity with cluster content
            const collections = await this.clusterRepo.getClusterCollections(cluster.id, userId);
            let clusterSimilarity = 0;
            
            for (const clusterCollection of collections) {
                const similarity = this.calculateNameSimilarity(
                    collection.name, 
                    clusterCollection.name
                );
                clusterSimilarity = Math.max(clusterSimilarity, similarity);
            }

            if (clusterSimilarity > bestSimilarity && clusterSimilarity >= threshold) {
                bestSimilarity = clusterSimilarity;
                bestFit = {
                    clusterId: cluster.id,
                    clusterName: cluster.name,
                    similarity: clusterSimilarity
                };
            }
        }

        return bestFit;
    }

    groupUndersizedClustersForMerging(undersizedClusters, similarityThreshold) {
        const groups = [];
        const ungrouped = [...undersizedClusters];

        while (ungrouped.length > 1) {
            const seed = ungrouped.shift();
            const group = [seed];

            // Find similar clusters to group with seed
            for (let i = ungrouped.length - 1; i >= 0; i--) {
                const candidate = ungrouped[i];
                const similarity = this.calculateNameSimilarity(seed.name, candidate.name);
                
                if (similarity >= similarityThreshold) {
                    group.push(candidate);
                    ungrouped.splice(i, 1);
                }
            }

            if (group.length >= 2) {
                groups.push(group);
            }
        }

        return groups;
    }
}

module.exports = { DynamicClusteringService };
