console.log('🔥 INDEX.JS LOADING - NEW DEBUG VERSION');
console.log('🕐 Timestamp:', new Date().toISOString());

// ARCHITECTURAL NOTE: This file is in a transitional state.
// It currently contains a mix of old, monolithic route handlers and is not yet
// integrated with the new dependency injection container and controller/service
// architecture defined in /src/container, /src/controllers, etc.
// The final goal is to refactor this file to only handle server setup and
// route registration, delegating all business logic to the new architecture.

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
require('dotenv').config();

console.log('📦 Dependencies loaded successfully');

const app = express();

console.log('🚀 Express app created');

// Import services
const { DatabaseService } = require('./services/databaseService');
const { MigrationService } = require('./services/migrationService');
const { auth } = require('./middleware');
const uploadRoutes = require('./routes/uploadRoutes');
const searchRoutes = require('./routes/searchRoutes'); // Add this line
const adminRoutes = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const clusterRoutes = require('./routes/clusterRoutes');
const { QdrantService } = require('./services/qdrantService');
const { EmbeddingService } = require('./services/embeddingService');
const { GeminiService } = require('./services/geminiService');
const { v4: uuidv4 } = require('uuid');

// Initialize services
const db = new DatabaseService();
const migrations = new MigrationService();
const qdrant = new QdrantService();
const embeddingService = new EmbeddingService();
const gemini = new GeminiService();

