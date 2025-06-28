const { GoogleGenerativeAI } = require('@google/generative-ai');
const qdrantClient = require('../config/qdrant');
const { DatabaseService } = require('./databaseService');
const { ClusterService } = require('./clusterService');
const { validateChunkForEmbedding } = require('../utils/textSplitter');

/**
 * Smart Context Creation Service
 * Intelligently fills context with relevant document chunks using semantic search and clustering
 */
class SmartContextService {
    constructor() {
        this.db = new DatabaseService();
        this.clusterService = new ClusterService();
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    }

    /**
     * Create smart context for a query within a collection
     * @param {number} userId - User ID
     * @param {number} collectionId - Collection ID
     * @param {string} query - User query for semantic search
     * @param {object} options - Context creation options
     * @returns {Promise<object>} Smart context result
     */
    async createSmartContext(userId, collectionId, query, options = {}) {
        const {
            maxContextSize = 8000,           // Maximum context size in characters
            maxChunks = 20,                  // Maximum number of chunks to include
            includeClusterMetadata = true,   // Include cluster names and descriptions
            diversityWeight = 0.3,           // Weight for diversity vs relevance (0-1)
            crossClusterThreshold = 0.7,     // Threshold for including cross-cluster content
            clusterContextWeight = 0.2       // Weight for cluster-aware scoring
        } = options;

        try {
            // 1. Validate collection access
            const collection = await this.validateCollectionAccess(userId, collectionId);
            
            // 2. Get cluster information for the collection
            const clusterInfo = await this.getCollectionClusterInfo(userId, collectionId);
            
            // 3. Perform semantic search
            const searchResults = await this.performSemanticSearch(
                collection.qdrant_collection_name, 
                query, 
                { limit: Math.min(maxChunks * 2, 50) } // Get more results for better selection
            );

            if (searchResults.length === 0) {
                return this.createEmptyContext(query, collection, clusterInfo);
            }

            // 4. Enhance chunks with cluster information
            const enhancedChunks = await this.enhanceChunksWithClusterInfo(searchResults, clusterInfo);

            // 5. Apply cluster-aware scoring
            const scoredChunks = this.applyClusterAwareScoring(
                enhancedChunks, 
                clusterInfo, 
                { diversityWeight, clusterContextWeight }
            );

            // 6. Select optimal chunks within size constraints
            const selectedChunks = this.selectOptimalChunks(
                scoredChunks, 
                { maxContextSize, maxChunks, diversityWeight }
            );

            // 7. Build final context
            const context = this.buildFinalContext(
                selectedChunks, 
                clusterInfo, 
                query, 
                { includeClusterMetadata }
            );

            return {
                success: true,
                context: context.text,
                metadata: {
                    query,
                    collectionId,
                    collectionName: collection.name,
                    clusterInfo: includeClusterMetadata ? clusterInfo : null,
                    chunks: selectedChunks.map(chunk => ({
                        id: chunk.id,
                        similarity: chunk.similarity,
                        clusterScore: chunk.clusterScore,
                        finalScore: chunk.finalScore,
                        clusterName: chunk.clusterName,
                        documentId: chunk.payload?.document_id,
                        filename: chunk.payload?.filename,
                        preview: chunk.payload?.text?.substring(0, 100) + '...'
                    })),
                    stats: {
                        totalChunks: selectedChunks.length,
                        contextSize: context.text.length,
                        maxContextSize,
                        clustersRepresented: [...new Set(selectedChunks.map(c => c.clusterName).filter(Boolean))],
                        diversityScore: this.calculateDiversityScore(selectedChunks),
                        averageRelevance: selectedChunks.reduce((sum, c) => sum + c.similarity, 0) / selectedChunks.length
                    }
                }
            };

        } catch (error) {
            console.error('Smart context creation error:', error);
            throw new Error(`Failed to create smart context: ${error.message}`);
        }
    }

    /**
     * Validate user access to collection
     */
    async validateCollectionAccess(userId, collectionId) {
        const result = await this.db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Collection not found or access denied');
        }

