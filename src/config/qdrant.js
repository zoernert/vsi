const { QdrantClient } = require('@qdrant/qdrant-js');

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    // Add API key if your Qdrant instance requires it
    // apiKey: process.env.QDRANT_API_KEY,
});

// Test connection on startup
async function testConnection() {
    try {
        await qdrantClient.getCollections();
        console.log('✅ Connected to Qdrant successfully');
    } catch (error) {
        console.error('❌ Failed to connect to Qdrant:', error.message);
        console.error('Make sure Qdrant is running on:', process.env.QDRANT_URL || 'http://localhost:6333');
    }
}

// Test connection when module loads
testConnection();

module.exports = { qdrantClient };
