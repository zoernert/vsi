#!/usr/bin/env node

require('dotenv').config();
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { McpService } = require('./services/mcpService');

// Initialize MCP service
const mcpService = new McpService();

// Helper function to extract token from environment or arguments
function getAuthToken() {
    // Try to get token from environment variable (for CI/CD or automated usage)
    if (process.env.MCP_AUTH_TOKEN) {
        return process.env.MCP_AUTH_TOKEN;
    }
    
    // Try to get token from command line arguments
    const tokenArg = process.argv.find(arg => arg.startsWith('--token='));
    if (tokenArg) {
        return tokenArg.split('=')[1];
    }
    
    // For development, you can set a default token or require explicit token
    throw new Error('Authentication token required. Set MCP_AUTH_TOKEN environment variable or use --token=<jwt_token> argument');
}

// Create MCP server
const server = new Server(
    {
        name: 'vsi-vector-store',
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define available tools
const tools = [
    {
        name: 'list_collections',
        description: 'List all available vector collections for authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'create_collection',
        description: 'Create a new vector collection for authenticated user',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the collection to create',
                },
                description: {
                    type: 'string',
                    description: 'Description of the collection',
                    default: '',
                },
                vector_size: {
                    type: 'number',
                    description: 'Size of vectors (default: 768)',
                    default: 768,
                },
                distance: {
                    type: 'string',
                    description: 'Distance metric (Cosine, Euclidean, Dot)',
                    enum: ['Cosine', 'Euclidean', 'Dot'],
                    default: 'Cosine',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'delete_collection',
        description: 'Delete a vector collection for authenticated user',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the collection to delete',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'add_document',
        description: 'Add a text document to a collection with automatic embedding generation',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                title: {
                    type: 'string',
                    description: 'Title of the document',
                },
                content: {
                    type: 'string',
                    description: 'Content of the document',
                },
                metadata: {
                    type: 'object',
                    description: 'Additional metadata for the document',
                    default: {},
                },
            },
            required: ['collection', 'title', 'content'],
        },
    },
    {
        name: 'search_documents',
        description: 'Search documents in a collection using semantic similarity',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection to search',
                },
                query: {
                    type: 'string',
                    description: 'Search query text',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return',
                    default: 10,
                },
                score_threshold: {
                    type: 'number',
                    description: 'Minimum similarity score threshold (0-1)',
                    default: 0.0,
                },
            },
            required: ['collection', 'query'],
        },
    },
    {
        name: 'get_document',
        description: 'Retrieve a specific document by ID',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                document_id: {
                    type: 'string',
                    description: 'ID of the document to retrieve',
                },
            },
            required: ['collection', 'document_id'],
        },
    },
    {
        name: 'delete_document',
        description: 'Delete a document from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                document_id: {
                    type: 'string',
                    description: 'ID of the document to delete',
                },
            },
            required: ['collection', 'document_id'],
        },
    },
    {
        name: 'list_documents',
        description: 'List all documents in a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of documents to return',
                    default: 50,
                },
                offset: {
                    type: 'number',
                    description: 'Number of documents to skip',
                    default: 0,
                },
            },
            required: ['collection'],
        },
    },
    {
        name: 'upload_file',
        description: 'Upload and index a file to a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                filename: {
                    type: 'string',
                    description: 'Name of the file',
                },
                content: {
                    type: 'string',
                    description: 'Base64 encoded file content',
                },
                mime_type: {
                    type: 'string',
                    description: 'MIME type of the file',
                },
            },
            required: ['collection', 'filename', 'content'],
        },
    },
    {
        name: 'ask_question',
        description: 'Ask a question about documents in a collection using LLM',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection to search',
                },
                question: {
                    type: 'string',
                    description: 'Question to ask about the documents',
                },
                system_prompt: {
                    type: 'string',
                    description: 'Optional system prompt for the AI',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of context chunks to retrieve',
                    default: 5,
                },
            },
            required: ['collection', 'question'],
        },
    },
    {
        name: 'get_collection_info',
        description: 'Get detailed information about a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
            },
            required: ['collection'],
        },
    },
    {
        name: 'list_clusters',
        description: 'List all clusters for authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'create_cluster',
        description: 'Create a new cluster for organizing collections',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the cluster to create',
                },
                description: {
                    type: 'string',
                    description: 'Description of the cluster',
                    default: '',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'delete_cluster',
        description: 'Delete a cluster',
        inputSchema: {
            type: 'object',
            properties: {
                cluster_id: {
                    type: 'string',
                    description: 'ID of the cluster to delete',
                },
            },
            required: ['cluster_id'],
        },
    },
    {
        name: 'generate_smart_context',
        description: 'Generate smart context from collection based on query',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
                query: {
                    type: 'string',
                    description: 'Query to generate context for',
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens in generated context',
                    default: 4000,
                },
            },
            required: ['collection', 'query'],
        },
    },
    {
        name: 'get_collection_analytics',
        description: 'Get analytics data for a specific collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: {
                    type: 'string',
                    description: 'Name of the collection',
                },
            },
            required: ['collection'],
        },
    },
    {
        name: 'get_user_analytics',
        description: 'Get overall analytics for the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

// Handle list_tools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});

// Handle call_tool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        // Get authentication token
        const token = getAuthToken();

        switch (name) {
            case 'list_collections':
                const collections = await mcpService.listCollections(token);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(collections, null, 2)
                        }
                    ]
                };
            
            case 'create_collection':
                const newCollection = await mcpService.createCollection(
                    token,
                    args.name,
                    args.description,
                    args.vector_size,
                    args.distance
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(newCollection, null, 2)
                        }
                    ]
                };
            
            case 'delete_collection':
                const deleteResult = await mcpService.deleteCollection(token, args.name);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(deleteResult, null, 2)
                        }
                    ]
                };
            
            case 'add_document':
                const addedDoc = await mcpService.addDocument(
                    token,
                    args.collection,
                    args.title,
                    args.content,
                    args.metadata
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(addedDoc, null, 2)
                        }
                    ]
                };
            
            case 'upload_file':
                const uploadedFile = await mcpService.uploadFile(
                    token,
                    args.collection,
                    args.filename,
                    args.content,
                    args.mime_type
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(uploadedFile, null, 2)
                        }
                    ]
                };
            
            case 'search_documents':
                const searchResults = await mcpService.searchDocuments(
                    token,
                    args.collection,
                    args.query,
                    args.limit,
                    args.score_threshold
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(searchResults, null, 2)
                        }
                    ]
                };
            
            case 'ask_question':
                const answer = await mcpService.askQuestion(
                    token,
                    args.collection,
                    args.question,
                    args.context_limit
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(answer, null, 2)
                        }
                    ]
                };
            
            case 'get_document':
                const document = await mcpService.getDocument(
                    token,
                    args.collection,
                    args.document_id
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(document, null, 2)
                        }
                    ]
                };
            
            case 'delete_document':
                const deleteDocResult = await mcpService.deleteDocument(
                    token,
                    args.collection,
                    args.document_id
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(deleteDocResult, null, 2)
                        }
                    ]
                };
            
            case 'list_documents':
                const documents = await mcpService.listDocuments(
                    token,
                    args.collection,
                    args.limit,
                    args.offset
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(documents, null, 2)
                        }
                    ]
                };
            
            case 'get_collection_info':
                const collectionInfo = await mcpService.getCollectionInfo(token, args.collection);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(collectionInfo, null, 2)
                        }
                    ]
                };
            
            case 'list_clusters':
                const clusters = await mcpService.listClusters(token);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(clusters, null, 2)
                        }
                    ]
                };
            
            case 'create_cluster':
                const newCluster = await mcpService.createCluster(token, args.name, args.description);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(newCluster, null, 2)
                        }
                    ]
                };
            
            case 'delete_cluster':
                const deleteClusterResult = await mcpService.deleteCluster(token, args.cluster_id);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(deleteClusterResult, null, 2)
                        }
                    ]
                };
            
            case 'generate_smart_context':
                const smartContext = await mcpService.generateSmartContext(
                    token,
                    args.collection,
                    args.query,
                    args.max_tokens
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(smartContext, null, 2)
                        }
                    ]
                };
            
            case 'get_collection_analytics':
                const collectionAnalytics = await mcpService.getCollectionAnalytics(token, args.collection);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(collectionAnalytics, null, 2)
                        }
                    ]
                };
            
            case 'get_user_analytics':
                const userAnalytics = await mcpService.getUserAnalytics(token);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(userAnalytics, null, 2)
                        }
                    ]
                };
            
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`
                }
            ],
            isError: true
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('VSI Vector Store MCP server running with user authentication');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { server };
