const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { McpService } = require('../services/mcpService');
const router = express.Router();

const mcpService = new McpService();

// MCP service status endpoint
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Return MCP service information
        res.json({
            status: 'active',
            name: 'vsi-vector-store',
            version: '2.0.0',
            capabilities: {
                tools: {
                    count: 18,
                    available: [
                        'list_collections',
                        'create_collection', 
                        'delete_collection',
                        'add_document',
                        'upload_file',
                        'search_documents',
                        'ask_question',
                        'get_document',
                        'delete_document',
                        'list_documents',
                        'get_collection_info',
                        'list_clusters',
                        'create_cluster',
                        'delete_cluster',
                        'generate_smart_context',
                        'get_collection_analytics',
                        'get_user_analytics',
                        'call_tool'
                    ]
                }
            },
            description: 'Model Context Protocol server for VSI Vector Store with full REST API integration',
            usage: {
                stdio: 'node src/mcp-server.js',
                transport: 'stdio',
                http: 'http://localhost:3000/api/mcp/'
            },
            authentication: 'JWT token required for all operations'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// MCP tools documentation endpoint
router.get('/tools', authenticateToken, async (req, res) => {
    try {
        const tools = [
            {
                name: 'list_collections',
                description: 'List all available vector collections for authenticated user',
                parameters: {}
            },
            {
                name: 'create_collection',
                description: 'Create a new vector collection for authenticated user',
                parameters: {
                    name: 'string (required)',
                    description: 'string (optional)',
                    vector_size: 'number (default: 768)',
                    distance: 'string (Cosine|Euclidean|Dot, default: Cosine)'
                }
            },
            {
                name: 'delete_collection',
                description: 'Delete a vector collection for authenticated user',
                parameters: {
                    name: 'string (required)'
                }
            },
            {
                name: 'add_document',
                description: 'Add a text document with automatic embedding generation',
                parameters: {
                    collection: 'string (required)',
                    title: 'string (required)',
                    content: 'string (required)',
                    metadata: 'object (optional)'
                }
            },
            {
                name: 'upload_file',
                description: 'Upload and index a file to a collection',
                parameters: {
                    collection: 'string (required)',
                    filename: 'string (required)',
                    content: 'string (base64 encoded, required)',
                    mime_type: 'string (optional)'
                }
            },
            {
                name: 'search_documents',
                description: 'Search documents using semantic similarity',
                parameters: {
                    collection: 'string (required)',
                    query: 'string (required)',
                    limit: 'number (default: 10)',
                    score_threshold: 'number (default: 0.0)'
                }
            },
            {
                name: 'ask_question',
                description: 'Ask a question and get an LLM-powered answer based on collection content',
                parameters: {
                    collection: 'string (required)',
                    question: 'string (required)',
                    context_limit: 'number (default: 5)'
                }
            },
            {
                name: 'get_document',
                description: 'Retrieve a specific document by ID',
                parameters: {
                    collection: 'string (required)',
                    document_id: 'string (required)'
                }
            },
            {
                name: 'delete_document',
                description: 'Delete a document from a collection',
                parameters: {
                    collection: 'string (required)',
                    document_id: 'string (required)'
                }
            },
            {
                name: 'list_documents',
                description: 'List documents in a collection',
                parameters: {
                    collection: 'string (required)',
                    limit: 'number (default: 50)',
                    offset: 'number (default: 0)'
                }
            },
            {
                name: 'get_collection_info',
                description: 'Get detailed information about a collection',
                parameters: {
                    collection: 'string (required)'
                }
            },
            {
                name: 'list_clusters',
                description: 'List all clusters for authenticated user',
                parameters: {}
            },
            {
                name: 'create_cluster',
                description: 'Create a new cluster for organizing collections',
                parameters: {
                    name: 'string (required)',
                    description: 'string (optional)'
                }
            },
            {
                name: 'delete_cluster',
                description: 'Delete a cluster',
                parameters: {
                    cluster_id: 'string (required)'
                }
            },
            {
                name: 'generate_smart_context',
                description: 'Generate smart context from collection based on query',
                parameters: {
                    collection: 'string (required)',
                    query: 'string (required)',
                    max_tokens: 'number (default: 4000)'
                }
            },
            {
                name: 'get_collection_analytics',
                description: 'Get analytics data for a specific collection',
                parameters: {
                    collection: 'string (required)'
                }
            },
            {
                name: 'get_user_analytics',
                description: 'Get overall analytics for the authenticated user',
                parameters: {}
            }
        ];

        res.json({
            status: 'success',
            tools,
            count: tools.length,
            note: 'All tools require JWT authentication via Authorization header'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// MCP tool execution endpoint
router.post('/call-tool', authenticateToken, async (req, res) => {
    try {
        const { name, arguments: args } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!name) {
            return res.status(400).json({
                status: 'error',
                message: 'Tool name is required'
            });
        }

        let result;

        switch (name) {
            case 'list_collections':
                result = await mcpService.listCollections(token);
                break;

            case 'create_collection':
                result = await mcpService.createCollection(
                    token,
                    args.name,
                    args.description,
                    args.vector_size,
                    args.distance
                );
                break;

            case 'delete_collection':
                result = await mcpService.deleteCollection(token, args.name);
                break;

            case 'add_document':
                result = await mcpService.addDocument(
                    token,
                    args.collection,
                    args.title,
                    args.content,
                    args.metadata
                );
                break;

            case 'upload_file':
                result = await mcpService.uploadFile(
                    token,
                    args.collection,
                    args.filename,
                    args.content,
                    args.mime_type
                );
                break;

            case 'search_documents':
                result = await mcpService.searchDocuments(
                    token,
                    args.collection,
                    args.query,
                    args.limit,
                    args.score_threshold
                );
                break;

            case 'ask_question':
                result = await mcpService.askQuestion(
                    token,
                    args.collection,
                    args.question,
                    args.context_limit
                );
                break;

            case 'get_document':
                result = await mcpService.getDocument(
                    token,
                    args.collection,
                    args.document_id
                );
                break;

            case 'delete_document':
                result = await mcpService.deleteDocument(
                    token,
                    args.collection,
                    args.document_id
                );
                break;

            case 'list_documents':
                result = await mcpService.listDocuments(
                    token,
                    args.collection,
                    args.limit,
                    args.offset
                );
                break;

            case 'get_collection_info':
                result = await mcpService.getCollectionInfo(token, args.collection);
                break;

            case 'list_clusters':
                result = await mcpService.listClusters(token);
                break;

            case 'create_cluster':
                result = await mcpService.createCluster(token, args.name, args.description);
                break;

            case 'delete_cluster':
                result = await mcpService.deleteCluster(token, args.cluster_id);
                break;

            case 'generate_smart_context':
                result = await mcpService.generateSmartContext(
                    token,
                    args.collection,
                    args.query,
                    args.max_tokens
                );
                break;

            case 'get_collection_analytics':
                result = await mcpService.getCollectionAnalytics(token, args.collection);
                break;

            case 'get_user_analytics':
                result = await mcpService.getUserAnalytics(token);
                break;

            default:
                return res.status(400).json({
                    status: 'error',
                    message: `Unknown tool: ${name}`
                });
        }

        res.json({
            status: 'success',
            tool: name,
            result
        });

    } catch (error) {
        console.error('MCP tool execution error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            tool: req.body.name
        });
    }
});

module.exports = router;
