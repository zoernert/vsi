const express = require('express');
const router = express.Router();
const { auth } = require('../middleware');
const qdrantClient = require('../config/qdrant');
const { DatabaseService } = require('../services/databaseService');

const db = new DatabaseService();

// GET /api/collections/:collectionId/snippets/:chunkId
router.get('/collections/:collectionId/snippets/:chunkId', auth, async (req, res) => {
    try {
        const { collectionId, chunkId } = req.params;
        const userId = req.user.id;
        
        console.log(`📄 Snippet request: Collection ${collectionId}, Chunk ${chunkId}, User ${userId}`);
        
        // Verify user owns the collection
        const collectionResult = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [parseInt(collectionId), userId]
        );
        
        if (collectionResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Collection not found or access denied' 
            });
        }
        
        const collection = collectionResult.rows[0];
        
        try {
            console.log(`📄 Retrieving chunk ${chunkId} from Qdrant collection: ${collection.qdrant_collection_name}`);
            
            // Retrieve the specific point from Qdrant using the real client
            const points = await qdrantClient.retrieve(collection.qdrant_collection_name, {
                ids: [chunkId],
                with_payload: true,
                with_vector: false
            });
            
            console.log(`📄 Qdrant retrieve response:`, {
                pointsFound: points?.length || 0,
                chunkId,
                collection: collection.qdrant_collection_name
            });
            
            if (!points || points.length === 0) {
                console.warn(`📄 No points found for chunk ${chunkId} in collection ${collection.qdrant_collection_name}`);
                return res.status(404).json({
                    success: false,
                    message: 'Snippet not found in vector store'
                });
            }
            
            const point = points[0];
            const payload = point.payload || {};
            
            console.log(`📄 Retrieved point payload keys:`, Object.keys(payload));
            console.log(`📄 Content preview:`, (payload.text || payload.content || 'No text').substring(0, 100));
            
            // Extract snippet data from Qdrant payload with better field mapping
            const snippetData = {
                id: point.id,
                text: payload.text || payload.content || payload.chunkContent || payload.chunk || 'No content available',
                filename: payload.filename || payload.originalName || payload.file_name || 'Unknown Document',
                chunkIndex: payload.chunk_index || payload.chunkIndex || 0,
                chunkTotal: payload.chunk_total || payload.chunkTotal || 1,
                fileType: payload.file_type || payload.fileType || payload.mimeType || 'unknown',
                uploadDate: payload.uploadDate || payload.created_at || payload.timestamp || new Date().toISOString(),
                metadata: {
                    mimeType: payload.mimeType || payload.mime_type,
                    description: payload.description,
                    chunkSize: payload.chunk_size || payload.chunkSize || (payload.text || '').length,
                    collectionId: payload.collection_id || collectionId,
                    documentType: payload.document_type || payload.type,
                    similarity: point.score || 1.0
                }
            };
            
            console.log(`✅ Successfully retrieved snippet: ${snippetData.text.length} characters from ${snippetData.filename}`);
            
            res.json({
                success: true,
                data: snippetData
            });
            
        } catch (qdrantError) {
            console.error(`❌ Qdrant error retrieving snippet from collection ${collection.qdrant_collection_name}:`, {
                error: qdrantError.message,
                status: qdrantError.status,
                chunkId,
                collection: collection.qdrant_collection_name
            });
            
            // Provide more specific error messages
            if (qdrantError.status === 404) {
                return res.status(404).json({
                    success: false,
                    message: 'Collection not found in vector store'
                });
            } else if (qdrantError.message?.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    message: 'Snippet not found in vector store'
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve snippet from vector store',
                error: qdrantError.message
            });
        }
        
    } catch (error) {
        console.error('❌ Snippet retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/search/documents/:documentId
router.get('/documents/:documentId', auth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.user.id;
        
        console.log(`📄 Document retrieval request: Document ${documentId}, User ${userId}`);
        
        // Get document with content
        const documentResult = await db.query(
            `SELECT d.*, c.name as collection_name, c.user_id
             FROM documents d
             JOIN collections c ON d.collection_id = c.id
             WHERE d.id = $1`,
            [parseInt(documentId)]
        );
        
        if (documentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }
        
        const document = documentResult.rows[0];
        
        // Check if user owns the collection
        if (document.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        console.log(`✅ Document retrieved: ${document.filename} (${document.content?.length || 0} chars)`);
        
        res.json({
            success: true,
            data: {
                id: document.id,
                filename: document.filename,
                content: document.content,
                fileType: document.file_type,
                collectionId: document.collection_id,
                collectionName: document.collection_name,
                createdAt: document.created_at,
                updatedAt: document.updated_at
            }
        });
        
    } catch (error) {
        console.error('❌ Document retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/search/documents/:documentId/similar
router.get('/documents/:documentId/similar', auth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const { limit = 5, threshold = 0.7 } = req.query;
        const userId = req.user.id;
        
        // Get the source document
        const documentResult = await db.query(
            `SELECT d.*, c.name as collection_name, c.user_id, c.qdrant_collection_name
             FROM documents d
             JOIN collections c ON d.collection_id = c.id
             WHERE d.id = $1`,
            [parseInt(documentId)]
        );
        
        if (documentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }
        
        const sourceDocument = documentResult.rows[0];
        
        // Check if user owns the collection
        if (sourceDocument.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Generate embedding for the source document
        const { EmbeddingService } = require('../services/embeddingService');
        const embeddingService = new EmbeddingService();
        
        const searchText = sourceDocument.content || sourceDocument.filename;
        const queryEmbedding = await embeddingService.generateEmbedding(searchText);
        
        // Search for similar documents across user's collections
        const userCollectionsResult = await db.query(
            'SELECT qdrant_collection_name FROM collections WHERE user_id = $1',
            [userId]
        );
        
        const allResults = [];
        
        for (const collection of userCollectionsResult.rows) {
            try {
                const searchResult = await qdrantClient.search(collection.qdrant_collection_name, {
                    vector: queryEmbedding,
                    limit: parseInt(limit) * 2, // Get more to filter out source
                    with_payload: true,
                    with_vector: false,
                    score_threshold: parseFloat(threshold)
                });
                
                allResults.push(...searchResult);
            } catch (searchError) {
                console.warn(`Failed to search collection ${collection.qdrant_collection_name}:`, searchError.message);
            }
        }
        
        // Filter out the source document and get top results
        const similarDocuments = allResults
            .filter(hit => hit.payload.filename !== sourceDocument.filename)
            .sort((a, b) => b.score - a.score)
            .slice(0, parseInt(limit))
            .map(hit => ({
                id: hit.id,
                filename: hit.payload.filename,
                contentPreview: (hit.payload.text || '').substring(0, 200) + '...',
                fileType: hit.payload.file_type,
                similarity: hit.score
            }));
        
        res.json({
            success: true,
            data: {
                sourceDocument: {
                    id: sourceDocument.id,
                    filename: sourceDocument.filename,
                    fileType: sourceDocument.file_type
                },
                similarDocuments
            }
        });
        
    } catch (error) {
        console.error('Similar documents error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;