        return result.rows[0];
    }

    /**
     * Get cluster information for collection and related clusters
     */
    async getCollectionClusterInfo(userId, collectionId) {
        try {
            // Get collection's cluster info
            const collectionCluster = await this.db.query(
                `SELECT c.*, cl.name as cluster_name, cl.description as cluster_description
                 FROM collections c
                 LEFT JOIN clusters cl ON c.cluster_id = cl.id
                 WHERE c.id = $1 AND c.user_id = $2`,
                [collectionId, userId]
            );

            if (collectionCluster.rows.length === 0) {
                return { hasCluster: false, primaryCluster: null, relatedClusters: [] };
            }

            const collection = collectionCluster.rows[0];
            
            // If collection has a cluster, get related clusters
            let relatedClusters = [];
            if (collection.cluster_id) {
                // Get other collections in the same cluster
                const clusterMembers = await this.db.query(
                    `SELECT id, name, qdrant_collection_name 
                     FROM collections 
                     WHERE cluster_id = $1 AND user_id = $2 AND id != $3`,
                    [collection.cluster_id, userId, collectionId]
                );

                // Get clusters with high content similarity (using cluster intelligence)
                const similarClusters = await this.db.query(
                    `SELECT DISTINCT cl.id, cl.name, cl.description
                     FROM clusters cl
                     JOIN collections c ON cl.id = c.cluster_id
                     WHERE cl.user_id = $1 AND cl.id != $2
                     ORDER BY cl.name
                     LIMIT 5`,
                    [userId, collection.cluster_id]
                );

                relatedClusters = [...clusterMembers.rows, ...similarClusters.rows];
            }

            return {
                hasCluster: !!collection.cluster_id,
                primaryCluster: collection.cluster_id ? {
                    id: collection.cluster_id,
                    name: collection.cluster_name,
                    description: collection.cluster_description
                } : null,
                relatedClusters,
                collection: {
                    id: collection.id,
                    name: collection.name,
                    qdrantCollectionName: collection.qdrant_collection_name
                }
            };

        } catch (error) {
            console.error('Error getting cluster info:', error);
            return { hasCluster: false, primaryCluster: null, relatedClusters: [] };
        }
    }

    /**
     * Perform semantic search using existing embedding generation
     */
    async performSemanticSearch(qdrantCollectionName, query, options = {}) {
        try {
            const { limit = 20 } = options;

            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search in Qdrant
            const searchResult = await qdrantClient.search(qdrantCollectionName, {
                vector: queryEmbedding,
                limit,
                with_payload: true,
                score_threshold: 0.3
            });

            return searchResult.map(result => ({
                id: result.id,
                similarity: result.score,
                payload: result.payload,
                clusterScore: 0, // Will be calculated later
                finalScore: result.score
            }));

        } catch (error) {
            console.error('Semantic search error:', error);
            return [];
        }
    }

    /**
     * Generate embeddings using the same method as upload routes
     */
    async generateEmbedding(text) {
        try {
            const validatedText = validateChunkForEmbedding(text);
            
            if (!validatedText || validatedText.length === 0) {
                throw new Error('Invalid text for embedding');
            }

            const model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
            const result = await model.embedContent(validatedText);
            return result.embedding.values;
        } catch (error) {
            console.error('Error generating embedding:', error);
            return new Array(768).fill(0);
        }
    }

    /**
     * Enhance chunks with cluster information
     */
    async enhanceChunksWithClusterInfo(chunks, clusterInfo) {
        return chunks.map(chunk => ({
            ...chunk,
            clusterName: clusterInfo.primaryCluster?.name,
            clusterId: clusterInfo.primaryCluster?.id,
            isFromPrimaryCluster: true // Since we're searching within the collection
        }));
    }

    /**
     * Apply cluster-aware scoring to chunks
     */
    applyClusterAwareScoring(chunks, clusterInfo, options = {}) {
        const { diversityWeight = 0.3, clusterContextWeight = 0.2 } = options;

        return chunks.map(chunk => {
            let clusterScore = 0;

            // Boost score if chunk is from primary cluster
            if (chunk.isFromPrimaryCluster && clusterInfo.hasCluster) {
                clusterScore += 0.3;
            }

            // Calculate final score combining similarity and cluster relevance
            const finalScore = (
                chunk.similarity * (1 - clusterContextWeight) +
                clusterScore * clusterContextWeight
            );

            return {
                ...chunk,
                clusterScore,
                finalScore
            };
        });
    }

    /**
     * Select optimal chunks within constraints using smart selection algorithm
     */
    selectOptimalChunks(chunks, options = {}) {
        const { maxContextSize = 8000, maxChunks = 20, diversityWeight = 0.3 } = options;

        // Sort by final score descending
        const sortedChunks = chunks.sort((a, b) => b.finalScore - a.finalScore);

        const selectedChunks = [];
        let currentSize = 0;
        const seenDocuments = new Set();

        for (const chunk of sortedChunks) {
            if (selectedChunks.length >= maxChunks) break;

            const chunkText = chunk.payload?.text || '';
            const chunkSize = chunkText.length;

            // Check size constraint
            if (currentSize + chunkSize > maxContextSize) {
                // Try to find smaller chunks if we still have space
                if (currentSize < maxContextSize * 0.8) continue;
                break;
            }

            // Diversity check - avoid too many chunks from same document
            const docId = chunk.payload?.document_id;
            if (docId && seenDocuments.has(docId)) {
                const docChunkCount = selectedChunks.filter(c => c.payload?.document_id === docId).length;
                if (docChunkCount >= 3) continue; // Max 3 chunks per document
            }

            selectedChunks.push(chunk);
            currentSize += chunkSize;
            if (docId) seenDocuments.add(docId);
        }

        return selectedChunks;
    }

    /**
     * Build final context with cluster metadata
     */
    buildFinalContext(chunks, clusterInfo, query, options = {}) {
        const { includeClusterMetadata = true } = options;

        let contextText = '';

        // Add cluster context if available and requested
        if (includeClusterMetadata && clusterInfo.hasCluster) {
            contextText += `## Context from Cluster: ${clusterInfo.primaryCluster.name}\n`;
            if (clusterInfo.primaryCluster.description) {
                contextText += `Cluster Description: ${clusterInfo.primaryCluster.description}\n`;
            }
            contextText += `\n`;
        }

        // Add query context
        contextText += `## Query: ${query}\n\n`;

        // Add relevant chunks
        contextText += `## Relevant Content:\n\n`;
        
        chunks.forEach((chunk, index) => {
            const text = chunk.payload?.text || '';
            const filename = chunk.payload?.filename || 'Unknown';
            const similarity = (chunk.similarity * 100).toFixed(1);
            
            contextText += `### Document ${index + 1}: ${filename} (Relevance: ${similarity}%)\n`;
            if (chunk.clusterName) {
                contextText += `**Cluster:** ${chunk.clusterName}\n`;
            }
            contextText += `${text}\n\n`;
        });

        return { text: contextText, size: contextText.length };
    }

    /**
     * Create empty context when no results found
     */
    createEmptyContext(query, collection, clusterInfo) {
        return {
            success: true,
            context: `## Query: ${query}\n\nNo relevant content found in collection "${collection.name}".`,
            metadata: {
                query,
                collectionId: collection.id,
                collectionName: collection.name,
                clusterInfo: clusterInfo.hasCluster ? clusterInfo : null,
                chunks: [],
                stats: {
                    totalChunks: 0,
                    contextSize: 0,
                    clustersRepresented: [],
                    diversityScore: 0,
                    averageRelevance: 0
                }
            }
        };
    }

    /**
     * Calculate diversity score based on cluster and document distribution
     */
    calculateDiversityScore(chunks) {
        if (chunks.length === 0) return 0;

        const uniqueDocuments = new Set(chunks.map(c => c.payload?.document_id).filter(Boolean));
        const uniqueClusters = new Set(chunks.map(c => c.clusterName).filter(Boolean));

        const documentDiversity = uniqueDocuments.size / chunks.length;
        const clusterDiversity = uniqueClusters.size > 0 ? uniqueClusters.size / chunks.length : 0;

        return (documentDiversity + clusterDiversity) / 2;
    }
}

module.exports = { SmartContextService };
