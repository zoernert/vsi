const { DatabaseService } = require('./databaseService');
const qdrant = require('../config/qdrant');
const { GeminiService } = require('./geminiService');

class ContentClusteringService {
    constructor() {
        this.db = new DatabaseService();
        this.qdrant = qdrant;
        this.gemini = new GeminiService();
    }

    /**
     * Analyze collection content and create semantic clusters
     */
    async analyzeCollectionContent(collectionId, userId, options = {}) {
        const {
            maxClusters = 5,
            minClusterSize = 3,
            similarityThreshold = 0.75
        } = options;

        try {
            // Get collection details
            const collection = await this.getCollectionDetails(collectionId, userId);
            if (!collection) {
                throw new Error('Collection not found');
            }

            // Get all document vectors from Qdrant
            const vectors = await this.getCollectionVectors(collection.qdrant_collection_name);
            
            console.log(`Retrieved ${vectors.length} vectors for collection ${collectionId}`);
            
            if (vectors.length === 0) {
                console.log(`Collection ${collectionId} has no documents with vectors`);
                return null;
            }
            
            if (vectors.length < minClusterSize) {
                console.log(`Collection ${collectionId} has insufficient documents (${vectors.length}) for clustering (minimum: ${minClusterSize})`);
                return null;
            }

            // Validate vector dimensions consistency
            const firstVectorDim = vectors[0].vector.length;
            const invalidVectors = vectors.filter(v => v.vector.length !== firstVectorDim);
            if (invalidVectors.length > 0) {
                console.warn(`Found ${invalidVectors.length} vectors with inconsistent dimensions. Expected: ${firstVectorDim}`);
                // Filter out invalid vectors
                const validVectors = vectors.filter(v => v.vector.length === firstVectorDim);
                if (validVectors.length < minClusterSize) {
                    console.log(`After filtering invalid vectors, insufficient valid vectors (${validVectors.length}) for clustering`);
                    return null;
                }
                // Use only valid vectors for clustering
                console.log(`Using ${validVectors.length} valid vectors for clustering`);
                const clusters = await this.performVectorClustering(validVectors, maxClusters, minClusterSize);
                const namedClusters = await this.generateClusterNames(clusters, collection);
                
                return {
                    collectionId,
                    totalDocuments: validVectors.length,
                    clusters: namedClusters,
                    analysisMetadata: {
                        clusteringMethod: 'kmeans',
                        maxClusters,
                        minClusterSize,
                        similarityThreshold,
                        analyzedAt: new Date().toISOString(),
                        invalidVectorsFiltered: invalidVectors.length
                    }
                };
            }

            // Perform k-means clustering on vectors
            const clusters = await this.performVectorClustering(vectors, maxClusters, minClusterSize);
            
            // Generate semantic names for each cluster
            const namedClusters = await this.generateClusterNames(clusters, collection);

            return {
                collectionId,
                totalDocuments: vectors.length,
                clusters: namedClusters,
                analysisMetadata: {
                    clusteringMethod: 'kmeans',
                    maxClusters,
                    minClusterSize,
                    similarityThreshold,
                    analyzedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('Content clustering analysis failed:', error);
            throw error;
        }
    }

    async getCollectionDetails(collectionId, userId) {
        const result = await this.db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, userId]
        );
        return result.rows[0];
    }

