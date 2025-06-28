const { DatabaseService } = require('./databaseService');
const { ContentClusteringService } = require('./contentClusteringService');
const { EmbeddingService } = require('./embeddingService');
const { GeminiService } = require('./geminiService');
const ClusterRepository = require('../repositories/ClusterRepository');
const CollectionRepository = require('../repositories/CollectionRepository');

/**
 * AI-powered cluster intelligence and suggestions service
 * Provides intelligent cluster suggestions, analysis, and recommendations
 */
class ClusterIntelligenceService {
    constructor() {
        this.db = new DatabaseService();
        this.contentClustering = new ContentClusteringService();
        this.embedding = new EmbeddingService();
        this.gemini = new GeminiService();
        this.clusterRepo = new ClusterRepository(this.db);
        this.collectionRepo = new CollectionRepository(this.db);
    }

    /**
     * Suggest appropriate clusters for a new or existing collection
     * @param {number} collectionId - ID of the collection to analyze
     * @param {number} userId - User ID
     * @param {object} options - Analysis options
     * @returns {Promise<Array>} Array of cluster suggestions with confidence scores
     */
    async suggestClustersForCollection(collectionId, userId, options = {}) {
        const { threshold = 0.7, maxSuggestions = 5 } = options;

        try {
            // Get collection details and content
            const collection = await this.collectionRepo.findById(collectionId);
            if (!collection || collection.user_id !== userId) {
                throw new Error('Collection not found or access denied');
            }

            // Get all user's clusters
            const existingClusters = await this.clusterRepo.findByUserId(userId);
            if (existingClusters.length === 0) {
                return [{
                    type: 'create_new',
                    confidence: 0.9,
                    reasoning: 'No existing clusters found. Consider creating your first thematic cluster.',
                    suggestedName: await this.generateClusterNameFromCollection(collection),
                    collection: collection
                }];
            }

            // Analyze collection content to understand its topic
            const collectionTopics = await this.analyzeCollectionTopics(collectionId);

            // Compare with existing clusters
            const suggestions = [];

            for (const cluster of existingClusters) {
                const similarity = await this.calculateClusterCollectionSimilarity(cluster, collection, collectionTopics);
                
                if (similarity >= threshold) {
                    suggestions.push({
                        type: 'move_to_existing',
                        clusterId: cluster.id,
                        clusterName: cluster.name,
                        confidence: similarity,
                        reasoning: await this.generateSuggestionReasoning(cluster, collection, similarity),
                        collection: collection
                    });
                }
            }

            // Sort by confidence and limit results
            suggestions.sort((a, b) => b.confidence - a.confidence);
            const topSuggestions = suggestions.slice(0, maxSuggestions);

            // Always suggest creating a new cluster as an option
            if (topSuggestions.length === 0 || topSuggestions[0].confidence < 0.8) {
                topSuggestions.unshift({
                    type: 'create_new',
                    confidence: 0.75,
                    reasoning: 'This collection appears to cover a unique topic that might benefit from its own cluster.',
                    suggestedName: await this.generateClusterNameFromCollection(collection),
                    collection: collection
                });
            }

            // Store suggestions in database for tracking
            await this.storeSuggestions(userId, collectionId, topSuggestions);

            return topSuggestions;

        } catch (error) {
            console.error('Error generating cluster suggestions:', error);
            throw error;
        }
    }

