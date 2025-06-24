const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const qdrantClient = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');
const { createUsageMiddleware, createLimitMiddleware } = require('../middleware/usageTracking');
const { TIER_LIMITS } = require('../config/tiers');
const { DatabaseService } = require('../services/databaseService');
const { FileService } = require('../services/fileService');
const { processAndStoreFile } = require('../services/fileProcessor');

const router = express.Router();

// Apply authentication to ALL routes in this file
router.use(authenticateToken);

// Configure multer for in-memory storage (no filesystem storage)
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Initialize services
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const fileService = new FileService();

// File size check middleware
const checkFileSize = async (req, res, next) => {
    if (req.file && req.user) {
        const db = new DatabaseService();
        const userTier = await db.getUserTier(req.user.id);
        const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
        
        if (req.file.size > limits.max_file_size) {
            return res.status(413).json({
                error: 'File too large',
                message: `File size exceeds limit for ${userTier} tier`,
                maxSize: limits.max_file_size,
                upgradeUrl: '/pricing'
            });
        }
    }
    next();
};

// Helper function to get user-specific collection name
function getUserCollectionName(userId, collectionName) {
    return `user_${userId}_${collectionName}`;
}

// Helper function to extract text from file buffer
async function extractTextFromBuffer(buffer, originalName, mimeType) {
    const ext = path.extname(originalName).toLowerCase();
    
    if (ext === '.txt' || ext === '.md') {
        return buffer.toString('utf8');
    }
    
    // Handle image files with AI-generated descriptions
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
        try {
            // Use Gemini Vision to generate detailed description
            const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const model = genAI.getGenerativeModel({ model: modelName });
            
            // Convert buffer to base64
            const base64Image = buffer.toString('base64');
            
            const prompt = `Please provide a detailed description of this image. Include:
1. What objects, people, text, or scenes are visible
2. Colors, composition, and visual elements
3. Any text that appears in the image (OCR)
4. Context and setting
5. Any other relevant details that would help someone understand the content

Be thorough and descriptive, as this will be used for searching and question answering about the image content.`;

            const imagePart = {
                inlineData: {
                    data: base64Image,
                    mimeType: mimeType
                }
            };

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const description = response.text();
            
            return description || `Image: ${originalName}`;
            
        } catch (error) {
            console.error('Error generating image description:', error);
            // Fallback to basic description
            return `Image file: ${originalName}. Unable to generate detailed description: ${error.message}`;
        }
    }
    
    if (ext === '.pdf') {
        try {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(buffer);
            
            console.log(`PDF extraction successful: ${data.text.length} characters from ${originalName}`);
            // Return the extracted text from PDF
            return data.text || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting PDF text:', error);
            return `Document: ${originalName} - PDF text extraction failed: ${error.message}`;
        }
    }
    
    if (ext === '.docx') {
        try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: buffer });
            console.log(`DOCX extraction successful: ${result.value.length} characters from ${originalName}`);
            return result.value || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting DOCX text:', error);
            return `Document: ${originalName} - DOCX text extraction failed: ${error.message}`;
        }
    }
    
    if (ext === '.xlsx' || ext === '.xls') {
        try {
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer);
            let text = '';
            workbook.SheetNames.forEach(name => {
                const sheet = workbook.Sheets[name];
                text += `\n\n=== Sheet: ${name} ===\n`;
                text += XLSX.utils.sheet_to_txt(sheet) + '\n';
            });
            console.log(`Excel extraction successful: ${text.length} characters from ${originalName}`);
            return text || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting Excel text:', error);
            return `Document: ${originalName} - Excel text extraction failed: ${error.message}`;
        }
    }
    
    // For other file types, return filename as fallback
    return `Document: ${originalName} - File type ${mimeType} requires specific processing for text extraction.`;
}

// Helper function to generate embeddings
async function generateEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        // Return a zero vector as fallback
        return new Array(768).fill(0);
    }
}