    async getCollectionVectors(qdrantCollectionName) {
        try {
            // Get all points from Qdrant collection
            const scrollResult = await this.qdrant.scroll(qdrantCollectionName, {
                limit: 1000,
                with_vector: true,
                with_payload: true
            });

            if (!scrollResult || !scrollResult.points) {
                console.warn(`No points returned from Qdrant collection: ${qdrantCollectionName}`);
                return [];
            }

            // Filter and validate vectors
            const validVectors = [];
            const invalidVectors = [];
            
            for (const point of scrollResult.points) {
                if (!point || !point.vector || !Array.isArray(point.vector) || point.vector.length === 0) {
                    console.log(`Invalid vector data for point ${point?.id}:`, {
                        hasPoint: !!point,
                        hasVector: !!point?.vector,
                        vectorType: typeof point?.vector,
                        isArray: Array.isArray(point?.vector),
                        vectorLength: point?.vector?.length,
                        vectorSample: point?.vector ? point.vector.slice(0, 3) : null
                    });
                    invalidVectors.push(point);
                } else {
                    validVectors.push({
                        id: point.id,
                        vector: point.vector,
                        payload: point.payload || {}
                    });
                }
            }

            console.log(`Retrieved ${validVectors.length} valid vectors from ${scrollResult.points.length} total points`);
            return validVectors;
        } catch (error) {
            console.error('Failed to get collection vectors:', error);
            return [];
        }
    }

    async performVectorClustering(vectors, maxClusters, minClusterSize) {
        // Simple k-means implementation for vector clustering
        const numClusters = Math.min(maxClusters, Math.floor(vectors.length / minClusterSize));
        
        if (numClusters < 2) {
            return [{
                id: 0,
                centroid: this.calculateCentroid(vectors.map(v => v.vector)),
                points: vectors,
                size: vectors.length
            }];
        }

        // Initialize centroids randomly
        let centroids = this.initializeRandomCentroids(vectors, numClusters);
        let clusters = [];
        let maxIterations = 50;
        let iteration = 0;

        while (iteration < maxIterations) {
            // Assign points to nearest centroid
            clusters = this.assignPointsToClusters(vectors, centroids);
            
            // Calculate new centroids
            const newCentroids = clusters.map(cluster => 
                this.calculateCentroid(cluster.points.map(p => p.vector))
            );

            // Check for convergence
            if (this.centroidsConverged(centroids, newCentroids)) {
                break;
            }

            centroids = newCentroids;
            iteration++;
        }

        // Filter out clusters that are too small
        return clusters.filter(cluster => cluster.points.length >= minClusterSize);
    }

    initializeRandomCentroids(vectors, numClusters) {
        const centroids = [];
        
        // Validate input vectors
        if (!vectors || vectors.length === 0) {
            throw new Error('No vectors provided for centroid initialization');
        }
        
        // Check if first vector exists and has valid vector data
        if (!vectors[0] || !vectors[0].vector || !Array.isArray(vectors[0].vector) || vectors[0].vector.length === 0) {
            throw new Error('Invalid vector format: vectors must have non-empty vector arrays');
        }
        
        const vectorDimension = vectors[0].vector.length;
        
        for (let i = 0; i < numClusters; i++) {
            // Use k-means++ initialization for better results
            if (i === 0) {
                // First centroid is random
                centroids.push(vectors[Math.floor(Math.random() * vectors.length)].vector);
            } else {
                // Subsequent centroids are chosen with probability proportional to distance from nearest existing centroid
                const distances = vectors.map(vector => {
                    const minDist = Math.min(...centroids.map(centroid => 
                        this.euclideanDistance(vector.vector, centroid)
                    ));
                    return minDist * minDist;
                });
                
                const totalDistance = distances.reduce((sum, dist) => sum + dist, 0);
                const random = Math.random() * totalDistance;
                
                let cumulativeDistance = 0;
                for (let j = 0; j < vectors.length; j++) {
                    cumulativeDistance += distances[j];
                    if (cumulativeDistance >= random) {
                        centroids.push(vectors[j].vector);
                        break;
                    }
                }
            }
        }
        
        return centroids;
    }

    assignPointsToClusters(vectors, centroids) {
        const clusters = centroids.map((centroid, index) => ({
            id: index,
            centroid: centroid,
            points: [],
            size: 0
        }));

        vectors.forEach(vector => {
            let minDistance = Infinity;
            let nearestCluster = 0;

            centroids.forEach((centroid, index) => {
                const distance = this.euclideanDistance(vector.vector, centroid);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestCluster = index;
                }
            });

            clusters[nearestCluster].points.push(vector);
        });

