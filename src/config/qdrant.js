const { QdrantClient } = require('@qdrant/qdrant-js');

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false
});

// Test connection on startup
async function testConnection() {
    try {
        console.log('Testing Qdrant connection...');
        const collections = await qdrantClient.getCollections();
        console.log('✅ Connected to Qdrant successfully');
        console.log(`Found ${collections.collections?.length || 0} collections`);
    } catch (error) {
        console.error('❌ Failed to connect to Qdrant:', error.message);
        console.error('Make sure Qdrant is running on:', process.env.QDRANT_URL || 'http://localhost:6333');
    }
}

testConnection();

// Helper function to check if collection exists
async function collectionExists(collectionName) {
    try {
        await qdrantClient.getCollection(collectionName);
        return true;
    } catch (error) {
        if (error.status === 404 || error.message.includes('Not found')) {
            return false;
        }
        throw error;
    }
}

// Helper function to ensure collection exists
async function ensureCollection(collectionName, vectorConfig = { size: 768, distance: 'Cosine' }) {
    const exists = await collectionExists(collectionName);
    if (!exists) {
        await qdrantClient.createCollection(collectionName, {
            vectors: vectorConfig
        });
        console.log(`Collection '${collectionName}' created successfully.`);
    }
    return !exists;
}

// Export the client directly with helper functions
module.exports = qdrantClient;
module.exports.collectionExists = collectionExists;
module.exports.ensureCollection = ensureCollection;

console.log('Qdrant client exported with methods:', 
    Object.getOwnPropertyNames(module.exports).filter(name => typeof module.exports[name] === 'function').slice(0, 10)
);
