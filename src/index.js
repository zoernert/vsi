console.log('🔥 INDEX.JS LOADING - NEW DEBUG VERSION');
console.log('🕐 Timestamp:', new Date().toISOString());

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
        await db.initialize();
        await migrations.runMigrations();
        
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
        
        console.log('All users have proper password hashes');
    } catch (error) {
        console.error('Failed to initialize app:', error);
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

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

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
        
        const user = await db.createUser(username, passwordHash, false);
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
        const result = await db.query('SELECT * FROM collections WHERE user_id = $1', [req.user.id]);
        const collections = result.rows.map(collection => ({
            ...collection,
            document_count: "0",
            stats: {
                document_count: "0",
                total_content_size: null,
                avg_content_size: null,
                last_updated: null
            }
        }));
        res.json(collections);
    } catch (error) {
        console.error('Collections error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/collections/:id', auth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/collections/:id/documents', auth, async (req, res) => {
    console.log(`📋 Loading documents for collection ${req.params.id}`);
    try {
        const collectionId = parseInt(req.params.id);
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
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
        const collectionId = parseInt(req.params.id);
        const { query, limit = 10, threshold = 0.5 } = req.body;
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        const collection = collectionResult.rows[0];
        
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
        const collectionId = parseInt(req.params.id);
        const { question, systemPrompt, maxResults = 5 } = req.body;
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        const collection = collectionResult.rows[0];
        
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
    try {
        const { name, description = '' } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Collection name is required' });
        }
        
        // Generate unique Qdrant collection name
        const qdrantCollectionName = `user_${req.user.id}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
        
        // Create collection in database
        const result = await db.query(
            'INSERT INTO collections (name, description, user_id, qdrant_collection_name) VALUES ($1, $2, $3, $4) RETURNING *',
            [name.trim(), description.trim(), req.user.id, qdrantCollectionName]
        );
        
        const collection = result.rows[0];
        
        // Create collection in Qdrant
        await qdrant.createCollection(qdrantCollectionName);
        
        console.log(`✅ Created collection: ${name} (Qdrant: ${qdrantCollectionName})`);
        
        res.status(201).json({
            success: true,
            data: collection,
            message: 'Collection created successfully'
        });
    } catch (error) {
        console.error('Collection creation error:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'Collection name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create collection' });
    }
});

// Collection deletion endpoint
app.delete('/api/collections/:id', auth, async (req, res) => {
    console.log(`🗑️ Delete collection request for ID: ${req.params.id}`);
    try {
        const collectionId = parseInt(req.params.id);
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        const collection = collectionResult.rows[0];
        
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
        const collectionId = parseInt(req.params.collectionId);
        const documentId = parseInt(req.params.documentId);
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
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
        const collection = collectionResult.rows[0];
        
        // Delete related vector points from Qdrant
        try {
            // Search for all points related to this document
            const queryEmbedding = await embeddingService.generateEmbedding(document.filename);
            const relatedPoints = await qdrant.searchPoints(
                collection.qdrant_collection_name,
                queryEmbedding,
                100, // Get more results to find all chunks
                0.0  // Very low threshold to get all chunks
            );
            
            // Filter points that belong to this specific document
            const documentPoints = relatedPoints.filter(point => 
                point.payload.filename === document.filename
            );
            
            if (documentPoints.length > 0) {
                console.log(`🗑️ Found ${documentPoints.length} vector points to delete for document ${document.filename}`);
                
                // Delete each point individually (Qdrant doesn't have batch delete by filter)
                for (const point of documentPoints) {
                    try {
                        await qdrant.client.delete(`/collections/${collection.qdrant_collection_name}/points/${point.id}`);
                    } catch (deleteError) {
                        console.warn(`⚠️ Failed to delete vector point ${point.id}:`, deleteError.message);
                    }
                }
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
    try {
        const collectionId = parseInt(req.params.id);
        const { title, content, type = 'txt' } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ 
                success: false, 
                message: 'Title and content are required' 
            });
        }
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        const collection = collectionResult.rows[0];
        
        // Create filename from title
        const filename = `${title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_')}.${type}`;
        
        // Process the text content for vector storage
        let chunksStored = 0;
        let chunksSkipped = 0;
        
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
        
        // Ensure Qdrant collection exists with correct vector size
        try {
            const collectionResult = await qdrant.createCollection(collection.qdrant_collection_name, vectorSize);
            console.log(`📁 Collection creation result:`, collectionResult);
        } catch (collectionError) {
            console.error('❌ Failed to create/verify Qdrant collection:', collectionError.message);
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
                
                // Process in batches
                const batchSize = 5;
                const allPoints = [];
                
                for (let i = 0; i < chunks.length; i += batchSize) {
                    const batchChunks = chunks.slice(i, i + batchSize);
                    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}: ${batchChunks.length} chunks`);
                    
                    const chunkEmbeddings = await embeddingService.generateEmbeddings(batchChunks);
                    
                    // Prepare points for this batch
                    const batchPoints = batchChunks.map((chunk, batchIndex) => ({
                        id: uuidv4(),
                        vector: chunkEmbeddings[batchIndex],
                        payload: {
                            text: chunk,
                            filename: filename,
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
                    
                    // Delay between batches for rate limiting
                    if (i + batchSize < chunks.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                
                // Store all points in Qdrant
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
        
        // Generate preview from content
        const preview = content.length > 500 
            ? content.substring(0, 500) + '...' 
            : content;
        
        // Insert document metadata into database
        const insertResult = await db.query(
            `INSERT INTO documents 
                (filename, file_type, collection_id, created_at, updated_at, content_preview, content) 
             VALUES ($1, $2, $3, NOW(), NOW(), $4, $5)
             RETURNING id, filename, file_type, collection_id, created_at, updated_at`,
            [
                filename,
                type,
                collection.id,
                preview,
                content
            ]
        );
        
        const document = insertResult.rows[0];
        
        console.log(`✅ Created text document with ID: ${document.id}`);
        
        res.json({
            success: true,
            message: 'Text document created successfully',
            document: {
                id: document.id,
                filename: document.filename,
                fileType: document.file_type,
                contentPreview: preview,
                collectionId: document.collection_id,
                createdAt: document.created_at,
                updatedAt: document.updated_at
            },
            collection: collection.name,
            chunksStored,
            chunksSkipped,
            totalChunks: chunks.length,
            processingMethod: content.length > 10000 ? 'recursive' : 'standard',
            contentLength: content.length
        });
    } catch (error) {
        console.error('❌ Create text document error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create text document',
            error: error.message 
        });
    }
});

// Upload URL endpoint
app.post('/api/collections/:id/documents/upload-url', auth, async (req, res) => {
    console.log(`🌐 Upload from URL request for collection ${req.params.id}`);
    try {
        const collectionId = parseInt(req.params.id);
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ 
                success: false, 
                message: 'URL is required' 
            });
        }
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        // For now, return a placeholder response
        // In a full implementation, you would fetch the URL content and process it
        res.json({
            success: false,
            message: 'URL upload functionality not yet implemented',
            note: 'This feature requires additional implementation for fetching and processing remote content'
        });
    } catch (error) {
        console.error('❌ Upload URL error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload from URL',
            error: error.message 
        });
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

// Health check
app.get('/api/health', (req, res) => {
    console.log('💚 Health check endpoint hit');
    res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
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

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
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