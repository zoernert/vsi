const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// MCP service status endpoint
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Return MCP service information
        res.json({
            status: 'active',
            name: 'vsi-vector-store',
            version: '1.0.0',
            capabilities: {
                tools: {
                    count: 11,
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
                        'get_collection_info'
                    ]
                }
            },
            description: 'Model Context Protocol server for VSI Vector Store',
            usage: {
                stdio: 'node src/mcp-server.js',
                transport: 'stdio'
            }
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
                description: 'List all available vector collections',
                parameters: {}
            },
            {
                name: 'create_collection',
                description: 'Create a new vector collection',
                parameters: {
                    name: 'string (required)',
                    vector_size: 'number (default: 768)',
                    distance: 'string (Cosine|Euclidean|Dot, default: Cosine)'
                }
            },
            {
                name: 'delete_collection',
                description: 'Delete a vector collection',
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
                description: 'Ask questions about documents using LLM',
                parameters: {
                    collection: 'string (required)',
                    question: 'string (required)',
                    system_prompt: 'string (optional)',
                    max_results: 'number (default: 5)'
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
                description: 'List all documents in a collection',
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
            }
        ];

        res.json({
            tools,
            total: tools.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

module.exports = router;
