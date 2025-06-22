const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const qdrantClient = require('../config/qdrant');
const { embeddingModel, generativeModel } = require('../config/gemini');
const { splitTextIntoChunks } = require('../utils/textSplitter');

// Function to convert image to base64
function fileToGenerativePart(filePath, mimeType) {
    const data = require('fs').readFileSync(filePath);
    return {
        inlineData: {
            data: Buffer.from(data).toString('base64'),
            mimeType
        },
    };
}

async function processImageWithLLM(imagePath, mimeType) {
    try {
        const imagePart = fileToGenerativePart(imagePath, mimeType);
        const result = await generativeModel.generateContent([
            "Describe this image in detail, focusing on key objects, actions, and context. Provide the description in markdown format.",
            imagePart
        ]);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error(`Error processing image with LLM: ${imagePath}`, error);
        return `Error: Could not process image ${path.basename(imagePath)} with LLM.`;
    }
}

// Placeholder for document conversion
async function convertDocumentToMarkdown(filePath, mimeType) {
    console.log(`Simulating conversion of ${mimeType} file: ${filePath}`);
    let content = '';
    try {
        // For text files, read directly
        if (mimeType.startsWith('text/')) {
            content = await fs.readFile(filePath, 'utf8');
        } else {
            // For other document types (PDF, DOCX), simulate conversion
            content = `This is markdown content converted from a ${mimeType} file located at ${path.basename(filePath)}. Actual conversion logic for this file type would be implemented here.`;
        }
    } catch (error) {
        console.error(`Error reading or simulating conversion for ${filePath}:`, error);
        content = `Error converting file ${path.basename(filePath)} to markdown.`;
    }
    return content;
}

async function processAndStoreFile(filePath, userId, filename, mimeType) {
    try {
        console.log(`Processing file: ${filename} (${mimeType})`);
        
        // Check file size before processing
        const fs = require('fs');
        const fileStats = fs.statSync(filePath);
        const fileSizeInMB = fileStats.size / (1024 * 1024);
        
        // Limit file size to prevent memory issues
        if (fileSizeInMB > 50) { // 50MB limit
            throw new Error(`File too large: ${fileSizeInMB.toFixed(2)}MB. Maximum allowed: 50MB`);
        }

        console.log(`File size: ${fileSizeInMB.toFixed(2)}MB`);

        let markdownContent = '';
        let fileDescription = '';

        if (mimeType.startsWith('image/')) {
            markdownContent = await processImageWithLLM(filePath, mimeType);
            fileDescription = 'Image file processed with LLM OCR.';
        } else if (mimeType.startsWith('application/pdf') ||
                   mimeType.includes('officedocument') ||
                   mimeType.startsWith('text/')) {
            markdownContent = await convertDocumentToMarkdown(filePath, mimeType);
            fileDescription = 'Document file converted to Markdown.';
        } else {
            // Fallback for unsupported types
            markdownContent = `Unsupported file type: ${mimeType}. Content of ${filename} could not be fully processed.`;
            fileDescription = 'Unsupported file type.';
        }

        // Validate extracted text before chunking
        if (!markdownContent || typeof markdownContent !== 'string') {
            throw new Error('Failed to extract valid text from file');
        }

        if (markdownContent.length > 10000000) { // 10MB text limit
            console.warn('Text is very large, truncating to prevent memory issues');
            markdownContent = markdownContent.substring(0, 10000000);
        }

        console.log(`Extracted text length: ${markdownContent.length} characters`);

        // Split text with reasonable chunk size
        const chunks = splitTextIntoChunks(markdownContent, 1000, 100);
        
        if (chunks.length === 0) {
            throw new Error('No text chunks created from file');
        }

        console.log(`Created ${chunks.length} text chunks`);

        const collectionName = `user-${userId}-collections`; // Collection name for the user

        // Ensure the collection exists before upserting points
        try {
            const { collections } = await qdrantClient.getCollections();
            const collectionExists = collections.some(col => col.name === collectionName);
            if (!collectionExists) {
                await qdrantClient.createCollection(collectionName, {
                    vectors: { size: 768, distance: 'Cosine' }, // text-embedding-004 produces 768-dimensional embeddings
                });
                console.log(`Collection '${collectionName}' created on the fly for user ${userId}.`);
            }
        } catch (error) {
            console.error(`Error ensuring Qdrant collection exists for user ${userId}:`, error);
            throw new Error('Failed to ensure Qdrant collection exists.');
        }

        const points = [];

        for (const chunk of chunks) {
            const chunkId = uuidv4(); // Unique ID for each chunk
            let embedding;
            try {
                // Use embedContent method for the embedding model
                const result = await embeddingModel.embedContent(chunk);
                embedding = result.embedding.values;
            } catch (error) {
                console.error(`Error generating embedding for chunk:`, error);
                console.error(`Chunk content preview: ${chunk.substring(0, 100)}...`);
                throw new Error(`Failed to generate embedding: ${error.message}`);
            }

            // Validate embedding
            if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                throw new Error('Invalid embedding generated - empty or malformed');
            }

            points.push({
                id: chunkId,
                vector: embedding,
                payload: {
                    fileId: uuidv4(), // Original file ID (can be the same for all chunks of one file)
                    userId: userId,
                    originalName: filename,
                    mimeType: mimeType,
                    description: fileDescription,
                    chunkContent: chunk, // Store the chunk content
                    uploadDate: new Date().toISOString(),
                },
            });
        }

        try {
            await qdrantClient.upsert(collectionName, {
                wait: true,
                batch: {
                    ids: points.map(p => p.id),
                    vectors: points.map(p => p.vector),
                    payloads: points.map(p => p.payload),
                },
            });
            console.log(`File ${filename} processed, split into ${chunks.length} chunks, and stored in Qdrant collection '${collectionName}'.`);
            return {
                success: true,
                message: `File processed and ${chunks.length} chunks stored.`,
                chunksStored: chunks.length,
                collectionName: collectionName,
            };
        } catch (error) {
            console.error(`Error storing file chunks in Qdrant:`, error);
            throw new Error('Failed to store file content chunks in vector store.');
        } finally {
            // Clean up the uploaded file after processing
            try {
                await fs.unlink(filePath);
                console.log(`Deleted temporary file: ${filePath}`);
            } catch (cleanupError) {
                console.error(`Error deleting temporary file ${filePath}:`, cleanupError);
            }
        }
    } catch (error) {
        console.error('Error in processAndStoreFile:', error.message);
        throw error;
    }
}

module.exports = {
    processAndStoreFile,
};
