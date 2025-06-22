const express = require('express');
const router = express.Router();
const { qdrantClient } = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// Helper function to get user-specific collection name
function getUserCollectionName(username, collectionName) {
    return `user_${username}_${collectionName}`;
}

// Helper function to ensure collection exists
async function ensureCollectionExists(actualCollectionName) {
    try {
        await qdrantClient.getCollection(actualCollectionName);
        return true;
    } catch (error) {
        // Check if it's a 404 Not Found error (collection doesn't exist)
        if (error.status === 404 || error.message.includes('Not found') || error.message.includes("doesn't exist")) {
            await qdrantClient.createCollection(actualCollectionName, {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            });
            console.log(`Auto-created collection: ${actualCollectionName}`);
            return false;
        } else {
            throw error;
        }
    }
}

// Search points
router.post('/:collection/points/search', async (req, res) => {
    try {
        const { collection } = req.params;
        const { vector, limit = 10, with_payload = true, with_vector = false, filter } = req.body;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
        // Ensure collection exists before searching
        await ensureCollectionExists(actualCollectionName);
        
        const searchResult = await qdrantClient.search(actualCollectionName, {
            vector,
            limit,
            with_payload,
            with_vector,
            filter
        });
        
        res.json({ result: searchResult });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upsert points
router.put('/:collection/points', async (req, res) => {
    try {
        const { collection } = req.params;
        const { points } = req.body;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
        // Auto-create collection if it doesn't exist
        await ensureCollectionExists(actualCollectionName);
        
        await qdrantClient.upsert(actualCollectionName, {
            points
        });
        
        res.json({ result: { operation_id: null, status: 'completed' } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get points
router.post('/:collection/points', async (req, res) => {
    try {
        const { collection } = req.params;
        const { ids, with_payload = true, with_vector = false } = req.body;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
        // Ensure collection exists before retrieving points
        await ensureCollectionExists(actualCollectionName);
        
        const points = await qdrantClient.retrieve(actualCollectionName, {
            ids,
            with_payload,
            with_vector
        });
        
        res.json({ result: points });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete points
router.post('/:collection/points/delete', async (req, res) => {
    try {
        const { collection } = req.params;
        const { points, filter } = req.body;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
        // Ensure collection exists before deleting points
        await ensureCollectionExists(actualCollectionName);
        
        if (points) {
            await qdrantClient.delete(actualCollectionName, { points });
        } else if (filter) {
            await qdrantClient.delete(actualCollectionName, { filter });
        }
        
        res.json({ result: { operation_id: null, status: 'completed' } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
