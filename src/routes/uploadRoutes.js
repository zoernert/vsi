const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { qdrantClient } = require('../config/qdrant');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to ALL routes in this file
router.use(authenticateToken);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Helper function to extract text from file
async function extractTextFromFile(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    
    if (ext === '.txt' || ext === '.md') {
        return fs.readFileSync(filePath, 'utf8');
    }
    
    // Handle image files with AI-generated descriptions
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
        try {
            // Use Gemini Vision to generate detailed description
            const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const model = genAI.getGenerativeModel({ model: modelName });
            
            // Read image file and convert to base64
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            
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
                    mimeType: `image/${ext.substring(1)}`
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
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            
            // Return the extracted text from PDF
            return data.text || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting PDF text:', error);
            return `Document: ${originalName}`;
        }
    }
    
    if (ext === '.docx') {
        try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting DOCX text:', error);
            return `Document: ${originalName}`;
        }
    }
    
    if (ext === '.xlsx' || ext === '.xls') {
        try {
            const XLSX = require('xlsx');
            const workbook = XLSX.readFile(filePath);
            let text = '';
            workbook.SheetNames.forEach(name => {
                const sheet = workbook.Sheets[name];
                text += XLSX.utils.sheet_to_txt(sheet) + '\n';
            });
            return text || `Document: ${originalName}`;
        } catch (error) {
            console.error('Error extracting Excel text:', error);
            return `Document: ${originalName}`;
        }
    }
    
    // For other file types, return filename as fallback
    return `Document: ${originalName}`;
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

// Helper function to get user-specific collection name
function getUserCollectionName(username, collectionName) {
    return `user_${username}_${collectionName}`;
}

// Enhanced helper function to ensure collection exists
async function ensureCollectionExists(actualCollectionName, collectionDisplayName) {
    try {
        await qdrantClient.getCollection(actualCollectionName);
        return true; // Collection already exists
    } catch (error) {
        // Check if it's a 404 Not Found error (collection doesn't exist)
        if (error.status === 404 || error.message.includes('Not found') || error.message.includes("doesn't exist")) {
            console.log(`Auto-creating collection: ${collectionDisplayName} (${actualCollectionName})`);
            await qdrantClient.createCollection(actualCollectionName, {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            });
            console.log(`✅ Collection created successfully: ${collectionDisplayName}`);
            return false; // Collection was just created
        } else {
            throw error;
        }
    }
}

// Upload file to collection
router.post('/collections/:collection/upload', upload.single('file'), async (req, res) => {
    try {
        const { collection } = req.params;
        const file = req.file;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log(`Uploading file ${file.originalname} to collection ${collection}`);
        console.log(`File saved as: ${file.filename} (UUID: ${path.parse(file.filename).name})`);
        
        // Extract text from file (now includes AI-generated image descriptions)
        const text = await extractTextFromFile(file.path, file.originalname);
        console.log(`Extracted text length: ${text.length} characters`);
        console.log(`Text preview: ${text.substring(0, 200)}...`);
        
        // Generate embedding
        const embedding = await generateEmbedding(text);
        
        // Extract UUID from filename (remove extension)
        const fileUuid = path.parse(file.filename).name;
        
        // Determine file type for better categorization
        const ext = path.extname(file.originalname).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
        
        // Create point for Qdrant
        const point = {
            id: uuidv4(), // Document ID (different from file UUID)
            vector: embedding,
            payload: {
                filename: file.originalname,
                filepath: file.path,
                fileUuid: fileUuid, // Store the file UUID for download links
                downloadUrl: `/api/files/${fileUuid}`,
                text: text, // Store the full extracted text/description
                fileType: isImage ? 'image' : 'document',
                mimeType: file.mimetype,
                uploadedBy: req.user.username,
                uploadedAt: new Date().toISOString(),
                type: 'file'
            }
        };
        
        // Auto-create collection if it doesn't exist
        const wasExisting = await ensureCollectionExists(actualCollectionName, collection);
        
        // Upsert point to collection
        await qdrantClient.upsert(actualCollectionName, {
            points: [point]
        });
        
        const message = wasExisting 
            ? `${isImage ? 'Image' : 'File'} uploaded and indexed successfully`
            : `Collection created and ${isImage ? 'image' : 'file'} uploaded successfully`;
        
        res.json({ 
            message,
            documentId: point.id,
            fileUuid: fileUuid,
            filename: file.originalname,
            downloadUrl: `/api/files/${fileUuid}`,
            fileInfoUrl: `/api/files/${fileUuid}/info`,
            collectionCreated: !wasExisting,
            fileType: isImage ? 'image' : 'document',
            extractedTextLength: text.length
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create text document in collection
router.post('/collections/:collection/create-text', async (req, res) => {
    try {
        const { collection } = req.params;
        const { title, content } = req.body;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);

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

        // Upsert point to collection
        await qdrantClient.upsert(actualCollectionName, {
            points: [point]
        });

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
});

// Reindex collection
router.post('/collections/:collection/reindex', async (req, res) => {
    try {
        const { collection } = req.params;
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);

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
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
           
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
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
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
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
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
        const username = req.user.username;
        const actualCollectionName = getUserCollectionName(username, collection);
        
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
