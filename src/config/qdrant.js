console.log('Testing Qdrant connection...');

// Real Qdrant client implementation
const { QdrantClient } = require('@qdrant/js-client-rest');

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
});

// Wrap the client with helper methods
const qdrantWrapper = {
    // Collection management
    async createCollection(collectionName, config) {
        console.log(`Creating collection ${collectionName} with config:`, config);
        try {
            return await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: config.size || 768,
                    distance: config.distance || 'Cosine'
                }
            });
        } catch (error) {
            if (error.message?.includes('already exists')) {
                console.log(`Collection ${collectionName} already exists`);
                return { status: 'ok', result: true };
            }
            throw error;
        }
    },

    async deleteCollection(collectionName) {
        console.log(`Deleting collection ${collectionName}`);
        return await qdrantClient.deleteCollection(collectionName);
    },

    async getCollection(collectionName) {
        console.log(`Getting collection info for ${collectionName}`);
        return await qdrantClient.getCollection(collectionName);
    },

    async getCollections() {
        console.log('Getting all collections');
        return await qdrantClient.getCollections();
    },

    // Point operations
    async upsert(collectionName, data) {
        console.log(`Upserting ${data.points?.length || 0} points to collection ${collectionName}`);
        return await qdrantClient.upsert(collectionName, {
            wait: true,
            points: data.points || data
        });
    },

    async search(collectionName, searchParams) {
        console.log(`Searching collection ${collectionName} with params:`, {
            vector_length: searchParams.vector?.length || 0,
            limit: searchParams.limit,
            threshold: searchParams.score_threshold
        });
        return await qdrantClient.search(collectionName, searchParams);
    },

    async retrieve(collectionName, params) {
        console.log(`Retrieving points from collection ${collectionName}:`, params.ids);
        try {
            const response = await qdrantClient.retrieve(collectionName, {
                ids: params.ids,
                with_payload: params.with_payload !== false,
                with_vector: params.with_vector || false
            });
            
            console.log(`Successfully retrieved ${response.length} points from Qdrant`);
            return response;
        } catch (error) {
            console.error(`Failed to retrieve points from collection ${collectionName}:`, error);
            throw error;
        }
    },

    async delete(collectionName, params) {
        console.log(`Deleting points from collection ${collectionName}:`, params);
        return await qdrantClient.delete(collectionName, {
            points: params.points || params.ids
        });
    },

    async count(collectionName) {
        console.log(`Counting points in collection ${collectionName}`);
        return await qdrantClient.count(collectionName);
    },

    async scroll(collectionName, params) {
        console.log(`Scrolling collection ${collectionName} with params:`, params);
        return await qdrantClient.scroll(collectionName, {
            limit: params.limit,
            offset: params.offset,
            with_payload: params.with_payload !== false,
            with_vector: params.with_vector || false
        });
    },

    // Legacy methods for backward compatibility
    async collectionExists(collectionName) {
        console.log(`Checking if collection ${collectionName} exists`);
        try {
            await this.getCollection(collectionName);
            return true;
        } catch (error) {
            return false;
        }
    },
    
    async ensureCollection(collectionName, config = {}) {
        console.log(`Ensuring collection ${collectionName} exists with config:`, config);
        try {
            await this.getCollection(collectionName);
            console.log(`Collection ${collectionName} already exists`);
            return false; // Already existed
        } catch (error) {
            if (error.status === 404) {
                await this.createCollection(collectionName, config);
                console.log(`Created collection ${collectionName}`);
                return true; // Was created
            }
            throw error;
        }
    }
};

console.log('Real Qdrant client configured with methods:', Object.keys(qdrantWrapper));

module.exports = qdrantWrapper;
