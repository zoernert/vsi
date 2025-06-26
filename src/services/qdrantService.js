const axios = require('axios');

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
            
            const response = await this.client.put(`/collections/${collectionName}`, {
                vectors: {
                    size: vectorSize,
                    distance: "Cosine"
                }
            });
            
            console.log(`✅ Qdrant collection created: ${collectionName}`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 409) {
                console.log(`✅ Collection ${collectionName} already exists, continuing...`);
                return { status: 'exists' };
            }
            
            // Log the full error details for debugging
            console.error('❌ Error creating Qdrant collection:', error.message);
            if (error.response?.data) {
                console.error('❌ Response data:', error.response.data);
                
                // Check if it's actually a "collection already exists" error in the response data
                if (error.response.data.status?.error?.includes('already exists')) {
                    console.log(`✅ Collection ${collectionName} already exists (detected from error message), continuing...`);
                    return { status: 'exists' };
                }
            }
            
            throw error;
        }
    }

    async upsertPoints(collectionName, points) {
        try {
            console.log(`Upserting ${points.length} points to ${collectionName}`);
            
            const response = await this.client.put(`/collections/${collectionName}/points`, {
                points: points
            });
            
            console.log(`✅ Upserted ${points.length} points to Qdrant`);
            return response.data;
        } catch (error) {
            console.error('❌ Error upserting points to Qdrant:', error.message);
            
            if (error.response?.data) {
                console.error('❌ Qdrant response details:', error.response.data);
            }
            
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
            const response = await this.client.post(`/collections/${collectionName}/points/search`, {
                vector: vector,
                limit: limit,
                score_threshold: threshold,
                with_payload: true
            });
            
            return response.data.result || [];
        } catch (error) {
            console.error('Error searching Qdrant:', error.message);
            throw error;
        }
    }

    async deleteCollection(collectionName) {
        try {
            await this.client.delete(`/collections/${collectionName}`);
            console.log(`✅ Deleted Qdrant collection: ${collectionName}`);
        } catch (error) {
            console.error('Error deleting Qdrant collection:', error.message);
            throw error;
        }
    }

    async deletePoints(collectionName, pointIds) {
        try {
            console.log(`🗑️ Deleting ${pointIds.length} points from ${collectionName}`);
            
            const response = await this.client.post(`/collections/${collectionName}/points/delete`, {
                points: pointIds
            });
            
            console.log(`✅ Deleted ${pointIds.length} points from Qdrant`);
            return response.data;
        } catch (error) {
            console.error('❌ Error deleting points from Qdrant:', error.message);
            
            if (error.response?.data) {
                console.error('❌ Qdrant delete response details:', error.response.data);
            }
            
            throw error;
        }
    }

    async deletePoint(collectionName, pointId) {
        try {
            console.log(`🗑️ Deleting point ${pointId} from ${collectionName}`);
            
            const response = await this.client.post(`/collections/${collectionName}/points/delete`, {
                points: [pointId]
            });
            
            console.log(`✅ Deleted point ${pointId} from Qdrant`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error deleting point ${pointId} from Qdrant:`, error.message);
            throw error;
        }
    }

    async getCollectionInfo(collectionName) {
        try {
            const response = await this.client.get(`/collections/${collectionName}`);
            return response.data.result;
        } catch (error) {
            console.error('Error getting collection info:', error.message);
            return null;
        }
    }
}

module.exports = { QdrantService };