// Initialize database on startup
async function initializeApp() {
    try {
        console.log('🔄 Initializing database connection...');
        await db.initialize();
        
        console.log('🔄 Running database migrations...');
        await migrations.runMigrations();
        console.log('✅ Database migrations completed');
        
        // Check and fix password hashes for existing users
        const usersWithoutHash = await db.getUsersWithoutPasswordHash();
        console.log(`Found ${usersWithoutHash.length} users without proper password hash`);
        
        for (const user of usersWithoutHash) {
            if (user.username === process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
                const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
                await db.fixUserPasswordHash(user.id, hash);
                console.log(`Fixed password hash for admin user: ${user.username}`);
            }
        }
        
        console.log('✅ Database initialization completed successfully');
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🔧 Basic middleware registered');

// Add comprehensive debugging middleware
app.use((req, res, next) => {
    console.log(`\n=== INCOMING REQUEST ${new Date().toISOString()} ===`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Path: ${req.path}`);
    console.log(`Headers:`, {
        'content-type': req.get('content-type'),
        'authorization': req.get('authorization') ? 'Bearer [present]' : 'none',
        'user-agent': req.get('user-agent')
    });
    console.log(`Query:`, req.query);
    console.log(`Params:`, req.params);
    console.log(`========================\n`);
    next();
});

console.log('🐛 Debug middleware registered');

// Helper function to get collection by UUID and verify ownership
async function getCollectionByIdOr404(collectionId, userId, clientOrDb = db) {
    const result = await clientOrDb.query(
        'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

// Auth routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.findUserByUsername(username);
        
        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, isAdmin: user.is_admin },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        try {
            await db.updateUser(user.id, { last_login: new Date() });
        } catch (updateError) {
            console.log('Failed to update last login:', updateError);
        }

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.is_admin,
                tier: user.tier
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        
        const user = await db.createUser(username, passwordHash, false, email);
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.message === 'Username already exists') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// User routes
app.get('/api/users/profile', auth, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                isAdmin: req.user.is_admin,
                tier: req.user.tier,
                createdAt: req.user.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/users/usage', auth, async (req, res) => {
    try {
        const tier = await db.getUserTier(req.user.id);
        const [collections, documents, searches, uploads] = await Promise.all([
            db.getCurrentUsage(req.user.id, 'collections'),
            db.getCurrentUsage(req.user.id, 'documents'),
            db.getCurrentUsage(req.user.id, 'searches'),
            db.getCurrentUsage(req.user.id, 'uploads')
        ]);

        const limits = {
            free: { collections: 5, documents: 100, searches: 50, uploads: 20 },
            pro: { collections: 50, documents: 10000, searches: 500, uploads: 200 },
            unlimited: { collections: -1, documents: -1, searches: -1, uploads: -1 }
        };

        const tierLimits = limits[tier] || limits.free;

        res.json({
            collections: { current: collections, limit: tierLimits.collections, percentage: 0 },
            documents: { current: documents, limit: tierLimits.documents, percentage: 0 },
            searches: { current: searches, limit: tierLimits.searches, percentage: 0 },
            uploads: { current: uploads, limit: tierLimits.uploads, percentage: 0 },
            tier: tier || 'free',
            billingPeriod: {
                start: '2025-05-31',
                end: '2025-06-29'
            }
        });
    } catch (error) {
        console.error('Usage error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Collections routes
app.get('/api/collections', auth, async (req, res) => {
    try {
        const includeStats = req.query.include_stats === 'true';
        
        if (includeStats) {
            // Get collections with enhanced stats
            const collectionsResult = await db.query(`
                SELECT 
                    c.*,
                    COUNT(d.id) as document_count,
                    COALESCE(SUM(LENGTH(d.content)), 0) as total_content_size,
                    CASE 
                        WHEN COUNT(d.id) > 0 THEN AVG(LENGTH(d.content))
                        ELSE 0 
                    END as avg_content_size,
                    MAX(d.updated_at) as last_document_update
                FROM collections c
                LEFT JOIN documents d ON c.id = d.collection_id
                WHERE c.user_id = $1
                GROUP BY c.id, c.name, c.description, c.user_id, c.qdrant_collection_name, c.created_at, c.updated_at
                ORDER BY c.updated_at DESC
            `, [req.user.id]);
            
            // Get chunk counts from Qdrant for each collection
            const collections = await Promise.all(collectionsResult.rows.map(async (collection) => {
                let chunksCount = 0;
                try {
                    console.log(`📊 Getting count for Qdrant collection: ${collection.qdrant_collection_name}`);
                    
                    // First check if collection exists in Qdrant
                    const collectionExists = await qdrant.collectionExists(collection.qdrant_collection_name);
                    if (!collectionExists) {
                        console.warn(`📊 Qdrant collection ${collection.qdrant_collection_name} does not exist`);
                        chunksCount = 0;
                    } else {
                        // Get the actual count from Qdrant
                        const countResult = await qdrant.count(collection.qdrant_collection_name);
                        chunksCount = countResult?.count || 0;
                        console.log(`📊 Qdrant collection ${collection.qdrant_collection_name} has ${chunksCount} chunks`);
                    }
                } catch (qdrantError) {
                    console.error(`❌ Failed to get chunk count for collection ${collection.qdrant_collection_name}:`, {
                        error: qdrantError.message,
                        status: qdrantError.status,
                        stack: qdrantError.stack
                    });
                    chunksCount = 0; // Fallback to 0 on error
                }
                
                return {
                    ...collection,
                    documentsCount: parseInt(collection.document_count) || 0,
                    chunksCount: chunksCount,
                    stats: {
                        totalContentSize: parseInt(collection.total_content_size) || 0,
                        avgContentSize: parseFloat(collection.avg_content_size) || 0,
                        lastUpdated: collection.last_document_update || collection.updated_at,
                        document_count: parseInt(collection.document_count) || 0,
                        total_content_size: parseInt(collection.total_content_size) || 0
                    }
                };
            }));
            
            console.log(`📊 Loaded ${collections.length} collections with stats`);
            res.json(collections);
        } else {
            // Simple collections without stats
            const result = await db.query('SELECT * FROM collections WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
            const collections = result.rows.map(collection => ({
                ...collection,
                documentsCount: 0,
                chunksCount: 0,
                stats: {
                    totalContentSize: 0,
                    avgContentSize: 0,
                    lastUpdated: collection.updated_at,
                    document_count: 0,
                    total_content_size: 0
                }
            }));
            res.json(collections);
        }
    } catch (error) {
        console.error('Collections error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/collections/:id', auth, async (req, res) => {
    try {
        const collectionId = req.params.id;
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        res.json(collection);
    } catch (error) {
        console.error('Collection fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/collections/:id/documents', auth, async (req, res) => {
    console.log(`📋 Loading documents for collection ${req.params.id}`);
    try {
        const collectionId = req.params.id;
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Get documents with optional type filter
        const typeFilter = req.query.type;
        let documentsQuery = 'SELECT * FROM documents WHERE collection_id = $1';
        let queryParams = [collectionId];
        
        if (typeFilter) {
            documentsQuery += ' AND file_type = $2';
            queryParams.push(typeFilter);
        }
        
        documentsQuery += ' ORDER BY created_at DESC';
        
        const documentsResult = await db.query(documentsQuery, queryParams);
        
        // Format documents for frontend
        const documents = documentsResult.rows.map(doc => ({
            id: doc.id,
            filename: doc.filename,
            fileType: doc.file_type,
            contentPreview: doc.content_preview,
            qdrantPointId: doc.qdrant_point_id,
            collectionId: doc.collection_id,
            createdAt: doc.created_at,
            updatedAt: doc.updated_at
        }));
        
        console.log(`📄 Found ${documents.length} documents in collection ${collectionId}`);
        
        res.json({
            success: true,
            data: documents
        });
    } catch (error) {
        console.error('Documents error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Search routes
app.post('/api/collections/:id/search', auth, async (req, res) => {
    console.log(`🔍 Search request for collection ${req.params.id}`);
    try {
        const collectionId = req.params.id;
        const { query, limit = 10, threshold = 0.5 } = req.body;
        
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Generate embedding for search query
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        
        // Search in Qdrant
        const searchResults = await qdrant.searchPoints(
            collection.qdrant_collection_name,
            queryEmbedding,
            parseInt(limit),
            parseFloat(threshold)
        );
        
        // Format results
        const results = searchResults.map(result => ({
            id: result.id,
            filename: result.payload.filename,
            content: result.payload.text,
            contentPreview: result.payload.text.substring(0, 200) + '...',
            fileType: result.payload.file_type,
            similarity: result.score,
            chunkIndex: result.payload.chunk_index
        }));
        
        console.log(`📄 Found ${results.length} search results`);
        
        res.json({
            success: true,
            data: {
                results,
                query,
                total: results.length
            }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// AI Chat endpoint
app.post('/api/collections/:id/ask', auth, async (req, res) => {
    console.log(`🤖 AI chat request for collection ${req.params.id}`);
    try {
        const collectionId = req.params.id;
        const { question, systemPrompt, maxResults = 5 } = req.body;
        
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Generate embedding for question
        const questionEmbedding = await embeddingService.generateEmbedding(question);
        
        // Search for relevant context
        const searchResults = await qdrant.searchPoints(
            collection.qdrant_collection_name,
            questionEmbedding,
            parseInt(maxResults),
            0.3
        );
        
        // Prepare context from search results
        const context = searchResults.map(result => result.payload.text).join('\n\n');
        
        // Prepare sources for response
        const sources = searchResults.map(result => ({
            id: result.id,
            filename: result.payload.filename,
            similarity: result.score
        }));
        
        // Generate AI response using Gemini
        const defaultSystemPrompt = `You are a helpful assistant that answers questions based on the provided context. 
If the context doesn't contain enough information to answer the question, say so clearly.
Always base your answers on the provided context.`;
        
        const answer = await gemini.generateResponse(
            systemPrompt || defaultSystemPrompt,
            question,
            context
        );
        
        console.log(`🎯 Generated Gemini AI response with ${sources.length} sources`);
        
        res.json({
            success: true,
            data: {
                answer,
                sources,
                contextUsed: context.length > 0,
                retrievedContext: searchResults.map(r => r.payload.text),
                aiProvider: 'gemini'
            }
        });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({ success: false, message: 'AI chat failed' });
    }
});

// Global search endpoint
app.get('/api/search', auth, async (req, res) => {
    try {
        const { q: query, limit = 10, threshold = 0.5 } = req.query;
        
        if (!query) {
            return res.status(400).json({ success: false, message: 'Query parameter required' });
        }
        
        // Get user's collections
        const collectionsResult = await db.query(
            'SELECT * FROM collections WHERE user_id = $1',
            [req.user.id]
        );
        
        const collections = collectionsResult.rows;
        const allResults = [];
        
        // Generate embedding for search query
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        
        // Search across all user collections
        for (const collection of collections) {
            try {
                const searchResults = await qdrant.searchPoints(
                    collection.qdrant_collection_name,
                    queryEmbedding,
                    parseInt(limit),
                    parseFloat(threshold)
                );
                
                // Add collection info to results
                const formattedResults = searchResults.map(result => ({
                    id: result.id,
                    filename: result.payload.filename,
                    contentPreview: result.payload.text.substring(0, 200) + '...',
                    fileType: result.payload.file_type,
                    similarity: result.score,
                    collectionId: collection.id,
                    collectionName: collection.name
                }));
                
                allResults.push(...formattedResults);
            } catch (searchError) {
                console.warn(`Failed to search collection ${collection.name}:`, searchError.message);
            }
        }
        
        // Sort by similarity and limit results
        allResults.sort((a, b) => b.similarity - a.similarity);
        const limitedResults = allResults.slice(0, parseInt(limit));
        
        console.log(`🌐 Global search found ${limitedResults.length} results`);
        
        res.json({
            success: true,
            data: {
                results: limitedResults,
                query,
                total: limitedResults.length
            }
        });
    } catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// Collection creation endpoint
app.post('/api/collections', auth, async (req, res) => {
    const client = await db.getClient(); // Use a transaction for atomicity
    try {
        await client.query('BEGIN');
        
        const { name, description = '' } = req.body;
        if (!name || name.trim().length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Collection name is required' });
        }

        // 1. Insert collection without qdrant_collection_name to get UUID
        const result = await client.query(
            'INSERT INTO collections (name, description, user_id) VALUES ($1, $2, $3) RETURNING *',
            [name.trim(), description.trim(), req.user.id]
        );
        const collection = result.rows[0];

        // 2. Generate qdrant_collection_name using the UUID
        const qdrantCollectionName = `collection_${collection.id}`;

        // 3. Update the collection with the Qdrant collection name
        await client.query(
            'UPDATE collections SET qdrant_collection_name = $1 WHERE id = $2',
            [qdrantCollectionName, collection.id]
        );

        // 4. Create collection in Qdrant with proper vector configuration
        try {
            // Get the correct vector size for the embedding model
            const vectorSize = await embeddingService.getVectorSize();
            console.log(`Creating Qdrant collection: ${qdrantCollectionName} with vector size:`, vectorSize);
            console.log(`Vector size type:`, typeof vectorSize);
            await qdrant.createCollection(qdrantCollectionName, vectorSize);
            console.log(`✅ Created Qdrant collection: ${qdrantCollectionName} with vector size ${vectorSize}`);
        } catch (qdrantError) {
            console.error('❌ Failed to create Qdrant collection:', qdrantError.message);
            await client.query('ROLLBACK');
            return res.status(500).json({
                success: false,
                message: 'Failed to create vector collection',
                error: qdrantError.message
            });
        }

        await client.query('COMMIT');
        
        console.log(`✅ Created collection: ${name} (UUID: ${collection.id}, Qdrant: ${qdrantCollectionName})`);

        // 5. Return the updated collection
        const updatedCollection = {
            ...collection,
            qdrant_collection_name: qdrantCollectionName
        };

        res.status(201).json({
            success: true,
            data: updatedCollection,
            message: 'Collection created successfully'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Collection creation error:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'Collection name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create collection' });
    } finally {
        client.release();
    }
});

// Collection deletion endpoint
app.delete('/api/collections/:id', auth, async (req, res) => {
    console.log(`🗑️ Delete collection request for ID: ${req.params.id}`);
    try {
        const collectionId = req.params.id;
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        try {
            // Delete the Qdrant collection
            await qdrant.deleteCollection(collection.qdrant_collection_name);
            console.log(`✅ Deleted Qdrant collection: ${collection.qdrant_collection_name}`);
        } catch (qdrantError) {
            console.warn(`⚠️ Failed to delete Qdrant collection: ${qdrantError.message}`);
            // Continue with database deletion even if Qdrant fails
        }
        
        // Delete all documents in the collection (cascade should handle this, but be explicit)
        await db.query('DELETE FROM documents WHERE collection_id = $1', [collectionId]);
        
        // Delete the collection from database
        await db.query('DELETE FROM collections WHERE id = $1', [collectionId]);
        
        console.log(`✅ Deleted collection ${collection.name} (ID: ${collectionId})`);
        
        res.json({
            success: true,
            message: 'Collection deleted successfully'
        });
    } catch (error) {
        console.error('Collection deletion error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete collection' });
    }
});

// Document deletion endpoint
app.delete('/api/collections/:collectionId/documents/:documentId', auth, async (req, res) => {
    console.log(`🗑️ Delete document request: Collection ${req.params.collectionId}, Document ${req.params.documentId}`);
    try {
        const collectionId = req.params.collectionId;
        const documentId = parseInt(req.params.documentId);
        
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Get document info
        const documentResult = await db.query(
            'SELECT * FROM documents WHERE id = $1 AND collection_id = $2',
            [documentId, collectionId]
        );
        
        if (documentResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const document = documentResult.rows[0];
        
        // Delete related vector points from Qdrant
        try {
            console.log(`🔍 Finding vector points for document ID: ${documentId}`);
            // Use scroll API with a filter to get all points for the document
            const scrollResponse = await qdrant.client.scroll(collection.qdrant_collection_name, {
                filter: {
                    must: [
                        {
                            key: 'document_id',
                            match: {
                                value: documentId
                            }
                        }
                    ]
                },
                limit: 10000, // A high limit to get all chunks for a document
                with_payload: false,
                with_vector: false
            });

            const pointIdsToDelete = scrollResponse.points.map(point => point.id);

            if (pointIdsToDelete.length > 0) {
                console.log(`🗑️ Found ${pointIdsToDelete.length} vector points to delete for document ${document.filename}`);
                
                // Assuming a batch delete method exists on the qdrant service wrapper
                await qdrant.deletePoints(collection.qdrant_collection_name, pointIdsToDelete);
                console.log(`✅ Deleted ${pointIdsToDelete.length} vector points from Qdrant.`);

            } else {
                console.log(`🤷 No vector points found for document ID ${documentId}. Nothing to delete from Qdrant.`);
            }
        } catch (qdrantError) {
            console.warn(`⚠️ Failed to delete vector data for document: ${qdrantError.message}`);
            // Continue with database deletion even if Qdrant fails
        }
        
        // Delete document from database
        await db.query('DELETE FROM documents WHERE id = $1', [documentId]);
        
        console.log(`✅ Deleted document ${document.filename} (ID: ${documentId})`);
        
        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        console.error('Document deletion error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document' });
    }
});

// Create text document endpoint
app.post('/api/collections/:id/documents/create-text', auth, async (req, res) => {
    console.log(`📝 Create text document request for collection ${req.params.id}`);
    const client = await db.getClient(); // Use a transaction
    try {
        await client.query('BEGIN');

        const collectionId = req.params.id;
        const { title, content, type = 'txt' } = req.body;
        
        if (!title || !content) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: 'Title and content are required' 
            });
        }
        
        const collection = await getCollectionByIdOr404(collectionId, req.user.id, client);
        if (!collection) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Create filename from title
        const filename = `${title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_')}.${type}`;
        
        // Generate preview from content
        const preview = content.length > 500 
            ? content.substring(0, 500) + '...' 
            : content;

        // 1. Insert document metadata into database first to get an ID
        const insertResult = await client.query(
            `INSERT INTO documents 
                (filename, file_type, collection_id, collection_uuid, created_at, updated_at, content_preview, content) 
             VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6)
             RETURNING id`,
            [filename, type, collection.id, collection.uuid, preview, content]
        );
        const document = insertResult.rows[0];
        console.log(`📄 Created preliminary document record with ID: ${document.id}`);

        // Process the text content for vector storage
        let chunksStored = 0;
        let chunksSkipped = 0;
        let firstPointId = null;
        
        // Create chunks from the text
        let chunks;
        if (content.length > 10000) {
            console.log(`📚 Large text document (${content.length} chars), using recursive chunking`);
            chunks = embeddingService.recursiveChunkText(content, 4000, 1000);
        } else {
            console.log(`📄 Standard text document, using regular chunking`);
            chunks = embeddingService.chunkText(content, 4000, 1000);
        }
        
        console.log(`📝 Created ${chunks.length} text chunks`);
        
        // Get the correct vector size for the embedding model
        const vectorSize = await embeddingService.getVectorSize();
        
        // Check if Qdrant collection exists, create if needed
        try {
            console.log(`Checking if Qdrant collection exists: ${collection.qdrant_collection_name}`);
            
            // First check if collection exists
            const exists = await qdrant.collectionExists(collection.qdrant_collection_name);
            console.log(`Collection ${collection.qdrant_collection_name} exists: ${exists}`);
            
            if (!exists) {
                console.log(`Creating missing Qdrant collection: ${collection.qdrant_collection_name} with vector size: ${vectorSize}`);
                await qdrant.createCollection(collection.qdrant_collection_name, vectorSize);
                console.log(`✅ Qdrant collection created: ${collection.qdrant_collection_name}`);
            } else {
                console.log(`✅ Qdrant collection already exists: ${collection.qdrant_collection_name}`);
            }
        } catch (collectionError) {
            console.error('❌ Failed to create/verify Qdrant collection:', {
                collection: collection.qdrant_collection_name,
                error: collectionError.message,
                stack: collectionError.stack
            });
            await client.query('ROLLBACK');
            return res.status(500).json({
                success: false,
                message: 'Failed to create vector collection',
                error: collectionError.message
            });
        }
        
        // Generate embeddings and store in Qdrant
        if (chunks.length > 0) {
            try {
                console.log(`🧮 Generating embeddings for ${chunks.length} chunks...`);
                
                const batchSize = 5;
                const allPoints = [];
                
                for (let i = 0; i < chunks.length; i += batchSize) {
                    const batchChunks = chunks.slice(i, i + batchSize);
                    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}: ${batchChunks.length} chunks`);
                    
                    const chunkEmbeddings = await embeddingService.generateEmbeddings(batchChunks);
                    
                    const batchPoints = batchChunks.map((chunk, batchIndex) => ({
                        id: uuidv4(),
                        vector: chunkEmbeddings[batchIndex],
                        payload: {
                            text: chunk,
                            filename: filename,
                            document_id: document.id, // Link point to document
                            collection_id: collection.id,
                            chunk_index: i + batchIndex,
                            chunk_total: chunks.length,
                            file_type: type,
                            chunk_size: chunk.length,
                            created_at: new Date().toISOString(),
                            document_type: 'text_created'
                        }
                    }));
                    
                    allPoints.push(...batchPoints);
                    
                    if (i + batchSize < chunks.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                
                firstPointId = allPoints.length > 0 ? allPoints[0].id : null;

                console.log(`📤 Storing ${allPoints.length} points in Qdrant...`);
                try {
                    await qdrant.upsertPoints(collection.qdrant_collection_name, allPoints);
                    chunksStored = allPoints.length;
                    console.log(`✅ Stored ${chunksStored} chunks in Qdrant`);
                } catch (upsertError) {
                    console.error('❌ Failed to store points in Qdrant:', upsertError.message);
                    chunksSkipped = chunks.length;
                    console.log('⚠️  Continuing with document creation despite vector storage failure');
                }
            } catch (embeddingError) {
                console.error('❌ Failed to process embeddings:', embeddingError.message);
                chunksSkipped = chunks.length;
            }
        }
        
        // 2. Update the document with the qdrant_point_id of the first chunk
        if (firstPointId) {
            await client.query(
                `UPDATE documents SET qdrant_point_id = $1 WHERE id = $2`,
                [firstPointId, document.id]
            );
            console.log(`🔗 Linked document ${document.id} to Qdrant point ${firstPointId}`);
        }

        await client.query('COMMIT');
        
        console.log(`✅ Created text document with ID: ${document.id}`);
        
        res.json({
            success: true,
            message: 'Text document created successfully',
            document: {
                id: document.id,
                filename: filename,
                fileType: type,
                contentPreview: preview,
                collectionId: collection.id,
            },
            collection: collection.name,
            chunksStored,
            chunksSkipped,
            totalChunks: chunks.length,
            processingMethod: content.length > 10000 ? 'recursive' : 'standard',
            contentLength: content.length
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Create text document error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create text document',
            error: error.message 
        });
    } finally {
        client.release();
    }
});

// Upload URL endpoint
app.post('/api/collections/:id/documents/upload-url', auth, async (req, res) => {
    console.log(`🌐 Upload from URL request for collection ${req.params.id}`);
    try {
        const collectionId = req.params.id;
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ 
                success: false, 
                message: 'URL is required' 
            });
        }
        
        const collection = await getCollectionByIdOr404(collectionId, req.user.id);
        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // Placeholder for actual implementation
        // In a full implementation, you would:
        // 1. Use a library like axios or node-fetch to get the URL content.
        // 2. Use a library like cheerio to parse HTML or a text extractor for PDFs.
        // 3. Process the extracted text just like in the 'create-text' endpoint.
        console.log(`TODO: Implement content fetching for URL: ${url}`);
        
        res.status(501).json({
            success: false,
            message: 'URL upload functionality is not yet fully implemented.',
            note: 'This feature requires a backend job to fetch, parse, and process remote content.'
        });
    } catch (error) {
        console.error('❌ Upload URL error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to process upload from URL request.',
            error: error.message 
        });
    }
});

// File upload endpoint
app.post('/api/collections/:id/documents/upload', auth, uploadMiddleware.single('file'), async (req, res) => {
    const startTime = Date.now();
    console.log(`📤 File upload request for collection ${req.params.id}`);
    
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        
        const collectionId = parseInt(req.params.id);
        
        if (!req.file) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Verify user owns the collection
        const collectionResult = await client.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Collection not found'
            });
        }
        
        const collection = collectionResult.rows[0];
        
        // Extract text from file using DocumentProcessor
        const processor = new DocumentProcessor();
        let extractedText = '';
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        
        try {
            console.log(`📄 Processing ${fileExtension} file: ${req.file.originalname}`);
            
            if (fileExtension === '.pdf') {
                extractedText = await processor.extractFromPDF(req.file.path);
            } else if (['.doc', '.docx'].includes(fileExtension)) {
                extractedText = await processor.extractFromWord(req.file.path);
            } else if (['.txt', '.md'].includes(fileExtension)) {
                extractedText = await processor.extractFromText(req.file.path);
            } else {
                throw new Error(`Unsupported file type: ${fileExtension}`);
            }
            
            if (!extractedText || extractedText.trim().length === 0) {
                throw new Error('No text content could be extracted from the file');
            }
            
            console.log(`✅ Extracted ${extractedText.length} characters from ${req.file.originalname}`);
            
        } catch (extractError) {
            console.error(`❌ Text extraction failed:`, extractError.message);
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Failed to extract text from file: ${extractError.message}`
            });
        }

        // Generate preview from content
        const preview = extractedText.length > 500 
            ? extractedText.substring(0, 500) + '...' 
            : extractedText;

        // Insert document metadata into database
        const insertResult = await client.query(
            `INSERT INTO documents 
                (filename, file_type, collection_id, collection_uuid, created_at, updated_at, content_preview, content) 
             VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6)
             RETURNING id`,
            [req.file.originalname, fileExtension.substring(1), collection.id, collection.uuid, preview, extractedText]
        );
        const document = insertResult.rows[0];
        
        console.log(`📄 Created document record with ID: ${document.id}`);

        // Process the text content for vector storage
        const embeddingService = new EmbeddingService();
        const qdrant = new QdrantService();
        
        let chunksStored = 0;
        let chunksSkipped = 0;
        let firstPointId = null;
        
        // Create chunks from the text
        let chunks;
        if (extractedText.length > 10000) {
            console.log(`📚 Large document (${extractedText.length} chars), using recursive chunking`);
            chunks = embeddingService.recursiveChunkText(extractedText, 4000, 1000);
        } else {
            console.log(`📄 Standard document, using regular chunking`);
            chunks = embeddingService.chunkText(extractedText, 4000, 1000);
        }
        
        console.log(`📝 Created ${chunks.length} text chunks`);
        
        // Get the correct vector size for the embedding model
        const vectorSize = await embeddingService.getVectorSize();
        
        // Ensure Qdrant collection exists with correct vector size
        try {
            await qdrant.createCollection(collection.qdrant_collection_name, vectorSize);
        } catch (collectionError) {
            console.error('❌ Failed to create/verify Qdrant collection:', collectionError.message);
        }
        
        // Generate embeddings and store in Qdrant
        if (chunks.length > 0) {
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                try {
                    const embedding = await embeddingService.generateEmbedding(chunk);
                    const pointId = `${document.id}_chunk_${i}`;
                    
                    if (i === 0) firstPointId = pointId;
                    
                    await qdrant.upsertPoint(collection.qdrant_collection_name, {
                        id: pointId,
                        vector: embedding,
                        payload: {
                            document_id: document.id,
                            text: chunk,
                            filename: req.file.originalname,
                            file_type: fileExtension.substring(1),
                            chunk_index: i,
                            collection_id: collection.id
                        }
                    });
                    
                    chunksStored++;
                } catch (chunkError) {
                    console.error(`❌ Failed to process chunk ${i}:`, chunkError.message);
                    chunksSkipped++;
                }
            }
        }
        
        // Update the document with the qdrant_point_id of the first chunk
        if (firstPointId) {
            await client.query(
                'UPDATE documents SET qdrant_point_id = $1 WHERE id = $2',
                [firstPointId, document.id]
            );
        }

        await client.query('COMMIT');
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Document processing completed in ${processingTime}ms`);
        
        res.json({
            success: true,
            message: 'Document processed successfully',
            document: {
                id: document.id,
                filename: req.file.originalname,
                file_type: fileExtension.substring(1),
                collection_id: collection.id
            },
            chunksStored,
            totalChunks: chunks.length,
            processingTime
        });

        // Clean up uploaded file
        try {
            await fs.unlink(req.file.path);
        } catch (unlinkError) {
            console.warn('Failed to delete temporary file:', unlinkError.message);
        }
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ File upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process file upload',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// Upload routes - Add debugging before registration
console.log('📁 Registering upload routes...');
app.use('/api', (req, res, next) => {
    console.log(`🔍 Upload middleware hit: ${req.method} ${req.url}`);
    next();
}, uploadRoutes);
console.log('✅ Upload routes registered');

// Search routes - Add new search routes
console.log('🔍 Registering search routes...');
app.use('/api', searchRoutes);
console.log('✅ Search routes registered');

// Admin routes - Mount admin functionality
console.log('👑 Registering admin routes...');
app.use('/api/admin', adminRoutes);
console.log('✅ Admin routes registered');

// Analytics routes - Mount analytics under admin
console.log('📊 Registering analytics routes...');
app.use('/api/admin/analytics', analyticsRoutes);
console.log('✅ Analytics routes registered');

// Cluster routes - Mount cluster management
console.log('🗂️ Registering cluster routes...');
app.use('/api/clusters', clusterRoutes);
console.log('✅ Cluster routes registered');

// Health check - Must be before catch-all route
app.get('/api/health', (req, res) => {
    console.log('💚 Health check endpoint hit');
    res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Serve static files - This should come after all API routes
app.use(express.static(path.join(__dirname, '../public')));

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Debug: List all registered routes
app._router.stack.forEach((middleware, index) => {
    if (middleware.route) {
        console.log(`Route ${index}: ${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
        console.log(`Router ${index}: ${middleware.regexp}`);
        if (middleware.handle && middleware.handle.stack) {
            middleware.handle.stack.forEach((handler, subIndex) => {
                if (handler.route) {
                    console.log(`  Sub-route ${subIndex}: ${Object.keys(handler.route.methods)} ${handler.route.path}`);
                }
            });
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;

// Initialize app and start server
initializeApp().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});