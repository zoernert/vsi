const express = require('express');
const { LlmQaService } = require('../services/llm-qa.service');
const qdrantClient = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createUsageMiddleware } = require('../middleware/usageTracking');
const { validateChunkForEmbedding } = require('../utils/textSplitter');

const router = express.Router();

console.log('LLM Q&A controller loaded');

// Apply authentication to the route
router.use(authenticateToken);

// Helper function to get user-specific collection name
async function getUserCollectionName(userId, collectionName) {
    // Import database service
    const { DatabaseService } = require('../services/databaseService');
    const db = new DatabaseService();
    if (!db.pool) await db.initialize();
    
    // If collectionName is numeric, get the Qdrant collection name from database
    if (!isNaN(collectionName)) {
        const result = await db.pool.query(
            'SELECT qdrant_collection_name FROM collections WHERE id = $1 AND user_id = $2',
            [parseInt(collectionName), userId]
        );
        if (result.rows.length > 0) {
            return result.rows[0].qdrant_collection_name;
        }
    }
    
    // Fallback to old naming scheme
    return `user_${userId}_${collectionName}`;
}

// Helper function to generate embeddings (same as in uploadRoutes)
async function generateEmbedding(text) {
    try {
        // Validate and truncate text size before sending to API
        const validatedText = validateChunkForEmbedding(text);
        
        if (!validatedText || validatedText.length === 0) {
            console.error('Text became empty after validation');
            return new Array(768).fill(0);
        }
        
        const textByteSize = Buffer.byteLength(validatedText, 'utf8');
        console.log(`Generating embedding for text: ${validatedText.length} chars, ${textByteSize} bytes`);
        
        if (!process.env.GOOGLE_AI_API_KEY) {
            console.error('Google AI API key not configured');
            return new Array(768).fill(0);
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(validatedText);
        return result.embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        console.error(`Original text size: ${text.length} chars, ${Buffer.byteLength(text, 'utf8')} bytes`);
        // Return a zero vector as fallback
        return new Array(768).fill(0);
    }
}

// POST /:collection/ask (mounted at /api/collections, so full path is /api/collections/:collection/ask)
router.post('/:collection/ask', 
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        console.log(`LLM Q&A request for collection: ${req.params.collection}`, req.body);
        
        try {
            const { collection } = req.params;
            const { question, systemPrompt, userPrompt, maxResults } = req.body;

            if (!question || !collection) {
                return res.status(400).json({
                    error: 'Question and collection are required'
                });
            }

            // Get user-specific collection name
            const userId = req.user.id;
            const actualCollectionName = await getUserCollectionName(userId, collection);

            // Ensure collection exists before searching
            try {
                await qdrantClient.getCollection(actualCollectionName);
            } catch (error) {
                if (error.status === 404 || error.message.includes('Not found') || error.message.includes("doesn't exist")) {
                    console.warn(`Collection ${actualCollectionName} doesn't exist, creating empty collection for search`);
                    await qdrantClient.ensureCollection(actualCollectionName);
                } else {
                    throw error;
                }
            }

            // Create vector service that uses real Qdrant search functionality
            const vectorService = {
                search: async (collectionName, query, limit) => {
                    try {
                        console.log(`🔍 Searching in collection: ${actualCollectionName} for query: "${query}"`);
                        
                        // Generate embedding for the query
                        const queryEmbedding = await generateEmbedding(query);
                        
                        // Search in Qdrant with user-specific collection
                        const searchResult = await qdrantClient.search(actualCollectionName, {
                            vector: queryEmbedding,
                            limit: limit,
                            with_payload: true,
                            with_vector: false,
                            score_threshold: 0.1 // Lower threshold for better recall
                        });

                        console.log(`🔍 Found ${searchResult.length} results from Qdrant`);
                        
                        // Transform Qdrant results to include proper metadata for snippet preview
                        return searchResult.map(result => {
                            const payload = result.payload || {};
                            
                            // Extract content with fallbacks
                            let content = payload.text || 
                                         payload.content || 
                                         payload.chunkContent ||
                                         payload.chunk ||
                                         `Document: ${payload.filename || 'Unknown'}`;
                            
                            // Add file context if available
                            if (payload.filename) {
                                const fileInfo = `📄 File: ${payload.filename}`;
                                const chunkInfo = payload.chunk_index !== undefined ? 
                                    ` (Chunk ${payload.chunk_index + 1}/${payload.chunk_total || 1})` : '';
                                content = `${fileInfo}${chunkInfo}\n\nContent:\n${content}`;
                            }
                            
                            console.log(`🔍 Result ${result.id}: ${content.length} characters from ${payload.filename || 'Unknown'}`);
                            
                            return {
                                metadata: {
                                    content: content,
                                    filename: payload.filename || payload.originalName || 'Unknown Document',
                                    chunkId: result.id, // Important: include the chunk ID
                                    fileType: payload.file_type || payload.fileType,
                                    chunkIndex: payload.chunk_index,
                                    chunkTotal: payload.chunk_total
                                },
                                score: result.score,
                                id: result.id
                            };
                        });
                        
                    } catch (error) {
                        console.error(`❌ Vector search failed for query "${query}" in collection "${actualCollectionName}":`, error);
                        return [];
                    }
                }
            };

            const llmQaService = new LlmQaService(vectorService);

            const qaRequest = {
                question,
                collectionName: collection,
                systemPrompt,
                userPrompt,
                maxResults: maxResults || 5
            };

            const result = await llmQaService.answerQuestion(qaRequest);
            
            // Enhanced source information with proper chunk IDs and metadata for snippet preview
            if (result.sources && result.sources.length > 0) {
                result.sources = result.sources.map(source => ({
                    id: source.id,
                    chunkId: source.id, // Ensure chunk ID is available
                    filename: source.metadata?.filename || 'Unknown',
                    similarity: source.score || 0,
                    contentPreview: (source.metadata?.content || '').substring(0, 150) + '...',
                    metadata: source.metadata // Include full metadata for debugging
                }));
            }
            
            console.log('✅ Enhanced LLM QA result with real chunk IDs:', {
                sourcesCount: result.sources?.length || 0,
                sourcesWithChunkIds: result.sources?.filter(s => s.chunkId).length || 0,
                sampleChunkIds: result.sources?.slice(0, 3).map(s => s.chunkId) || []
            });
            
            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('❌ Error in LLM QA:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to process question'
            });
        }
    }
);

router.post('/:collection/qa', 
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        // ...existing logic unchanged...
    }
);

console.log('LLM Q&A routes registered');
module.exports = router;
