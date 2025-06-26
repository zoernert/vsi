const express = require('express');
const multer = require('multer');
const { DatabaseService } = require('../services/databaseService');
const { auth } = require('../middleware');
const { QdrantService } = require('../services/qdrantService');
const { EmbeddingService } = require('../services/embeddingService');
const { DocumentProcessor } = require('../services/documentProcessor');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const router = express.Router();

console.log('🔧 Initializing upload routes module...');

const upload = multer({ dest: 'uploads/' });
const db = new DatabaseService();
const qdrant = new QdrantService();
const embeddings = new EmbeddingService();
const processor = new DocumentProcessor();

// Initialize database connection
db.initialize().catch(console.error);

console.log('📋 Registering POST /upload/:collection route...');

router.post('/upload/:collection', (req, res, next) => {
    console.log(`\n🚀 UPLOAD ROUTE HIT!`);
    console.log(`Collection param: ${req.params.collection}`);
    console.log(`User from auth: ${req.user ? req.user.id : 'NO USER'}`);
    console.log(`Content-Type: ${req.get('content-type')}`);
    console.log(`File present: ${!!req.file}`);
    next();
}, auth, upload.single('file'), async (req, res) => {
    const collectionId = req.params.collection;
    console.log(`\n📤 PROCESSING UPLOAD:`);
    console.log(`Collection ID: ${collectionId}`);
    console.log(`User ID: ${req.user?.id}`);
    console.log(`File info:`, req.file ? {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path
    } : 'NO FILE');
    
    try {
        // Ensure user owns the collection
        const result = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [parseInt(collectionId), req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: `Collection with ID ${collectionId} not found or access denied` 
            });
        }
        const collection = result.rows[0];

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        console.log(`File uploaded: ${req.file.originalname}, size: ${req.file.size}`);

        // Extract text content from file with enhanced support checking
        let extractedText = '';
        let chunksStored = 0;
        let chunksSkipped = 0;

        // Use enhanced support checking that considers both extension and MIME type
        const isSupported = processor.isSupportedAdvanced(req.file.path, req.file.mimetype);
        
        if (isSupported) {
            try {
                console.log(`🔄 Attempting text extraction from supported file type...`);
                extractedText = await processor.extractText(req.file.path, req.file.mimetype);
                console.log(`✅ Successfully extracted ${extractedText.length} characters from document`);
                
                // Analyze document structure
                const analysis = processor.analyzeDocumentStructure(extractedText);
                console.log(`📊 Document analysis:`, analysis);
                
            } catch (extractError) {
                console.error('❌ Failed to extract text:', extractError.message);
                console.error('❌ Extract error stack:', extractError.stack);
                extractedText = `Content extraction failed for file: ${req.file.originalname}. Error: ${extractError.message}`;
            }
        } else {
            console.log(`⚠️  Unsupported file type, storing metadata only`);
            console.log(`   File extension: ${path.extname(req.file.originalname)}`);
            console.log(`   MIME type: ${req.file.mimetype}`);
            extractedText = `Uploaded file: ${req.file.originalname} (unsupported type)`;
        }

        // Create chunks using recursive chunking for large documents
        let chunks;
        if (extractedText.length > 10000) {
            console.log(`📚 Large document detected (${extractedText.length} chars), using recursive chunking`);
            chunks = embeddings.recursiveChunkText(extractedText, 4000, 1000);
        } else {
            console.log(`📄 Standard document, using regular chunking`);
            chunks = embeddings.chunkText(extractedText, 4000, 1000);
        }
        
        console.log(`📝 Created ${chunks.length} text chunks with 4000 char size and 1000 char overlap`);

        // Get the correct vector size for the embedding model
        const vectorSize = await embeddings.getVectorSize();
        console.log(`📏 Using vector size: ${vectorSize} for collection creation`);

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

        // Generate embeddings and store in Qdrant with batch processing
        if (chunks.length > 0) {
            try {
                console.log(`🧮 Generating embeddings for ${chunks.length} chunks...`);
                
                // Process in batches to avoid memory issues and rate limits
                const batchSize = 5; // Reduced batch size for Gemini API
                const allPoints = [];
                
                for (let i = 0; i < chunks.length; i += batchSize) {
                    const batchChunks = chunks.slice(i, i + batchSize);
                    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}: ${batchChunks.length} chunks`);
                    
                    const chunkEmbeddings = await embeddings.generateEmbeddings(batchChunks);
                    
                    // Verify embedding dimensions
                    if (chunkEmbeddings.length > 0) {
                        const embeddingSize = chunkEmbeddings[0].length;
                        console.log(`✅ Generated embeddings with ${embeddingSize} dimensions`);
                        
                        if (embeddingSize !== vectorSize) {
                            console.warn(`⚠️  Warning: Embedding size (${embeddingSize}) doesn't match expected vector size (${vectorSize})`);
                        }
                    }
                    
                    // Prepare points for this batch
                    const batchPoints = batchChunks.map((chunk, batchIndex) => ({
                        id: uuidv4(),
                        vector: chunkEmbeddings[batchIndex],
                        payload: {
                            text: chunk,
                            filename: req.file.originalname,
                            collection_id: collection.id,
                            chunk_index: i + batchIndex,
                            chunk_total: chunks.length,
                            file_type: path.extname(req.file.originalname).replace('.', '').toLowerCase(),
                            chunk_size: chunk.length,
                            created_at: new Date().toISOString()
                        }
                    }));
                    
                    allPoints.push(...batchPoints);
                    
                    // Longer delay between batches for Gemini rate limiting
                    if (i + batchSize < chunks.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                // Store all points in Qdrant
                console.log(`📤 Storing ${allPoints.length} points in Qdrant...`);
                try {
                    await qdrant.upsertPoints(collection.qdrant_collection_name, allPoints);
                    chunksStored = allPoints.length;
                    console.log(`✅ Stored ${chunksStored} chunks in Qdrant with enhanced metadata`);
                } catch (upsertError) {
                    console.error('❌ Failed to store points in Qdrant:', upsertError.message);
                    console.error('❌ Upsert error details:', upsertError.response?.data);
                    chunksSkipped = chunks.length;
                    
                    // Continue with document creation even if vector storage fails
                    console.log('⚠️  Continuing with document creation despite vector storage failure');
                }
            } catch (embeddingError) {
                console.error('❌ Failed to process embeddings:', embeddingError.message);
                console.error('❌ Embedding error stack:', embeddingError.stack);
                chunksSkipped = chunks.length;
            }
        }

        // Insert file metadata as a document
        const insertResult = await db.query(
            `INSERT INTO documents 
                (filename, file_type, collection_id, created_at, updated_at, content_preview, content) 
             VALUES ($1, $2, $3, NOW(), NOW(), $4, $5)
             RETURNING id, filename, file_type, collection_id, created_at, updated_at`,
            [
                req.file.originalname,
                path.extname(req.file.originalname).replace('.', '').toLowerCase(),
                collection.id,
                processor.generatePreview(extractedText),
                extractedText
            ]
        );
        const doc = insertResult.rows[0];

        // Clean up uploaded file
        try {
            fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
            console.warn('Failed to cleanup uploaded file:', cleanupError.message);
        }

        console.log(`Document created with ID: ${doc.id}`);

        res.json({
            success: true,
            message: 'File uploaded and processed successfully',
            document: doc,
            collection: collection.name,
            chunksStored,
            chunksSkipped,
            totalChunks: chunks.length,
            chunkSize: 4000,
            chunkOverlap: 1000,
            processingMethod: extractedText.length > 10000 ? 'recursive' : 'standard',
            extractedLength: extractedText.length,
            extractionSuccessful: isSupported && extractedText.length > 100
        });
    } catch (err) {
        console.error('❌ Upload error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: err.message 
        });
    }
});

console.log('✅ Upload route registered');
console.log('🔧 Upload routes module initialized');

module.exports = router;