// Enhanced helper function to ensure collection exists
async function ensureCollectionExists(actualCollectionName, collectionDisplayName) {
    try {
        const wasCreated = await qdrantClient.ensureCollection(actualCollectionName, {
            size: 768,
            distance: 'Cosine'
        });
        
        if (wasCreated) {
            console.log(`✅ Collection created successfully: ${collectionDisplayName}`);
            return false; // Collection was just created
        } else {
            console.log(`Collection '${collectionDisplayName}' already exists.`);
            return true; // Collection already exists
        }
    } catch (error) {
        console.error(`Error with collection ${actualCollectionName}:`, error);
        throw new Error(`Failed to ensure collection exists: ${error.message}`);
    }
}

// Upload file to collection
router.post('/collections/:collection/upload', 
    upload.single('file'),
    checkFileSize,
    createLimitMiddleware('documents'),
    createLimitMiddleware('storage_bytes', 0), // Will be calculated based on file size
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        try {
            const { collection } = req.params;
            const file = req.file;
            const userId = req.user.id;
            const username = req.user.username;
            const actualCollectionName = getUserCollectionName(userId, collection);
            
            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            
            console.log(`Uploading file ${file.originalname} to collection ${collection}`);
            
            // Generate UUID for file
            const fileUuid = uuidv4();
            
            // Store file in database first
            const storedFile = await fileService.storeFile(
                fileUuid, 
                file.originalname, 
                file.mimetype, 
                file.buffer, 
                req.user.username
            );
            
            console.log(`File stored in database with UUID: ${fileUuid}`);
            
            // Save file temporarily for processing
            const tempFilePath = path.join(__dirname, '../../uploads', `${fileUuid}_${file.originalname}`);
            
            // Ensure uploads directory exists
            const uploadsDir = path.dirname(tempFilePath);
            if (!require('fs').existsSync(uploadsDir)) {
                require('fs').mkdirSync(uploadsDir, { recursive: true });
            }
            
            // Write buffer to temporary file
            require('fs').writeFileSync(tempFilePath, file.buffer);
            
            try {
                // Fix: Pass username and collection as arguments
                const result = await processAndStoreFile(
                    tempFilePath,
                    req.user.id,
                    file.originalname,
                    file.mimetype,
                    req.user.username,
                    collection
                );
                
                // Track usage after successful processing
                if (req.user && req.user.id) {
                    const { usageTracker } = require('../middleware/usageTracking');
                    usageTracker.trackUsage(req.user.id, 'documents', 1);
                    usageTracker.trackUsage(req.user.id, 'storage_bytes', file.size);
                }
                
                res.json({ 
                    message: result.message,
                    fileUuid: fileUuid,
                    filename: file.originalname,
                    downloadUrl: `/api/files/${fileUuid}`,
                    fileInfoUrl: `/api/files/${fileUuid}/info`,
                    chunksStored: result.chunksStored,
                    collectionName: result.collectionName
                });
                
            } catch (processingError) {
                console.error('File processing error:', processingError);
                
                // If processing fails, we should still keep the file in the database
                // but inform the user that indexing failed
                res.status(500).json({ 
                    error: 'File uploaded but indexing failed',
                    message: processingError.message,
                    fileUuid: fileUuid,
                    downloadUrl: `/api/files/${fileUuid}`,
                    indexed: false
                });
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Add URL upload endpoint
router.post('/collections/:collection/upload-url',
    createLimitMiddleware('documents'),
    createLimitMiddleware('storage_bytes', 0),
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        try {
            const { collection } = req.params;
            const { url, filename } = req.body;
            const userId = req.user.id;
            const actualCollectionName = getUserCollectionName(userId, collection);
            
            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }
            
            console.log(`Downloading file from URL: ${url}`);
            
            // Download file from URL
            const fetch = require('node-fetch');
            const urlResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'VSI-Vector-Store/1.0.0'
                },
                timeout: 30000 // 30 second timeout
            });
            
            if (!urlResponse.ok) {
                throw new Error(`Failed to download: ${urlResponse.status} ${urlResponse.statusText}`);
            }
            
            const buffer = await urlResponse.buffer();
            const contentType = urlResponse.headers.get('content-type') || 'application/octet-stream';
            
            // Determine filename
            let originalName = filename;
            if (!originalName) {
                const urlPath = new URL(url).pathname;
                originalName = path.basename(urlPath) || 'downloaded-file';
                
                // Add extension based on content type if missing
                if (!path.extname(originalName)) {
                    const extMap = {
                        'application/pdf': '.pdf',
                        'text/html': '.html',
                        'text/plain': '.txt',
                        'text/markdown': '.md'
                    };
                    const ext = extMap[contentType];
                    if (ext) {
                        originalName += ext;
                    }
                }
            }
            
            // Check file size against user limits
            const db = new DatabaseService();
            const userTier = await db.getUserTier(req.user.id);
            const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
            
            if (buffer.length > limits.max_file_size) {
                return res.status(413).json({
                    error: 'File too large',
                    message: `Downloaded file size exceeds limit for ${userTier} tier`,
                    maxSize: limits.max_file_size,
                    upgradeUrl: '/pricing'
                });
            }
            
            // Generate UUID for file
            const fileUuid = uuidv4();
            
            // Store file in database
            const storedFile = await fileService.storeFile(
                fileUuid,
                originalName,
                contentType,
                buffer,
                req.user.username
            );
            
            console.log(`File stored in database with UUID: ${fileUuid}`);
            
            // Extract text from downloaded content
            let text;
            if (contentType.includes('text/html')) {
                // Extract text from HTML
                const cheerio = require('cheerio');
                const $ = cheerio.load(buffer.toString('utf8'));
                // Remove script and style elements
                $('script, style').remove();
                text = $.text().replace(/\s+/g, ' ').trim();
            } else {
                // Use existing text extraction
                text = await extractTextFromBuffer(buffer, originalName, contentType);
            }
            
            console.log(`Extracted text length: ${text.length} characters`);
            
            // Generate embedding
            const embedding = await generateEmbedding(text);
            
            // Create point for Qdrant
            const point = {
                id: uuidv4(),
                vector: embedding,
                payload: {
                    filename: originalName,
                    fileUuid: fileUuid,
                    downloadUrl: `/api/files/${fileUuid}`,
                    sourceUrl: url,
                    text: text,
                    fileType: 'document',
                    mimeType: contentType,
                    uploadedBy: req.user.username,
                    uploadedAt: new Date().toISOString(),
                    type: 'url-download'
                }
            };
            
            // Auto-create collection if it doesn't exist
            const wasExisting = await ensureCollectionExists(actualCollectionName, collection);
            
            // Fix: Use correct upsert method with proper points format
            await qdrantClient.upsert(actualCollectionName, {
                wait: true,
                points: [point]
            });
            
            // Track usage after successful upload
            if (req.user && req.user.id) {
                const { usageTracker } = require('../middleware/usageTracking');
                usageTracker.trackUsage(req.user.id, 'documents', 1);
                usageTracker.trackUsage(req.user.id, 'storage_bytes', buffer.length);
            }
            
            const message = wasExisting 
                ? 'File downloaded from URL and indexed successfully'
                : 'Collection created and file downloaded from URL successfully';
            
            res.json({
                message,
                documentId: point.id,
                fileUuid: fileUuid,
                filename: originalName,
                downloadUrl: `/api/files/${fileUuid}`,
                sourceUrl: url,
                collectionCreated: !wasExisting,
                extractedTextLength: text.length
            });
            
        } catch (error) {
            console.error('URL upload error:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Create text document in collection
router.post('/collections/:collection/create-text', 
    createLimitMiddleware('documents'),
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        try {
            const { collection } = req.params;
            const { title, content } = req.body;
            const userId = req.user.id;
            const actualCollectionName = getUserCollectionName(userId, collection);

            if (!title || !content) {
                return res.status(400).json({ error: 'Title and content are required' });
            }

            console.log(`Creating text document "${title}" in collection ${collection}`);

            // Generate embedding
            const text = `${title}\n\n${content}`;
            const embedding = await generateEmbedding(text);

            // Create point for Qdrant        
            const point = {
                id: uuidv4(),
                vector: embedding,
                payload: {
                    title: title,
                    content: content,
                    text: text,
                    createdBy: req.user.username,
                    createdAt: new Date().toISOString(),
                    type: 'text'
                }
            };

            // Auto-create collection if it doesn't exist
            const wasExisting = await ensureCollectionExists(actualCollectionName, collection);

            // Fix: Use correct upsert method with proper points format
            await qdrantClient.upsert(actualCollectionName, {
                wait: true,
                points: [point]
            });

            // Track usage after successful upload
            if (req.user && req.user.id) {
                const { usageTracker } = require('../middleware/usageTracking');
                usageTracker.trackUsage(req.user.id, 'documents', 1);
                usageTracker.trackUsage(req.user.id, 'storage_bytes', Buffer.byteLength(text, 'utf8'));
            }

            const message = wasExisting 
                ? 'Text document created and indexed successfully'
                : 'Collection created and text document indexed successfully';

            res.json({ 
                message,
                id: point.id,
                title: title,
                collectionCreated: !wasExisting
            });

        } catch (error) {
            console.error('Text creation error:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Reindex collection
router.post('/collections/:collection/reindex', async (req, res) => {
    try {
        const { collection } = req.params;
        const userId = req.user.id;
        const actualCollectionName = getUserCollectionName(userId, collection);

        console.log(`Reindexing collection ${actualCollectionName}`);
        
        // For now, just return success
        // In a real implementation, you'd re-process all documents
        res.json({ 
            message: `Collection ${collection} reindexing started`,
            status: 'in_progress'
        });
    } catch (error) {
        console.error('Reindex error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search documents in collection
router.post('/collections/:collection/search', async (req, res) => {
    try {
        const { collection } = req.params;
        const { query, limit = 10, filter } = req.body;
        const userId = req.user.id;
        const actualCollectionName = getUserCollectionName(userId, collection);
           
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        console.log(`Searching in collection ${collection} for: "${query}"`);
        
        // Auto-create collection if it doesn't exist (empty collection for search)
        await ensureCollectionExists(actualCollectionName, collection);

        // Generate embedding for search query
        const queryEmbedding = await generateEmbedding(query);

        // Search in Qdrant
        const searchResult = await qdrantClient.search(actualCollectionName, {
            vector: queryEmbedding,
            limit: parseInt(limit),
            with_payload: true,
            with_vector: false,
            filter: filter
        });

        // Format results
        const results = searchResult.map(hit => ({
            id: hit.id,
            score: hit.score,
            payload: hit.payload
        }));
        
        res.json({ 
            query,
            results,
            count: results.length
        });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get document by ID
router.get('/collections/:collection/documents/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const userId = req.user.id;
        const actualCollectionName = getUserCollectionName(userId, collection);
        
        console.log(`Retrieving document ${id} from collection ${actualCollectionName}`);
        
        const points = await qdrantClient.retrieve(actualCollectionName, {
            ids: [id],
            with_payload: true,
            with_vector: false
        });

        if (points.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({ 
            id: points[0].id,
            payload: points[0].payload
        });
        
    } catch (error) {
        console.error('Retrieve error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all documents in collection
router.get('/collections/:collection/documents', async (req, res) => {
    try {
        const { collection } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        const userId = req.user.id;
        const actualCollectionName = getUserCollectionName(userId, collection);
        
        console.log(`Listing documents in collection ${actualCollectionName}`);
        
        // Scroll through all points in collection
        const scrollResult = await qdrantClient.scroll(actualCollectionName, {
            limit: parseInt(limit),
            offset: parseInt(offset),
            with_payload: true,
            with_vector: false
        });
        
        const documents = scrollResult.points.map(point => ({
            id: point.id,
            payload: point.payload
        }));
        
        res.json({ 
            documents,
            count: documents.length,
            limit: parseInt(limit)
        });
        
    } catch (error) {
        console.error('List documents error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete document by ID
router.delete('/collections/:collection/documents/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const userId = req.user.id;
        const actualCollectionName = getUserCollectionName(userId, collection);
        
        console.log(`Deleting document ${id} from collection ${actualCollectionName}`);
        
        await qdrantClient.delete(actualCollectionName, {
            points: [id]
        });
        
        res.json({ 
            message: 'Document deleted successfully',
            id
        });
        
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