        clusters.forEach(cluster => {
            cluster.size = cluster.points.length;
        });

        return clusters;
    }

    calculateCentroid(vectors) {
        if (vectors.length === 0) return [];
        
        const dimension = vectors[0].length;
        const centroid = new Array(dimension).fill(0);
        
        vectors.forEach(vector => {
            vector.forEach((value, index) => {
                centroid[index] += value;
            });
        });
        
        return centroid.map(value => value / vectors.length);
    }

    euclideanDistance(vector1, vector2) {
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            sum += Math.pow(vector1[i] - vector2[i], 2);
        }
        return Math.sqrt(sum);
    }

    centroidsConverged(oldCentroids, newCentroids, threshold = 0.001) {
        for (let i = 0; i < oldCentroids.length; i++) {
            const distance = this.euclideanDistance(oldCentroids[i], newCentroids[i]);
            if (distance > threshold) {
                return false;
            }
        }
        return true;
    }

    async generateClusterNames(clusters, collection) {
        const namedClusters = [];

        for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            
            // Extract text content from cluster points for topic analysis
            const clusterTexts = await this.extractClusterTexts(cluster.points);
            
            // Generate semantic name based on content
            const clusterName = await this.generateSemanticName(clusterTexts, i);
            
            // Calculate cluster statistics
            const stats = this.calculateClusterStats(cluster);

            namedClusters.push({
                id: i,
                name: clusterName,
                description: `A cluster of ${cluster.size} document${cluster.size === 1 ? '' : 's'} focused on ${clusterName.toLowerCase()} content`,
                size: cluster.size,
                documents: cluster.points.map(point => ({
                    id: point.id,
                    content_preview: point.payload.content ? point.payload.content.substring(0, 200) + '...' : '',
                    filename: point.payload.filename || `Document ${point.id}`
                })),
                stats,
                centroid: cluster.centroid
            });
        }

        return namedClusters;
    }

    async extractClusterTexts(points) {
        return points.map(point => {
            // Extract text content from various possible payload fields
            const text = point.payload.text || point.payload.chunk_text || point.payload.content || '';
            const filename = point.payload.filename || `Document ${point.id}`;
            
            console.log(`Extracting text for document ${filename}:`, {
                hasText: !!point.payload.text,
                hasChunkText: !!point.payload.chunk_text,
                hasContent: !!point.payload.content,
                textLength: text.length,
                textPreview: text.substring(0, 100)
            });
            
            return {
                id: point.id,
                content: text,
                filename: filename,
                chunk_text: text
            };
        });
    }

    async generateSemanticName(clusterTexts, clusterIndex) {
        // Extract all text content from cluster
        const allText = clusterTexts.map(text => text.chunk_text || text.content).join('\n\n');
        
        console.log(`Generating semantic name for cluster ${clusterIndex}:`, {
            documentsCount: clusterTexts.length,
            totalTextLength: allText.length,
            textPreview: allText.substring(0, 200) + '...'
        });
        
        if (!allText.trim()) {
            console.log(`No text content available for cluster ${clusterIndex}, using fallback name`);
            return `Topic Cluster ${clusterIndex + 1}`;
        }

        // Use Gemini to generate intelligent cluster names
        try {
            console.log(`Calling Gemini API for cluster ${clusterIndex} with ${allText.length} characters of text`);
            
            const systemPrompt = `You are an expert at analyzing document content and creating concise, descriptive topic names. 
Your task is to analyze the provided text content and suggest a short, clear topic name (2-4 words) that best represents the main theme or subject matter.

Rules:
- Respond with ONLY the topic name, no explanations
- Use 2-4 words maximum
- Make it descriptive and specific
- Avoid generic words like "content", "documents", "topics"
- Focus on the main subject matter or domain
- Use title case (e.g., "Machine Learning Algorithms", "Financial Planning")`;

            const userPrompt = `Analyze this content and suggest a concise topic name:\n\n${allText.substring(0, 3000)}`;

            const clusterName = await this.gemini.generateResponse(systemPrompt, userPrompt);
            
            // Clean up the response (remove quotes, trim, etc.)
            const cleanName = clusterName.trim().replace(/^["']|["']$/g, '');
            
            console.log(`Gemini generated cluster name: "${cleanName}" for cluster ${clusterIndex}`);
            
            if (cleanName && cleanName.length > 0 && cleanName.length < 50) {
                console.log(`Using AI-generated cluster name: "${cleanName}" for cluster ${clusterIndex}`);
                return cleanName;
            } else {
                console.log(`AI-generated name "${cleanName}" rejected, using fallback for cluster ${clusterIndex}`);
            }
        } catch (error) {
            console.warn(`Failed to generate AI cluster name for cluster ${clusterIndex}:`, error.message);
        }

        // Fallback to keyword-based naming if AI fails
        console.log(`Using keyword fallback for cluster ${clusterIndex}`);
        const topicKeywords = this.extractTopicKeywords(allText);
        
        if (topicKeywords.length > 0) {
            const fallbackName = this.createSemanticClusterName(topicKeywords);
            console.log(`Generated fallback name: "${fallbackName}" for cluster ${clusterIndex}`);
            return fallbackName;
        }
        
        return `Content Cluster ${clusterIndex + 1}`;
    }

    extractTopicKeywords(text) {
        // Simple keyword extraction - can be enhanced with NLP libraries
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !this.isStopWord(word));

        // Count word frequencies
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        // Get top keywords
        return Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([word]) => word);
    }

    isStopWord(word) {
        const stopWords = new Set([
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'been', 'be',
            'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
            'can', 'must', 'shall', 'from', 'into', 'through', 'during', 'before',
            'after', 'above', 'below', 'between', 'among', 'about', 'around', 'under'
        ]);
        return stopWords.has(word);
    }

    createSemanticClusterName(keywords) {
        // Create meaningful cluster names from keywords
        const primaryKeyword = keywords[0];
        const secondaryKeyword = keywords[1];

        // Topic-based naming patterns
        const patterns = [
            `${this.capitalize(primaryKeyword)} Content`,
            `${this.capitalize(primaryKeyword)} & ${this.capitalize(secondaryKeyword)}`,
            `${this.capitalize(primaryKeyword)} Topics`,
            `${this.capitalize(primaryKeyword)} Documents`,
            `${this.capitalize(primaryKeyword)} Materials`
        ];

        return patterns[Math.floor(Math.random() * patterns.length)];
    }

    capitalize(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    calculateClusterStats(cluster) {
        return {
            size: cluster.size,
            cohesion: this.calculateClusterCohesion(cluster),
            avgDistanceFromCentroid: this.calculateAvgDistanceFromCentroid(cluster)
        };
    }

    calculateClusterCohesion(cluster) {
        if (cluster.points.length < 2) return 1.0;

        let totalDistance = 0;
        let comparisons = 0;

        for (let i = 0; i < cluster.points.length; i++) {
            for (let j = i + 1; j < cluster.points.length; j++) {
                totalDistance += this.euclideanDistance(
                    cluster.points[i].vector,
                    cluster.points[j].vector
                );
                comparisons++;
            }
        }

        // Return inverse of average distance (higher cohesion = lower distance)
        return comparisons > 0 ? 1 / (totalDistance / comparisons + 1) : 1.0;
    }

    calculateAvgDistanceFromCentroid(cluster) {
        if (cluster.points.length === 0) return 0;

        const totalDistance = cluster.points.reduce((sum, point) => 
            sum + this.euclideanDistance(point.vector, cluster.centroid), 0
        );

        return totalDistance / cluster.points.length;
    }
}

module.exports = { ContentClusteringService };
