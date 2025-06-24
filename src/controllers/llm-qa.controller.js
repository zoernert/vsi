const express = require('express');
const { LlmQaService } = require('../services/llm-qa.service');
const { qdrantClient } = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createUsageMiddleware } = require('../middleware/usageTracking');
const { validateChunkForEmbedding } = require('../utils/textSplitter');

const router = express.Router();

console.log('LLM Q&A controller loaded');

// Apply authentication to the route
router.use(authenticateToken);

// Helper function to get user-specific collection name
function getUserCollectionName(username, collectionName) {
    return `user_${username}_${collectionName}`;
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
            const username = req.user.username;
            const actualCollectionName = getUserCollectionName(username, collection);

            // Ensure collection exists before searching
            try {
                await qdrantClient.ensureCollection(actualCollectionName);
            } catch (error) {
                console.warn(`Collection ${actualCollectionName} doesn't exist, creating empty collection for search`);
            }

            // Create vector service that uses your existing search functionality
            const vectorService = {
                search: async (collectionName, query, limit) => {
                    try {
                        console.log(`Searching in collection: ${actualCollectionName} for query: "${query}"`);
                        
                        // Generate embedding for the query using the same method as uploadRoutes
                        const queryEmbedding = await generateEmbedding(query);
                        
                        // Search in Qdrant with user-specific collection
                        const searchResult = await qdrantClient.search(actualCollectionName, {
                            vector: queryEmbedding,
                            limit: limit,
                            with_payload: true,
                            with_vector: false
                        });

                        console.log(`Found ${searchResult.length} results from Qdrant`);
                        if (searchResult.length > 0) {
                            console.log('First result payload keys:', Object.keys(searchResult[0].payload));
                            // Check what content fields are available
                            const firstPayload = searchResult[0].payload;
                            const availableContentFields = ['text', 'content', 'chunkContent', 'markdown', 'chunk'].filter(field => firstPayload[field]);
                            console.log('Available content fields:', availableContentFields);
                        }

                        // Transform results to extract actual content
                        return searchResult.map(result => {
                            // Get the actual text content from the payload - try multiple field names
                            let content = result.payload?.text || 
                                         result.payload?.content || 
                                         result.payload?.chunkContent ||
                                         result.payload?.markdown || 
                                         result.payload?.chunk ||
                                         `Document: ${result.payload?.originalName || result.payload?.filename || 'Unknown'}`;
                            
                            // If this is a file result, add file metadata
                            if (result.payload?.originalName) {
                                const fileInfo = `📄 File: ${result.payload.originalName}`;
                                if (result.payload.downloadUrl) {
                                    content = `${fileInfo}\nDownload: ${result.payload.downloadUrl}\n\nContent:\n${content}`;
                                } else {
                                    content = `${fileInfo}\n\nContent:\n${content}`;
                                }
                            }
                            
                            console.log(`Content length for result ${result.id}: ${content.length} characters`);
                            
                            return {
                                metadata: {
                                    content: content
                                },
                                score: result.score,
                                id: result.id
                            };
                        });
                        
                    } catch (error) {
                        console.error(`Vector search failed for query "${query}" in collection "${actualCollectionName}":`, error);
                        return [];
                    }
                }
            };

            const llmQaService = new LlmQaService(vectorService);

            const qaRequest = {
                question,
                collectionName: collection, // Use original collection name for the service
                systemPrompt,
                userPrompt,
                maxResults: maxResults || 5
            };

            const result = await llmQaService.answerQuestion(qaRequest);
            
            // Enhanced debug information to show actual content
            console.log('Retrieved context count:', result.retrievedContext.length);
            console.log('Context details:');
            result.retrievedContext.forEach((ctx, index) => {
                // Find where actual content starts (after file header)
                const contentStartMatch = ctx.match(/Content:\n(.+)/s);
                if (contentStartMatch) {
                    const actualContent = contentStartMatch[1];
                    console.log(`  Context ${index + 1}: File header + ${actualContent.length} chars of content`);
                    console.log(`  Preview: ${actualContent.substring(0, 150)}...`);
                } else {
                    console.log(`  Context ${index + 1}: ${ctx.substring(0, 100)}...`);
                }
            });
            
            res.json(result);

        } catch (error) {
            console.error('Error in LLM QA:', error);
            res.status(500).json({
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
