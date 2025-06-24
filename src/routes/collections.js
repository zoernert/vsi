const express = require('express');
const router = express.Router();
const qdrantClient = require('../config/qdrant'); // Remove destructuring - use direct import
const { authenticateToken } = require('../middleware/auth');

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
        console.log('Getting collections for user:', req.user.username);
        console.log('qdrantClient available methods:', Object.getOwnPropertyNames(qdrantClient).filter(name => typeof qdrantClient[name] === 'function').slice(0, 5));
        
        const allCollections = await qdrantClient.getCollections();
        const username = req.user.username;
        const userPrefix = `user_${username}_`;
        
        // Filter collections that belong to this user
        const userCollections = allCollections.collections
            .filter(collection => collection.name.startsWith(userPrefix))
            .map(collection => ({
                name: getOriginalCollectionName(username, collection.name),
                actualName: collection.name,
                vectors_count: collection.vectors_count || 0,
                status: collection.status || 'green'
            }));
        
        console.log(`Found ${userCollections.length} collections for user ${username}`);
        res.json({ collections: userCollections });
    } catch (error) {
        console.error('Collections route error:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message });
    }
});

// Create collection
router.put('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { vectors } = req.body;
        const username = req.user.username;
        
        // Create user-specific collection name
        const actualCollectionName = getUserCollectionName(username, name);
        
        await ensureCollectionExists(actualCollectionName, {
            vectors: vectors || {
                size: 768,
                distance: 'Cosine'
            }
        });
        
        res.json({ result: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get collection info
router.get('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, name);
        
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
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, name);
        
        await qdrantClient.deleteCollection(actualCollectionName);
        res.json({ result: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
