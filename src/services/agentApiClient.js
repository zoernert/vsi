const axios = require('axios');

/**
 * API Client for agents to interact with VSI system
 * Provides authenticated access to VSI endpoints for agent operations
 */
class AgentApiClient {
    constructor(sessionId, baseUrl = null, userToken = null) {
        this.sessionId = sessionId;
        this.baseUrl = baseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
        this.userToken = userToken;
        
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': `VSI-Agent-System/${sessionId}`
        };
        
        // Include Authorization header if token is provided
        if (this.userToken) {
            headers['Authorization'] = `Bearer ${this.userToken}`;
        }
        
        this.axios = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers
        });

        // Add request interceptor for logging
        this.axios.interceptors.request.use(
            (config) => {
                console.log(`🔗 Agent API Request: ${config.method?.toUpperCase()} ${config.url}`);
                if (config.headers?.Authorization) {
                    console.log(`🔐 Request includes Authorization header`);
                } else {
                    console.log(`⚠️ Request missing Authorization header`);
                }
                return config;
            },
            (error) => {
                console.error('❌ Agent API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling
        this.axios.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                console.error(`❌ Agent API Response Error: ${error.response?.status} ${error.response?.statusText}`);
                if (error.response?.data) {
                    console.error(`❌ Response data:`, error.response.data);
                }
                return Promise.reject(error);
            }
        );
    }

    // Collection Management
    async getCollections() {
        try {
            const response = await this.axios.get('/api/collections');
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get collections: ${error.message}`);
        }
    }

    async getCollection(collectionId) {
        try {
            const response = await this.axios.get(`/api/collections/${collectionId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get collection ${collectionId}: ${error.message}`);
        }
    }

    async searchCollections(query, options = {}) {
        try {
            const params = {
                q: query,
                limit: options.limit || 50,
                offset: options.offset || 0,
                ...options
            };
            
            const response = await this.axios.get('/api/search/collections', { params });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to search collections: ${error.message}`);
        }
    }

    // Document Operations
    async getDocuments(collectionId, options = {}) {
        try {
            const params = {
                limit: options.limit || 50,
                offset: options.offset || 0,
                ...options
            };
            
            const response = await this.axios.get(`/api/collections/${collectionId}/documents`, { params });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get documents: ${error.message}`);
        }
    }

    async searchDocuments(collectionId, query, options = {}) {
        try {
            const searchData = {
                query,
                collection_id: collectionId,
                limit: options.limit || 50,
                threshold: options.threshold || 0.7,
                ...options
            };
            
            const response = await this.axios.post('/api/search', searchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to search documents: ${error.message}`);
        }
    }

    // Smart Context Operations
    async generateSmartContext(collectionId, query, options = {}) {
        try {
            const contextData = {
                query,
                collection_id: collectionId,
                max_context_size: options.maxContextSize || 4000,
                include_metadata: options.includeMetadata !== false,
                ...options
            };
            
            const response = await this.axios.post('/api/smart-context', contextData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to generate smart context: ${error.message}`);
        }
    }

    async askQuestion(collectionId, question, options = {}) {
        try {
            const questionData = {
                question,
                collection_id: collectionId,
                use_smart_context: options.useSmartContext !== false,
                context_size: options.contextSize || 4000,
                ...options
            };
            
            const response = await this.axios.post('/api/ask', questionData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to ask question: ${error.message}`);
        }
    }

    // Clustering Operations
    async getClusters(collectionId = null) {
        try {
            const params = collectionId ? { collection_id: collectionId } : {};
            const response = await this.axios.get('/api/clusters', { params });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get clusters: ${error.message}`);
        }
    }

    async getCluster(clusterId) {
        try {
            const response = await this.axios.get(`/api/clusters/${clusterId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get cluster ${clusterId}: ${error.message}`);
        }
    }

    async analyzeCluster(clusterId, options = {}) {
        try {
            const analysisData = {
                cluster_id: clusterId,
                include_documents: options.includeDocuments !== false,
                analysis_depth: options.depth || 'medium',
                ...options
            };
            
            const response = await this.axios.post(`/api/clusters/${clusterId}/analyze`, analysisData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to analyze cluster ${clusterId}: ${error.message}`);
        }
    }

    async getClusterDocuments(clusterId, options = {}) {
        try {
            const params = {
                limit: options.limit || 100,
                offset: options.offset || 0,
                include_content: options.includeContent || false,
                ...options
            };
            
            const response = await this.axios.get(`/api/clusters/${clusterId}/documents`, { params });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get cluster documents: ${error.message}`);
        }
    }

    // Advanced Search Operations
    async semanticSearch(query, options = {}) {
        try {
            const searchData = {
                query,
                collections: options.collections || [],
                limit: options.limit || 50,
                threshold: options.threshold || 0.7,
                use_clustering: options.useClustering || false,
                ...options
            };
            
            const response = await this.axios.post('/api/search/semantic', searchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to perform semantic search: ${error.message}`);
        }
    }

    async multiCollectionSearch(query, collectionIds, options = {}) {
        try {
            const searchData = {
                query,
                collection_ids: collectionIds,
                limit: options.limit || 50,
                threshold: options.threshold || 0.7,
                aggregate_results: options.aggregateResults !== false,
                ...options
            };
            
            const response = await this.axios.post('/api/search/multi-collection', searchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to perform multi-collection search: ${error.message}`);
        }
    }

    // Content Analysis Operations
    async analyzeContent(content, analysisType = 'comprehensive') {
        try {
            const analysisData = {
                content,
                analysis_type: analysisType,
                session_id: this.sessionId
            };
            
            const response = await this.axios.post('/api/analyze/content', analysisData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to analyze content: ${error.message}`);
        }
    }

    async extractKeywords(content, options = {}) {
        try {
            const extractionData = {
                content,
                max_keywords: options.maxKeywords || 20,
                min_frequency: options.minFrequency || 2,
                include_phrases: options.includePhrases !== false,
                ...options
            };
            
            const response = await this.axios.post('/api/analyze/keywords', extractionData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to extract keywords: ${error.message}`);
        }
    }

    async summarizeContent(content, options = {}) {
        try {
            const summaryData = {
                content,
                summary_length: options.length || 'medium',
                focus_areas: options.focusAreas || [],
                ...options
            };
            
            const response = await this.axios.post('/api/analyze/summarize', summaryData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to summarize content: ${error.message}`);
        }
    }

    // Utility Methods
    async getSystemStatus() {
        try {
            const response = await this.axios.get('/api/health');
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get system status: ${error.message}`);
        }
    }

    async validateCollection(collectionId) {
        try {
            const response = await this.axios.get(`/api/collections/${collectionId}/validate`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to validate collection: ${error.message}`);
        }
    }

    // Batch Operations
    async batchSearch(queries, options = {}) {
        try {
            const batchData = {
                queries,
                batch_size: options.batchSize || 10,
                collection_ids: options.collectionIds || [],
                ...options
            };
            
            const response = await this.axios.post('/api/search/batch', batchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to perform batch search: ${error.message}`);
        }
    }

    async batchAnalyze(contents, analysisType = 'comprehensive') {
        try {
            const batchData = {
                contents,
                analysis_type: analysisType,
                session_id: this.sessionId
            };
            
            const response = await this.axios.post('/api/analyze/batch', batchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to perform batch analysis: ${error.message}`);
        }
    }

    // Research-specific Operations
    async findRelatedSources(sourceIds, options = {}) {
        try {
            const searchData = {
                source_ids: sourceIds,
                similarity_threshold: options.threshold || 0.8,
                max_results: options.maxResults || 20,
                ...options
            };
            
            const response = await this.axios.post('/api/research/related-sources', searchData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to find related sources: ${error.message}`);
        }
    }

    async getTopicOverview(topic, options = {}) {
        try {
            const overviewData = {
                topic,
                collection_ids: options.collectionIds || [],
                depth: options.depth || 'medium',
                include_trends: options.includeTrends !== false,
                ...options
            };
            
            const response = await this.axios.post('/api/research/topic-overview', overviewData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get topic overview: ${error.message}`);
        }
    }

    async identifyGaps(researchArea, options = {}) {
        try {
            const gapData = {
                research_area: researchArea,
                collection_ids: options.collectionIds || [],
                confidence_threshold: options.confidenceThreshold || 0.7,
                ...options
            };
            
            const response = await this.axios.post('/api/research/identify-gaps', gapData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to identify research gaps: ${error.message}`);
        }
    }

    // Quality Assessment
    async assessSourceQuality(sourceId, criteria = []) {
        try {
            const assessmentData = {
                source_id: sourceId,
                criteria: criteria.length > 0 ? criteria : ['relevance', 'credibility', 'recency'],
                session_id: this.sessionId
            };
            
            const response = await this.axios.post('/api/quality/assess-source', assessmentData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to assess source quality: ${error.message}`);
        }
    }

    async rankSources(sourceIds, criteria = {}) {
        try {
            const rankingData = {
                source_ids: sourceIds,
                criteria: {
                    relevance_weight: criteria.relevanceWeight || 0.4,
                    quality_weight: criteria.qualityWeight || 0.3,
                    recency_weight: criteria.recencyWeight || 0.3,
                    ...criteria
                },
                session_id: this.sessionId
            };
            
            const response = await this.axios.post('/api/quality/rank-sources', rankingData);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to rank sources: ${error.message}`);
        }
    }

    // Error Recovery
    async retryRequest(requestFn, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Request attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    console.log(`🔄 Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                }
            }
        }
        
        throw new Error(`Request failed after ${maxRetries} attempts: ${lastError.message}`);
    }
}

module.exports = { AgentApiClient };
