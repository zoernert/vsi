const axios = require('axios');
const qdrant = require('../config/qdrant'); // Import the qdrant wrapper

class QdrantService {
    constructor() {
        this.baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async createCollection(collectionName, vectorSize = 768) {
        try {
            console.log(`Creating Qdrant collection: ${collectionName} with vector size: ${vectorSize}`);
            
            // Use the qdrant wrapper instead of direct axios
            const result = await qdrant.createCollection(collectionName, {
                size: vectorSize,
                distance: 'Cosine'
            });
            
            console.log(`✅ Qdrant collection created: ${collectionName}`);
            return result;
        } catch (error) {
            if (error.message?.includes('already exists')) {
                console.log(`✅ Collection ${collectionName} already exists, continuing...`);
                return { status: 'exists' };
            }
            
            console.error('❌ Error creating Qdrant collection:', error.message);
            throw error;
        }
    }

    async upsertPoints(collectionName, points) {
        try {
            console.log(`Upserting ${points.length} points to ${collectionName}`);
            
            // Use the qdrant wrapper
            const result = await qdrant.upsert(collectionName, points);
            
            console.log(`✅ Upserted ${points.length} points to Qdrant`);
            return result;
        } catch (error) {
            console.error('❌ Error upserting points to Qdrant:', error.message);
            
            // Log first point for debugging
            if (points.length > 0) {
                console.error('❌ Sample point structure:', {
                    id: points[0].id,
                    vectorLength: points[0].vector?.length,
                    payloadKeys: Object.keys(points[0].payload || {})
                });
            }
            
            throw error;
        }
    }

    async searchPoints(collectionName, vector, limit = 10, threshold = 0.5) {
        try {
            // Use the qdrant wrapper
            const results = await qdrant.search(collectionName, {
                vector: vector,
                limit: limit,
                score_threshold: threshold,
                with_payload: true,
                with_vector: false
            });
            
            return results || [];
        } catch (error) {
            console.error('Error searching Qdrant:', error.message);
            throw error;
        }
    }

    async deleteCollection(collectionName) {
        try {
            await qdrant.deleteCollection(collectionName);
            console.log(`✅ Deleted Qdrant collection: ${collectionName}`);
        } catch (error) {
            console.error('Error deleting Qdrant collection:', error.message);
            throw error;
        }
    }

    async deletePoints(collectionName, pointIds) {
        try {
            console.log(`🗑️ Deleting ${pointIds.length} points from ${collectionName}`);
            
            const result = await qdrant.delete(collectionName, {
                points: pointIds
            });
            
            console.log(`✅ Deleted ${pointIds.length} points from Qdrant`);
            return result;
        } catch (error) {
            console.error('❌ Error deleting points from Qdrant:', error.message);
            throw error;
        }
    }

    async deletePoint(collectionName, pointId) {
        try {
            console.log(`🗑️ Deleting point ${pointId} from ${collectionName}`);
            
            const result = await qdrant.delete(collectionName, {
                points: [pointId]
            });
            
            console.log(`✅ Deleted point ${pointId} from Qdrant`);
            return result;
        } catch (error) {
            console.error(`❌ Error deleting point ${pointId} from Qdrant:`, error.message);
            throw error;
        }
    }

    async getCollectionInfo(collectionName) {
        try {
            const result = await qdrant.getCollection(collectionName);
            return result;
        } catch (error) {
            console.error('Error getting collection info:', error.message);
            return null;
        }
    }

    async count(collectionName) {
        try {
            console.log(`📊 QdrantService counting points in ${collectionName}`);
            
            // Check if collection exists first
            const exists = await this.collectionExists(collectionName);
            if (!exists) {
                console.warn(`📊 Collection ${collectionName} does not exist, returning count 0`);
                return { count: 0 };
            }
            
            // Get the count using the qdrant wrapper
            const result = await qdrant.count(collectionName);
            console.log(`📊 QdrantService got count result:`, result);
            
            return result;
        } catch (error) {
            console.error(`❌ QdrantService count error for ${collectionName}:`, error);
            return { count: 0 };
        }
    }

    async collectionExists(collectionName) {
        try {
            console.log(`🔍 QdrantService checking if collection ${collectionName} exists`);
            const exists = await qdrant.collectionExists(collectionName);
            console.log(`🔍 QdrantService collection ${collectionName} exists: ${exists}`);
            return exists;
        } catch (error) {
            console.error(`❌ QdrantService collection exists check error:`, error);
            return false;
        }
    }
}

module.exports = { QdrantService };
