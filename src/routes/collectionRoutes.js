const express = require('express');
const { qdrantClient } = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Helper function to get user-specific collection name
function getUserCollectionName(username, collectionName) {
    return `user_${username}_${collectionName}`;
}

// Helper function to extract original collection name
function getOriginalCollectionName(username, fullCollectionName) {
    const prefix = `user_${username}_`;
    if (fullCollectionName.startsWith(prefix)) {
        return fullCollectionName.substring(prefix.length);
    }
    return fullCollectionName;
}

// Get user's collections (filtered by user)
router.get('/collections', async (req, res) => {
    try {
        const allCollections = await qdrantClient.getCollections();
        const username = req.user.username;
        const userPrefix = `user_${username}_`;
        
        // Filter collections that belong to this user
        const userCollections = allCollections.collections
            .filter(collection => collection.name.startsWith(userPrefix))
            .map(collection => ({
                name: getOriginalCollectionName(username, collection.name)
            }));
        
        res.json({
            collections: userCollections
        });
    } catch (error) {
        console.error('Error fetching collections:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a new collection
router.post('/collections', async (req, res) => {
    try {
        const { name, config } = req.body;
        const username = req.user.username;
        
        if (!name) {
            return res.status(400).json({ error: 'Collection name is required' });
        }
        
        const collectionConfig = config || {
            vectors: {
                size: 768,
                distance: 'Cosine'
            }
        };
        
        const actualCollectionName = getUserCollectionName(username, name);
        await qdrantClient.createCollection(actualCollectionName, collectionConfig);
        
        res.json({ 
            message: 'Collection created successfully',
            name: name
        });
    } catch (error) {
        console.error('Error creating collection:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get collection info
router.get('/collections/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, name);
        
        const info = await qdrantClient.getCollection(actualCollectionName);
        res.json(info);
    } catch (error) {
        console.error('Error getting collection info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete collection
router.delete('/collections/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, name);
        
        await qdrantClient.deleteCollection(actualCollectionName);
        res.json({ 
            message: 'Collection deleted successfully',
            name: name
        });
    } catch (error) {
        console.error('Error deleting collection:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
