const express = require('express');
const router = express.Router();
const qdrantClient = require('../config/qdrant'); // Remove destructuring - use direct import
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// Helper function to get user-specific collection name
async function getUserCollectionName(userId, collectionName) {
    // Import database service
    const { DatabaseService } = require('../services/databaseService');
    const db = new DatabaseService();
    if (!db.pool) await db.initialize();
    
    // If collectionName is numeric, get the Qdrant collection name from database
    if (!isNaN(collectionName)) {
        const result = await db.pool.query(
            'SELECT qdrant_collection_name FROM collections WHERE id = $1 AND user_id = $2',
            [parseInt(collectionName), userId]
        );
        if (result.rows.length > 0) {
            return result.rows[0].qdrant_collection_name;
        }
    }
    
    // Fallback to old naming scheme
    return `user_${userId}_${collectionName}`;
}

// Helper function to extract original collection name
function getOriginalCollectionName(userId, fullCollectionName) {
    const prefix = `user_${userId}_`;
    if (fullCollectionName.startsWith(prefix)) {
        return fullCollectionName.substring(prefix.length);
    }
    return fullCollectionName;
}

// Helper function to ensure collection exists
async function ensureCollectionExists(actualCollectionName, config = null) {
    try {
        await qdrantClient.getCollection(actualCollectionName);
        return true; // Collection exists
    } catch (error) {
        // Check if it's a 404 Not Found error (collection doesn't exist)
        if (error.status === 404 || error.message.includes('Not found') || error.message.includes("doesn't exist")) {
            // Create collection with default or provided config
            const collectionConfig = config || {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            };
            await qdrantClient.createCollection(actualCollectionName, collectionConfig);
            console.log(`Auto-created collection: ${actualCollectionName}`);
            return false; // Collection was just created
        } else {
            throw error; // Re-throw other errors
        }
    }
}

// Get user's collections (filtered by user)
router.get('/', async (req, res) => {
    try {
        const { VectorService } = require('../services/vector.service');
        const vectorService = new VectorService();
        
        const collections = await vectorService.getUserCollections(req.user.id, true);
        
        console.log(`Found ${collections.length} collections for user ${req.user.id}`);
        res.json({ collections });
    } catch (error) {
        console.error('Collections route error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create collection
router.post('/', async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;
        
        const { VectorService } = require('../services/vector.service');
        const vectorService = new VectorService();
        
        const collection = await vectorService.createCollection(userId, name, description);
        
        res.json({ result: true, collection });
    } catch (error) {
        console.error('Create collection error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get collection info
router.get('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const userId = req.user.id;
        const actualCollectionName = await getUserCollectionName(userId, name);
        
        await ensureCollectionExists(actualCollectionName);
        const info = await qdrantClient.getCollection(actualCollectionName);
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete collection
router.delete('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const userId = req.user.id;
        const actualCollectionName = await getUserCollectionName(userId, name);
        
        await qdrantClient.deleteCollection(actualCollectionName);
        res.json({ result: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
