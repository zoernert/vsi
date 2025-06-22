#!/usr/bin/env node

require('dotenv').config();
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { qdrantClient } = require('./config/qdrant');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

// Initialize Google AI for embeddings
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Helper function to generate embeddings
async function generateEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return new Array(768).fill(0);
    }
}

// Helper function to get user collections (for MCP, we'll use a default user)
function getUserCollectionName(collectionName) {
    return `mcp_${collectionName}`;
}

// Create MCP server
const server = new Server(
    {
        name: 'vsi-vector-store',
        version: '1.0.0',
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
        description: 'List all available vector collections',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'create_collection',
        description: 'Create a new vector collection',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the collection to create',
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
        description: 'Delete a vector collection',
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
];

// Handle list_tools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});

// Handle call_tool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'list_collections':
                return await handleListCollections();
            
            case 'create_collection':
                return await handleCreateCollection(args);
            
            case 'delete_collection':
                return await handleDeleteCollection(args);
            
            case 'add_document':
                return await handleAddDocument(args);
            
            case 'search_documents':
                return await handleSearchDocuments(args);
            
            case 'get_document':
                return await handleGetDocument(args);
            
            case 'delete_document':
                return await handleDeleteDocument(args);
            
            case 'list_documents':
                return await handleListDocuments(args);
            
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`,
                },
            ],
        };
    }
});

// Tool implementations
async function handleListCollections() {
    const allCollections = await qdrantClient.getCollections();
    const mcpCollections = allCollections.collections
        .filter(collection => collection.name.startsWith('mcp_'))
        .map(collection => ({
            name: collection.name.substring(4), // Remove 'mcp_' prefix
        }));

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(mcpCollections, null, 2),
            },
        ],
    };
}

async function handleCreateCollection(args) {
    const { name, vector_size = 768, distance = 'Cosine' } = args;
    const actualCollectionName = getUserCollectionName(name);

    await qdrantClient.createCollection(actualCollectionName, {
        vectors: {
            size: vector_size,
            distance: distance,
        },
    });

    return {
        content: [
            {
                type: 'text',
                text: `Collection '${name}' created successfully with vector size ${vector_size} and ${distance} distance metric.`,
            },
        ],
    };
}

async function handleDeleteCollection(args) {
    const { name } = args;
    const actualCollectionName = getUserCollectionName(name);

    await qdrantClient.deleteCollection(actualCollectionName);

    return {
        content: [
            {
                type: 'text',
                text: `Collection '${name}' deleted successfully.`,
            },
        ],
    };
}

async function handleAddDocument(args) {
    const { collection, title, content, metadata = {} } = args;
    const actualCollectionName = getUserCollectionName(collection);

    // Generate embedding
    const text = `${title}\n\n${content}`;
    const embedding = await generateEmbedding(text);

    // Create point
    const documentId = uuidv4();
    const point = {
        id: documentId,
        vector: embedding,
        payload: {
            title,
            content,
            text,
            ...metadata,
            createdAt: new Date().toISOString(),
            type: 'text',
            source: 'mcp',
        },
    };

    // Ensure collection exists
    try {
        await qdrantClient.getCollection(actualCollectionName);
    } catch (error) {
        if (error.message.includes('Not found')) {
            await qdrantClient.createCollection(actualCollectionName, {
                vectors: {
                    size: 768,
                    distance: 'Cosine',
                },
            });
        } else {
            throw error;
        }
    }

    // Add document
    await qdrantClient.upsert(actualCollectionName, {
        points: [point],
    });

    return {
        content: [
            {
                type: 'text',
                text: `Document '${title}' added to collection '${collection}' with ID: ${documentId}`,
            },
        ],
    };
}

async function handleSearchDocuments(args) {
    const { collection, query, limit = 10, score_threshold = 0.0 } = args;
    const actualCollectionName = getUserCollectionName(collection);

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Search
    const searchResult = await qdrantClient.search(actualCollectionName, {
        vector: queryEmbedding,
        limit: parseInt(limit),
        with_payload: true,
        with_vector: false,
        score_threshold: score_threshold,
    });

    const results = searchResult.map(hit => ({
        id: hit.id,
        score: hit.score,
        title: hit.payload.title,
        content: hit.payload.content || hit.payload.text,
        metadata: {
            createdAt: hit.payload.createdAt,
            type: hit.payload.type,
            source: hit.payload.source,
        },
    }));

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    query,
                    results,
                    count: results.length,
                }, null, 2),
            },
        ],
    };
}

async function handleGetDocument(args) {
    const { collection, document_id } = args;
    const actualCollectionName = getUserCollectionName(collection);

    const points = await qdrantClient.retrieve(actualCollectionName, {
        ids: [document_id],
        with_payload: true,
        with_vector: false,
    });

    if (points.length === 0) {
        throw new Error(`Document with ID '${document_id}' not found in collection '${collection}'`);
    }

    const document = {
        id: points[0].id,
        title: points[0].payload.title,
        content: points[0].payload.content || points[0].payload.text,
        metadata: {
            createdAt: points[0].payload.createdAt,
            type: points[0].payload.type,
            source: points[0].payload.source,
        },
    };

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(document, null, 2),
            },
        ],
    };
}

async function handleDeleteDocument(args) {
    const { collection, document_id } = args;
    const actualCollectionName = getUserCollectionName(collection);

    await qdrantClient.delete(actualCollectionName, {
        points: [document_id],
    });

    return {
        content: [
            {
                type: 'text',
                text: `Document with ID '${document_id}' deleted from collection '${collection}'.`,
            },
        ],
    };
}

async function handleListDocuments(args) {
    const { collection, limit = 50, offset = 0 } = args;
    const actualCollectionName = getUserCollectionName(collection);

    const scrollResult = await qdrantClient.scroll(actualCollectionName, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true,
        with_vector: false,
    });

    const documents = scrollResult.points.map(point => ({
        id: point.id,
        title: point.payload.title,
        content: (point.payload.content || point.payload.text || '').substring(0, 200) + '...',
        metadata: {
            createdAt: point.payload.createdAt,
            type: point.payload.type,
            source: point.payload.source,
        },
    }));

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    collection,
                    documents,
                    count: documents.length,
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                }, null, 2),
            },
        ],
    };
}

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('VSI Vector Store MCP server running on stdio');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { server };
