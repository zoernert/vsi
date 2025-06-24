const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const qdrantClient = require('../config/qdrant');
const { embeddingModel, generativeModel } = require('../config/gemini');
const { splitTextIntoChunks, validateChunkForEmbedding } = require('../utils/textSplitter');

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

// Improved document conversion with actual PDF parsing
async function convertDocumentToMarkdown(filePath, mimeType) {
    console.log(`Converting ${mimeType} file: ${filePath}`);
    let content = '';
    try {
        // For text files, read directly
        if (mimeType.startsWith('text/')) {
            content = await fs.readFile(filePath, 'utf8');
        } else if (mimeType === 'application/pdf') {
            // Use pdf-parse to extract text from PDF
            try {
                const pdfParse = require('pdf-parse');
                const buffer = await fs.readFile(filePath);
                const data = await pdfParse(buffer);
                content = data.text || `PDF file: ${path.basename(filePath)} - text extraction failed`;
                console.log(`PDF text extraction successful: ${content.length} characters`);
            } catch (pdfError) {
                console.error('PDF parsing error:', pdfError);
                content = `PDF file: ${path.basename(filePath)} - Could not extract text content. Error: ${pdfError.message}`;
            }
        } else if (mimeType.includes('officedocument.wordprocessingml') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            // Use mammoth to extract text from DOCX
            try {
                const mammoth = require('mammoth');
                const buffer = await fs.readFile(filePath);
                const result = await mammoth.extractRawText({ buffer: buffer });
                content = result.value || `DOCX file: ${path.basename(filePath)} - text extraction failed`;
                console.log(`DOCX text extraction successful: ${content.length} characters`);
            } catch (docxError) {
                console.error('DOCX parsing error:', docxError);
                content = `DOCX file: ${path.basename(filePath)} - Could not extract text content. Error: ${docxError.message}`;
            }
        } else if (mimeType.includes('spreadsheetml') || mimeType.includes('excel')) {
            // Use xlsx to extract text from Excel files
            try {
                const XLSX = require('xlsx');
                const workbook = XLSX.readFile(filePath);
                let allText = '';
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const sheetText = XLSX.utils.sheet_to_txt(sheet);
                    allText += `\n\n=== Sheet: ${sheetName} ===\n${sheetText}`;
                });
                content = allText || `Excel file: ${path.basename(filePath)} - text extraction failed`;
                console.log(`Excel text extraction successful: ${content.length} characters`);
            } catch (xlsxError) {
                console.error('Excel parsing error:', xlsxError);
                content = `Excel file: ${path.basename(filePath)} - Could not extract text content. Error: ${xlsxError.message}`;
            }
        } else {
            // For other document types, provide a fallback message
            content = `Document file: ${path.basename(filePath)} (${mimeType}) - This file type requires specific conversion logic to extract text content. Current implementation provides basic file information only.`;
        }
    } catch (error) {
        console.error(`Error reading or converting ${filePath}:`, error);
        content = `Error converting file ${path.basename(filePath)} to markdown: ${error.message}`;
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

        // Clean and preprocess text before chunking
        markdownContent = preprocessText(markdownContent);

        console.log(`Extracted text length: ${markdownContent.length} characters`);

        // Use recursive text splitter with larger chunks for better semantic coherence
        // Large chunk size (7000 chars) with 25% overlap (1750 chars) for optimal content preservation
        const chunks = splitTextIntoChunks(markdownContent, 7000, 1750);
        
        if (chunks.length === 0) {
            throw new Error('No text chunks created from file');
        }

        console.log(`Created ${chunks.length} text chunks using recursive splitter`);
        
        // Log chunk size distribution for debugging - including byte counts
        const chunkSizes = chunks.map(c => c.length);
        const chunkBytes = chunks.map(c => Buffer.byteLength(c, 'utf8'));
        const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
        const avgBytes = chunkBytes.reduce((a, b) => a + b, 0) / chunkBytes.length;
        const maxSize = Math.max(...chunkSizes);
        const maxBytes = Math.max(...chunkBytes);
        const minSize = Math.min(...chunkSizes);
        const minBytes = Math.min(...chunkBytes);
        console.log(`Chunk stats - Avg: ${Math.round(avgSize)} chars (${Math.round(avgBytes)} bytes)`);
        console.log(`Chunk stats - Min: ${minSize} chars (${minBytes} bytes), Max: ${maxSize} chars (${maxBytes} bytes)`);
        
        // Validate that no chunks exceed the byte limit after processing
        const oversizedChunks = chunkBytes.filter(bytes => bytes > 30000);
        if (oversizedChunks.length > 0) {
            console.warn(`Found ${oversizedChunks.length} chunks that exceed 30KB limit but should be handled by validation`);
        }

        // Use consistent collection naming pattern with LLM controller
        const collectionName = `user_${userId}_collections`;

        // Ensure the collection exists before upserting points
        try {
            // Use the helper function from qdrant config
            const wasCreated = await qdrantClient.ensureCollection(collectionName, {
                size: 768, 
                distance: 'Cosine'
            });
            
            if (wasCreated) {
                console.log(`Collection '${collectionName}' created for user ${userId}.`);
            } else {
                console.log(`Collection '${collectionName}' already exists for user ${userId}.`);
            }
        } catch (error) {
            console.error(`Error ensuring Qdrant collection exists for user ${userId}:`, error);
            throw new Error(`Failed to ensure Qdrant collection exists: ${error.message}`);
        }

        const points = [];
        let successfulChunks = 0;
        let skippedChunks = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkId = uuidv4();
            
            // Validate and potentially truncate chunk before embedding
            const validatedChunk = validateChunkForEmbedding(chunk);
            
            if (!validatedChunk || validatedChunk.length === 0) {
                console.warn(`Chunk ${i} became empty after validation, skipping`);
                skippedChunks++;
                continue;
            }
            
            // Double-check chunk size before embedding
            const chunkByteSize = Buffer.byteLength(validatedChunk, 'utf8');
            if (chunkByteSize > 30000) {
                console.error(`Chunk ${i} is still ${chunkByteSize} bytes after validation, skipping`);
                skippedChunks++;
                continue; // Skip this chunk
            }
            
            let embedding;
            try {
                // Use embedContent method for the embedding model
                const result = await embeddingModel.embedContent(validatedChunk);
                embedding = result.embedding.values;
                console.log(`Successfully generated embedding for chunk ${i + 1}/${chunks.length} (${validatedChunk.length} chars, ${chunkByteSize} bytes)`);
                successfulChunks++;
            } catch (error) {
                console.error(`Error generating embedding for chunk ${i}:`, error);
                console.error(`Chunk content preview: ${validatedChunk.substring(0, 100)}...`);
                console.error(`Chunk size: ${validatedChunk.length} chars, ${chunkByteSize} bytes`);
                
                // Skip this chunk instead of failing the entire file
                console.warn(`Skipping chunk ${i} due to embedding error`);
                skippedChunks++;
                continue;
            }

            // Validate embedding
            if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                console.warn(`Invalid embedding for chunk ${i}, skipping`);
                skippedChunks++;
                continue;
            }

            points.push({
                id: chunkId,
                vector: embedding,
                payload: {
                    fileId: uuidv4(),
                    userId: userId,
                    originalName: filename,
                    mimeType: mimeType,
                    description: fileDescription,
                    chunkContent: validatedChunk,
                    text: validatedChunk,
                    content: validatedChunk,
                    uploadDate: new Date().toISOString(),
                    chunkIndex: i, // Add chunk index for debugging
                },
            });
        }

        if (points.length === 0) {
            throw new Error('No valid chunks could be processed for embedding');
        }

        console.log(`Successfully processed ${successfulChunks} chunks, skipped ${skippedChunks} chunks out of ${chunks.length} total`);

        try {
            // Fix: Use the correct Qdrant client upsert method with proper points format
            await qdrantClient.upsert(collectionName, {
                wait: true,
                points: points
            });
            
            console.log(`File ${filename} processed, split into ${chunks.length} chunks, and stored in Qdrant collection '${collectionName}'.`);
            return {
                success: true,
                message: `File processed and ${points.length} chunks stored (${skippedChunks} chunks skipped).`,
                chunksStored: points.length,
                chunksSkipped: skippedChunks,
                totalChunks: chunks.length,
                collectionName: collectionName,
            };
        } catch (error) {
            console.error(`Error storing file chunks in Qdrant:`, error);
            throw new Error('Failed to store file content chunks in vector store.');
        } finally {
            // Fix: Clean up the uploaded file after processing with proper async/await
            try {
                const fsSync = require('fs');
                fsSync.unlinkSync(filePath); // Use sync version to avoid callback issues
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

/**
 * Preprocess text to clean and normalize it before chunking
 */
function preprocessText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Remove excessive whitespace and normalize line endings
    text = text.replace(/\r\n/g, '\n'); // Normalize Windows line endings
    text = text.replace(/\r/g, '\n');   // Normalize Mac line endings
    
    // Remove excessive empty lines (more than 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Remove trailing spaces from lines
    text = text.replace(/[ \t]+$/gm, '');
    
    // Normalize multiple spaces to single space (but preserve intentional formatting)
    text = text.replace(/[ \t]{2,}/g, ' ');
    
    // Remove null characters and other control characters except newlines and tabs
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim overall text
    text = text.trim();
    
    return text;
}

module.exports = {
    processAndStoreFile,
};