    /**
     * Analyze how well a collection fits in its current cluster
     * @param {number} collectionId - Collection to analyze
     * @param {number} clusterId - Current cluster ID
     * @param {number} userId - User ID
     * @returns {Promise<object>} Analysis results with fit score and recommendations
     */
    async analyzeClusterFit(collectionId, clusterId, userId) {
        try {
            const collection = await this.collectionRepo.findById(collectionId);
            const cluster = await this.clusterRepo.findById(clusterId);

            if (!collection || !cluster || collection.user_id !== userId || cluster.user_id !== userId) {
                throw new Error('Collection or cluster not found');
            }

            // Get other collections in the same cluster
            const clusterCollections = await this.clusterRepo.getClusterCollections(clusterId, userId);
            
            if (clusterCollections.length <= 1) {
                return {
                    fitScore: 1.0,
                    status: 'perfect_fit',
                    reasoning: 'This is the only collection in the cluster, so it defines the cluster theme.',
                    recommendations: []
                };
            }

            // Analyze content similarity with other collections in cluster
            const collectionTopics = await this.analyzeCollectionTopics(collectionId);
            const clusterTopics = await this.analyzeClusterTopics(clusterId, userId);

            const contentSimilarity = await this.calculateTopicSimilarity(collectionTopics, clusterTopics);
            
            // Calculate semantic fit using embeddings
            const semanticFit = await this.calculateSemanticFit(collection, clusterCollections);
            
            // Combined fit score (weighted average)
            const fitScore = (contentSimilarity * 0.6) + (semanticFit * 0.4);

            let status, reasoning, recommendations = [];

            if (fitScore >= 0.8) {
                status = 'excellent_fit';
                reasoning = 'This collection aligns very well with the cluster theme.';
            } else if (fitScore >= 0.6) {
                status = 'good_fit';
                reasoning = 'This collection fits reasonably well but could potentially belong elsewhere.';
                recommendations.push('Consider reviewing cluster assignments periodically.');
            } else if (fitScore >= 0.4) {
                status = 'poor_fit';
                reasoning = 'This collection may not belong in this cluster.';
                recommendations.push('Consider moving to a different cluster or creating a new one.');
            } else {
                status = 'misplaced';
                reasoning = 'This collection appears to be misplaced in this cluster.';
                recommendations.push('Strongly consider relocating this collection.');
                
                // Suggest alternative clusters
                const alternatives = await this.suggestClustersForCollection(collectionId, userId);
                recommendations.push(`Alternative clusters: ${alternatives.slice(0, 2).map(s => s.clusterName || 'New cluster').join(', ')}`);
            }

            return {
                fitScore,
                status,
                reasoning,
                recommendations,
                metrics: {
                    contentSimilarity,
                    semanticFit,
                    clusterSize: clusterCollections.length
                }
            };

        } catch (error) {
            console.error('Error analyzing cluster fit:', error);
            throw error;
        }
    }

