const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const qdrantClient = require('../config/qdrant');

const router = express.Router();

// Debug: Add logging to see what's being calledionsRoutes.js');
console.log('Collections routes loaded');qdrantClient);
console.log('qdrantClient type:', typeof qdrantClient); qdrantClient.getCollections);
console.log('qdrantClient.getCollections type:', typeof qdrantClient.getCollections);
console.log('Available qdrantClient methods sample:', 
    Object.getOwnPropertyNames(qdrantClient)q, res) => {
        .filter(name => typeof qdrantClient[name] === 'function')
        .slice(0, 10)e = req.user.username;
);      console.log(`Fetching collections for user: ${username}`);
        
// GET /collections - List all user collectionsed
router.get('/', authenticateToken, async (req, res) => {');
    try {onsole.log('qdrantClient methods available:', Object.getOwnPropertyNames(qdrantClient).filter(name => typeof qdrantClient[name] === 'function').slice(0, 5));
        const username = req.user.username;
        console.log(`Fetching collections for user: ${username}`);
        if (typeof qdrantClient.getCollections !== 'function') {
        // Double-check method availabilitylections is not a function!');
        if (typeof qdrantClient.getCollections !== 'function') {ent);
            console.error('qdrantClient constructor:', qdrantClient.constructor.name);
            console.error('Available methods:', Object.getOwnPropertyNames(qdrantClient).filter(name => typeof qdrantClient[name] === 'function'));
            
            return res.status(500).json({ 
                error: 'Qdrant client not properly initialized',
                details: 'getCollections method is not available',
                debug: {
                    clientType: typeof qdrantClient,
                    availableMethods: Object.getOwnPropertyNames(qdrantClient).filter(name => typeof qdrantClient[name] === 'function')
                }
            });
        }
        
        // Get all collections from Qdrant
        console.log('Calling qdrantClient.getCollections()...');
        const collectionsResponse = await qdrantClient.getCollections();
        console.log('Collections response received, type:', typeof collectionsResponse);
        console.log('Collections response keys:', Object.keys(collectionsResponse));
        
        const allCollections = collectionsResponse.collections || [];
        console.log(`Total collections found: ${allCollections.length}`);
        
        // Filter collections that belong to this user
        const userPrefix = `user_${username}_`;
        const userCollections = allCollections
            .filter(collection => collection.name.startsWith(userPrefix))
            .map(collection => ({
                name: collection.name.replace(userPrefix, ''), // Remove user prefix for display
                actualName: collection.name, // Keep actual name for API calls
                vectors_count: collection.vectors_count || 0,
                status: collection.status || 'green'
            }));
        
        console.log(`Found ${userCollections.length} collections for user ${username}`);
        
        res.json({
            collections: userCollections,
            count: userCollections.length
        });
        
    } catch (error) {
        console.error('Error in GET /collections:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);o debug the issue


















































module.exports = router;});    }        });            details: error.message             error: 'Failed to create collection',        res.status(500).json({         console.error('Error creating collection:', error);    } catch (error) {                }            });                error: `Collection '${name}' already exists`             res.status(409).json({         } else {            });                name: name                message: `Collection '${name}' created successfully`,                success: true,             res.json({             console.log(`Created new collection: ${actualCollectionName}`);        if (wasCreated) {                });            distance: 'Cosine'            size: 768,        const wasCreated = await qdrantClient.ensureCollection(actualCollectionName, {        // Create collection using helper function                const actualCollectionName = `user_${username}_${name}`;                }            return res.status(400).json({ error: 'Collection name is required' });        if (!name) {                const username = req.user.username;        const { name } = req.body;    try {router.post('/', authenticateToken, async (req, res) => {// Add more routes if needed...});    }        });            stack: error.stack            details: error.message,            error: 'Failed to fetch collections',        res.status(500).json({         router.get('/test', authenticateToken, async (req, res) => {
    try {
        console.log('Test endpoint called');
        console.log('qdrantClient:', !!qdrantClient);
        console.log('getCollections method:', typeof qdrantClient.getCollections);
        
        // Test direct call
        const result = await qdrantClient.getCollections();
        console.log('Direct getCollections call successful');
        
        res.json({
            success: true,
            message: 'Qdrant client is working',
            collections_count: result.collections?.length || 0,
            client_methods: Object.getOwnPropertyNames(qdrantClient).filter(name => typeof qdrantClient[name] === 'function').slice(0, 10)
        });
        
    } catch (error) {
        console.error('Test endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

module.exports = router;