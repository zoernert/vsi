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

// Add progress tracking for chunk processing
router.post('/upload/:collection', (req, res, next) => {
    console.log(`\n🚀 UPLOAD ROUTE HIT!`);
    console.log(`Collection param: ${req.params.collection}`);
    console.log(`User from auth: ${req.user ? req.user.id : 'NO USER'}`);
    console.log(`Content-Type: ${req.get('content-type')}`);
    console.log(`File present: ${!!req.file}`);
    next();
}, auth, upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    console.log(`📤 Upload request received for collection ${req.params.collection}`);
    
    // Set up Server-Sent Events for progress tracking
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Helper function to send progress updates
    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const collectionId = parseInt(req.params.collection);
        
        if (!req.file) {
            sendProgress({ 
                type: 'error', 
                message: 'No file uploaded' 
            });
            return res.end();
        }

        sendProgress({
            type: 'progress',
            stage: 'validation',
            message: 'Validating file and collection...',
            progress: 5
        });

        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [collectionId, req.user.id]
        );
        
        if (collectionResult.rows.length === 0) {
            sendProgress({
                type: 'error',
                message: 'Collection not found or access denied'
            });
            return res.end();
        }
        
        const collection = collectionResult.rows[0];
        
        sendProgress({
            type: 'progress',
            stage: 'processing',
            message: 'Processing file content...',
            progress: 10
        });

        // Extract text from file
        let extractedText = '';
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        
        try {
            if (fileExtension === '.pdf') {
                const pdfData = await processor.extractText(req.file.path, req.file.mimetype);
                extractedText = pdfData;
            } else if (fileExtension === '.docx') {
                const result = await processor.extractText(req.file.path, req.file.mimetype);
                extractedText = result;
            } else if (['.txt', '.md'].includes(fileExtension)) {
                extractedText = fs.readFileSync(req.file.path, 'utf-8');
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(fileExtension)) {
                // Process image with LLM to extract description
                sendProgress({
                    type: 'progress',
                    stage: 'processing',
                    message: 'Processing image with AI to extract description...',
                    progress: 15
                });
                
                try {
                    // Import Gemini service for image processing
                    const { GoogleGenerativeAI } = require('@google/generative-ai');
                    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                    
                    // Convert image to base64 for Gemini
                    const imageData = fs.readFileSync(req.file.path);
                    const imagePart = {
                        inlineData: {
                            data: Buffer.from(imageData).toString('base64'),
                            mimeType: req.file.mimetype
                        }
                    };
                    
                    const result = await model.generateContent([
                        "Describe this image in detail, focusing on key objects, actions, and context. Provide a comprehensive description that would be useful for search and retrieval. Include details about colors, text content (if any), people, objects, setting, and any other notable features.",
                        imagePart
                    ]);
                    
                    const response = await result.response;
                    extractedText = response.text();
                    
                    // Add metadata about the image processing
                    extractedText = `# Image Analysis\n\n**Filename:** ${req.file.originalname}\n**File Type:** ${fileExtension.substring(1).toUpperCase()}\n**Processed with:** AI Image Analysis\n\n## Description\n\n${extractedText}`;
                    
                } catch (imageError) {
                    console.error('Image processing error:', imageError);
                    extractedText = `Image file: ${req.file.originalname}\nFile type: ${fileExtension.substring(1).toUpperCase()}\nNote: Could not process image content due to error: ${imageError.message}`;
                }
            } else {
                sendProgress({
                    type: 'error',
                    message: `Unsupported file type: ${fileExtension}. Supported types: PDF, DOCX, TXT, MD, PNG, JPG, JPEG, GIF, BMP, WEBP`
                });
                return res.end();
            }
        } catch (extractError) {
            sendProgress({
                type: 'error',
                message: `Failed to extract text: ${extractError.message}`
            });
            return res.end();
        }

        sendProgress({
            type: 'progress',
            stage: 'chunking',
            message: 'Creating text chunks...',
            progress: 20
        });

        // Create chunks
        let chunks;
        if (extractedText.length > 10000) {
            chunks = embeddings.recursiveChunkText(extractedText, 4000, 1000);
        } else {
            chunks = embeddings.chunkText(extractedText, 4000, 1000);
        }

        sendProgress({
            type: 'progress',
            stage: 'embedding',
            message: `Generating embeddings for ${chunks.length} chunks...`,
            progress: 30,
            totalChunks: chunks.length
        });

        // Process chunks with progress updates
        const batchSize = 5;
        const allPoints = [];
        let processedChunks = 0;

        for (let i = 0; i < chunks.length; i += batchSize) {
            const batchChunks = chunks.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(chunks.length / batchSize);
            
            sendProgress({
                type: 'progress',
                stage: 'embedding',
                message: `Processing batch ${batchNumber}/${totalBatches}...`,
                progress: 30 + (40 * (i / chunks.length)),
                currentBatch: batchNumber,
                totalBatches: totalBatches,
                processedChunks: processedChunks,
                totalChunks: chunks.length
            });

            try {
                const chunkEmbeddings = await embeddings.generateEmbeddings(batchChunks);
                
                const batchPoints = batchChunks.map((chunk, batchIndex) => ({
                    id: uuidv4(),
                    vector: chunkEmbeddings[batchIndex],
                    payload: {
                        text: chunk,
                        filename: req.file.originalname,
                        collection_id: collection.id,
                        chunk_index: i + batchIndex,
                        chunk_total: chunks.length,
                        file_type: fileExtension.substring(1),
                        chunk_size: chunk.length,
                        created_at: new Date().toISOString(),
                        document_type: 'file_upload'
                    }
                }));
                
                allPoints.push(...batchPoints);
                processedChunks += batchChunks.length;
                
                // Small delay between batches for rate limiting
                if (i + batchSize < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
            } catch (embeddingError) {
                sendProgress({
                    type: 'warning',
                    message: `Failed to process batch ${batchNumber}: ${embeddingError.message}`
                });
            }
        }

        sendProgress({
            type: 'progress',
            stage: 'storing',
            message: 'Storing vectors in database...',
            progress: 75
        });

        // Store all points in Qdrant
        let chunksStored = 0;
        try {
            await qdrant.upsertPoints(collection.qdrant_collection_name, allPoints);
            chunksStored = allPoints.length;
        } catch (upsertError) {
            sendProgress({
                type: 'warning',
                message: `Vector storage warning: ${upsertError.message}`
            });
        }

        sendProgress({
            type: 'progress',
            stage: 'finalizing',
            message: 'Saving document metadata...',
            progress: 90
        });

        // Insert document metadata
        const preview = extractedText.length > 500 
            ? extractedText.substring(0, 500) + '...' 
            : extractedText;

        console.log('🔍 About to insert document metadata:', {
            filename: req.file.originalname,
            fileType: fileExtension.substring(1),
            collectionId: collection.id,
            collectionUuid: collection.uuid,
            previewLength: preview.length,
            contentLength: extractedText.length
        });

        const insertResult = await db.query(
            `INSERT INTO documents 
                (filename, file_type, collection_id, collection_uuid, created_at, updated_at, content_preview, content) 
             VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6)
             RETURNING id, filename, file_type, collection_id, created_at, updated_at`,
            [
                req.file.originalname,
                fileExtension.substring(1),
                collection.id,
                collection.uuid,
                preview,
                extractedText
            ]
        );

        console.log('✅ Document metadata inserted successfully:', insertResult.rows[0]);

        const document = insertResult.rows[0];
        const processingTime = Date.now() - startTime;

        sendProgress({
            type: 'complete',
            message: 'Upload completed successfully!',
            progress: 100,
            data: {
                success: true,
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
                totalChunks: chunks.length,
                processingTimeMs: processingTime,
                contentLength: extractedText.length
            }
        });

        res.end();

    } catch (error) {
        console.error('❌ Upload error:', error);
        sendProgress({
            type: 'error',
            message: `Upload failed: ${error.message}`
        });
        res.end();
    }
});

console.log('✅ Upload route registered');
console.log('🔧 Upload routes module initialized');

module.exports = router;