    /**
     * Find collections that are related and should potentially be clustered together
     * @param {number} collectionId - Source collection
     * @param {number} userId - User ID
     * @param {number} threshold - Similarity threshold (0-1)
     * @returns {Promise<Array>} Related collections with similarity scores
     */
    async findRelatedCollections(collectionId, userId, threshold = 0.7) {
        try {
            const sourceCollection = await this.collectionRepo.findById(collectionId);
            if (!sourceCollection || sourceCollection.user_id !== userId) {
                throw new Error('Collection not found');
            }

            // Get all user's collections (excluding the source)
            const allCollections = await this.collectionRepo.findByUserId(userId);
            const otherCollections = allCollections.filter(c => c.id !== collectionId);

            if (otherCollections.length === 0) {
                return [];
            }

            // Analyze source collection topics
            const sourceTopics = await this.analyzeCollectionTopics(collectionId);

            const relatedCollections = [];

            for (const collection of otherCollections) {
                try {
                    const collectionTopics = await this.analyzeCollectionTopics(collection.id);
                    const similarity = await this.calculateTopicSimilarity(sourceTopics, collectionTopics);

                    if (similarity >= threshold) {
                        relatedCollections.push({
                            collection,
                            similarity,
                            reasoning: await this.generateRelationshipReasoning(sourceCollection, collection, similarity)
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to analyze collection ${collection.id}:`, error.message);
                }
            }

            // Sort by similarity
            relatedCollections.sort((a, b) => b.similarity - a.similarity);

            return relatedCollections;

        } catch (error) {
            console.error('Error finding related collections:', error);
            throw error;
        }
    }

    /**
     * Suggest creating a new cluster based on collection content analysis
     * @param {number} collectionId - Collection to analyze
     * @param {number} userId - User ID
     * @returns {Promise<object>} New cluster suggestion
     */
    async suggestNewCluster(collectionId, userId) {
        try {
            const collection = await this.collectionRepo.findById(collectionId);
            if (!collection || collection.user_id !== userId) {
                throw new Error('Collection not found');
            }

            // Find related collections that could form a cluster
            const relatedCollections = await this.findRelatedCollections(collectionId, userId, 0.6);

            if (relatedCollections.length === 0) {
                return {
                    suggestedName: await this.generateClusterNameFromCollection(collection),
                    description: `Specialized cluster for ${collection.name} and related content`,
                    collections: [collection],
                    reasoning: 'This collection covers a unique topic that would benefit from its own dedicated cluster.',
                    confidence: 0.8
                };
            }

            // Generate cluster name based on combined topics
            const allCollections = [collection, ...relatedCollections.map(r => r.collection)];
            const combinedTopics = await this.analyzeCombinedTopics(allCollections.map(c => c.id));
            
            const suggestedName = await this.generateClusterNameFromTopics(combinedTopics);

            return {
                suggestedName,
                description: `Cluster grouping ${allCollections.length} related collections covering ${combinedTopics.slice(0, 3).join(', ')}`,
                collections: allCollections,
                reasoning: `Found ${relatedCollections.length} related collection(s) that could form a thematic cluster.`,
                confidence: Math.min(0.95, 0.7 + (relatedCollections.length * 0.05))
            };

        } catch (error) {
            console.error('Error suggesting new cluster:', error);
            throw error;
        }
    }

    // Private helper methods

    async analyzeCollectionTopics(collectionId) {
        try {
            // Use content clustering service to analyze collection
            const analysis = await this.contentClustering.analyzeCollectionContent(collectionId, null, {
                maxClusters: 3,
                minClusterSize: 1
            });

            if (!analysis || !analysis.clusters) {
                return ['general content'];
            }

            // Extract topic keywords from cluster names
            const topics = analysis.clusters.map(cluster => {
                // Convert cluster names to topic keywords
                return cluster.name.toLowerCase()
                    .replace(/cluster|topic|content|documents?/g, '')
                    .trim()
                    .split(/\s+/)
                    .filter(word => word.length > 2);
            }).flat();

            return topics.length > 0 ? [...new Set(topics)] : ['general content'];

        } catch (error) {
            console.warn(`Failed to analyze topics for collection ${collectionId}:`, error.message);
            return ['unanalyzed content'];
        }
    }

    async analyzeClusterTopics(clusterId, userId) {
        try {
            const collections = await this.clusterRepo.getClusterCollections(clusterId, userId);
            const allTopics = [];

            for (const collection of collections) {
                const topics = await this.analyzeCollectionTopics(collection.id);
                allTopics.push(...topics);
            }

            // Get unique topics and their frequency
            const topicCounts = {};
            allTopics.forEach(topic => {
                topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            });

            // Return topics sorted by frequency
            return Object.entries(topicCounts)
                .sort(([,a], [,b]) => b - a)
                .map(([topic]) => topic);

        } catch (error) {
            console.warn(`Failed to analyze cluster topics for cluster ${clusterId}:`, error.message);
            return ['general content'];
        }
    }

    async calculateTopicSimilarity(topics1, topics2) {
        if (!topics1.length || !topics2.length) return 0;

        // Calculate Jaccard similarity
        const set1 = new Set(topics1);
        const set2 = new Set(topics2);
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    async calculateClusterCollectionSimilarity(cluster, collection, collectionTopics) {
        try {
            // Get cluster topics
            const clusterTopics = await this.analyzeClusterTopics(cluster.id, cluster.user_id);
            
            // Calculate topic similarity
            const topicSimilarity = await this.calculateTopicSimilarity(clusterTopics, collectionTopics);

            // Weight by cluster size (smaller clusters are more flexible)
            const clusterCollections = await this.clusterRepo.getClusterCollections(cluster.id, cluster.user_id);
            const sizeWeight = Math.max(0.5, 1 - (clusterCollections.length * 0.1));

            return topicSimilarity * sizeWeight;

        } catch (error) {
            console.warn(`Failed to calculate similarity for cluster ${cluster.id}:`, error.message);
            return 0;
        }
    }

    async calculateSemanticFit(collection, clusterCollections) {
        // Simplified semantic analysis
        // In production, this would use vector embeddings for deeper analysis
        try {
            if (clusterCollections.length <= 1) return 1.0;

            // For now, use name similarity as a proxy for semantic fit
            const collectionName = collection.name.toLowerCase();
            const clusterNames = clusterCollections.map(c => c.name.toLowerCase());

            let totalSimilarity = 0;
            for (const clusterName of clusterNames) {
                if (collectionName !== clusterName) {
                    // Simple word overlap calculation
                    const words1 = collectionName.split(/\s+/);
                    const words2 = clusterName.split(/\s+/);
                    
                    const commonWords = words1.filter(word => words2.includes(word));
                    const similarity = commonWords.length / Math.max(words1.length, words2.length);
                    totalSimilarity += similarity;
                }
            }

            return totalSimilarity / (clusterCollections.length - 1);

        } catch (error) {
            console.warn('Failed to calculate semantic fit:', error.message);
            return 0.5; // Neutral score
        }
    }

    async generateClusterNameFromCollection(collection) {
        try {
            // Use Gemini to generate a semantic cluster name
            const systemPrompt = `You are a knowledge organization expert. Generate a concise, descriptive cluster name (2-4 words) for organizing related collections.

Rules:
- Focus on the main topic or domain
- Use title case (e.g., "Machine Learning Research", "Project Documentation")
- Be specific but not too narrow
- Avoid generic words like "content", "documents", "cluster"
- Make it suitable for grouping multiple related collections`;

            const userPrompt = `Generate a cluster name for organizing collections like: "${collection.name}"
Description: ${collection.description || 'No description provided'}

Cluster name:`;

            const response = await this.gemini.generateResponse(systemPrompt, userPrompt);
            const clusterName = response.trim().replace(/^["']|["']$/g, '');

            // Validate and clean the response
            if (clusterName && clusterName.length <= 50 && clusterName.length >= 5) {
                return clusterName;
            }

            // Fallback to simple name generation
            return this.generateFallbackClusterName(collection);

        } catch (error) {
            console.warn('Failed to generate AI cluster name, using fallback:', error.message);
            return this.generateFallbackClusterName(collection);
        }
    }

    generateFallbackClusterName(collection) {
        // Extract meaningful words from collection name
        const words = collection.name
            .split(/\s+/)
            .filter(word => word.length > 2)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

        if (words.length === 0) return 'General Content';
        if (words.length === 1) return `${words[0]} Content`;
        
        return `${words[0]} ${words[1]} Cluster`;
    }

    async generateClusterNameFromTopics(topics) {
        try {
            if (topics.length === 0) return 'General Content';

            const systemPrompt = `Generate a concise cluster name (2-4 words) that captures the main theme of these topics. Use title case and be descriptive but not too specific.`;
            const userPrompt = `Topics: ${topics.slice(0, 5).join(', ')}\n\nCluster name:`;

            const response = await this.gemini.generateResponse(systemPrompt, userPrompt);
            const clusterName = response.trim().replace(/^["']|["']$/g, '');

            if (clusterName && clusterName.length <= 50) {
                return clusterName;
            }

            // Fallback
            return `${topics[0].charAt(0).toUpperCase() + topics[0].slice(1)} Research`;

        } catch (error) {
            return `${topics[0]?.charAt(0).toUpperCase() + topics[0]?.slice(1) || 'General'} Content`;
        }
    }

    async generateSuggestionReasoning(cluster, collection, similarity) {
        const confidenceLevel = similarity >= 0.9 ? 'very high' : 
                               similarity >= 0.8 ? 'high' : 
                               similarity >= 0.7 ? 'moderate' : 'low';

        return `This collection shows ${confidenceLevel} similarity (${(similarity * 100).toFixed(1)}%) to the "${cluster.name}" cluster theme.`;
    }

    async generateRelationshipReasoning(sourceCollection, targetCollection, similarity) {
        const strength = similarity >= 0.8 ? 'strong' : 
                        similarity >= 0.7 ? 'moderate' : 'weak';

        return `"${targetCollection.name}" shows ${strength} topical similarity (${(similarity * 100).toFixed(1)}%) to "${sourceCollection.name}".`;
    }

    async analyzeCombinedTopics(collectionIds) {
        const allTopics = [];
        
        for (const id of collectionIds) {
            const topics = await this.analyzeCollectionTopics(id);
            allTopics.push(...topics);
        }

        // Get unique topics
        return [...new Set(allTopics)];
    }

    async storeSuggestions(userId, collectionId, suggestions) {
        try {
            for (const suggestion of suggestions) {
                await this.db.query(
                    `INSERT INTO cluster_suggestions 
                     (user_id, collection_id, suggested_cluster_id, suggestion_type, confidence_score, reasoning) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        userId,
                        collectionId,
                        suggestion.clusterId || null,
                        suggestion.type,
                        suggestion.confidence,
                        suggestion.reasoning
                    ]
                );
            }
        } catch (error) {
            console.warn('Failed to store suggestions in database:', error.message);
            // Don't throw - this is not critical for the main functionality
        }
    }
}

module.exports = { ClusterIntelligenceService };
