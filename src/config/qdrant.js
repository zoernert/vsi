console.log('Testing Qdrant connection...');

// Mock Qdrant client with all required methods
const qdrantClient = {
    // Collection management
    async createCollection(collectionName, config) {
        console.log(`Mock: Creating collection ${collectionName} with config:`, config);
        return { 
            status: 'ok',
            result: true
        };
    },

    async deleteCollection(collectionName) {
        console.log(`Mock: Deleting collection ${collectionName}`);
        return { 
            status: 'ok',
            result: true
        };
    },

    async getCollection(collectionName) {
        console.log(`Mock: Getting collection info for ${collectionName}`);
        return {
            status: 'green',
            config: {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            },
            points_count: 0
        };
    },

    async getCollections() {
        console.log('Mock: Getting all collections');
        return {
            collections: [
                {
                    name: 'user_2_Create',
                    vectors_count: 0,
                    status: 'green'
                }
            ]
        };
    },

    // Point operations
    async upsert(collectionName, data) {
        console.log(`Mock: Upserting ${data.points?.length || 0} points to collection ${collectionName}`);
        return {
            operation_id: null,
            status: 'completed'
        };
    },

    async search(collectionName, searchParams) {
        console.log(`Mock: Searching collection ${collectionName} with params:`, {
            vector_length: searchParams.vector?.length || 0,
            limit: searchParams.limit,
            threshold: searchParams.score_threshold
        });
        return []; // Empty search results
    },

    async retrieve(collectionName, params) {
        console.log(`Mock: Retrieving points from collection ${collectionName}:`, params.ids);
        return [];
    },

    async delete(collectionName, params) {
        console.log(`Mock: Deleting points from collection ${collectionName}:`, params);
        return {
            operation_id: null,
            status: 'completed'
        };
    },

    async count(collectionName) {
        console.log(`Mock: Counting points in collection ${collectionName}`);
        return {
            count: 0
        };
    },

    async scroll(collectionName, params) {
        console.log(`Mock: Scrolling collection ${collectionName} with params:`, params);
        return {
            points: [],
            next_page_offset: null
        };
    },

    // Legacy methods for backward compatibility
    async collectionExists(collectionName) {
        console.log(`Mock: Checking if collection ${collectionName} exists`);
        return false;
    },
    
    async ensureCollection(collectionName, config) {
        console.log(`Mock: Ensuring collection ${collectionName} exists with config:`, config);
        return true;
    }
};

console.log('Mock Qdrant client exported with methods:', Object.keys(qdrantClient));

module.exports = qdrantClient;
