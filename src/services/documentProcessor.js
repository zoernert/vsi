const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { EmbeddingService } = require('./embeddingService');
const { v4: uuidv4 } = require('uuid');

class DocumentProcessor {
    constructor(embeddingService, qdrantService) {
        this.supportedTypes = ['.pdf', '.txt', '.md', '.doc', '.docx'];
        console.log('📄 DocumentProcessor initialized with supported types:', this.supportedTypes);

        this.embeddingService = embeddingService || new EmbeddingService();
        this.qdrantService = qdrantService; // This should be injected
        this.logger = console; // Replace with a proper logger
    }

    async extractText(filePath, mimeType) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            console.log(`🔍 Extracting text from file: ${filePath}`);
            console.log(`📄 File extension: ${ext}, MIME type: ${mimeType}`);
            
            switch (ext) {
                case '.pdf':
                    return await this.extractFromPDF(filePath);
                case '.txt':
                case '.md':
                    return await this.extractFromText(filePath);
                default:
                    // Check by MIME type if extension doesn't match
                    if (mimeType && mimeType.includes('pdf')) {
                        console.log('🔄 MIME type indicates PDF, attempting PDF extraction...');
                        return await this.extractFromPDF(filePath);
                    }
                    if (mimeType && mimeType.includes('text')) {
                        console.log('🔄 MIME type indicates text, attempting text extraction...');
                        return await this.extractFromText(filePath);
                    }
                    throw new Error(`Unsupported file type: ${ext} (MIME: ${mimeType})`);
            }
        } catch (error) {
            console.error('Error extracting text:', error.message);
            throw error;
        }
    }

    async extractFromPDF(filePath) {
        try {
            console.log(`📖 Starting PDF text extraction from: ${filePath}`);
            
            // Check if file exists and get stats
            const stats = fs.statSync(filePath);
            console.log(`📊 PDF file size: ${stats.size} bytes`);
            
            const dataBuffer = fs.readFileSync(filePath);
            console.log(`✅ Successfully read ${dataBuffer.length} bytes from PDF file`);
            
            // Configure pdf-parse options for better extraction
            const options = {
                // Normalize whitespace and line breaks
                normalizeWhitespace: true,
                // Don't render images to speed up processing
                max: 0,
                // Use legacy build for better compatibility
                version: 'v1.10.100'
            };
            
            console.log('🔄 Processing PDF with pdf-parse...');
            const data = await pdf(dataBuffer, options);
            
            console.log(`📄 PDF extraction completed:`);
            console.log(`   - Pages: ${data.numpages}`);
            console.log(`   - Text length: ${data.text.length} characters`);
            console.log(`   - Info: ${JSON.stringify(data.info || {})}`);
            
            if (data.text.length === 0) {
                throw new Error('PDF appears to be empty or text extraction failed');
            }
            
            // Clean up the extracted text
            let cleanText = data.text
                .replace(/\r\n/g, '\n')  // Normalize line endings
                .replace(/\r/g, '\n')    // Handle old Mac line endings
                .replace(/\n{3,}/g, '\n\n')  // Reduce excessive line breaks
                .trim();

            // Add this check:
            if (!cleanText || cleanText.length === 0) {
                console.warn('❌ No text could be extracted from PDF. It may be a scanned document or image-only PDF.');
                throw new Error('No text could be extracted from this PDF. It may be a scanned document or image-only PDF.');
            }
                
            console.log(`✅ PDF text extraction successful: ${cleanText.length} characters after cleanup`);
            
            // Log first 200 characters for debugging
            console.log(`📝 Text preview: "${cleanText.substring(0, 200)}..."`);
            
            return cleanText;
        } catch (error) {
            console.error('❌ Error extracting PDF text:', error.message);
            console.error('❌ PDF extraction stack trace:', error.stack);
            throw new Error(`Failed to extract text from PDF: ${error.message}`);
        }
    }

    async extractFromText(filePath) {
        try {
            console.log(`📄 Reading text file: ${filePath}`);
            const stats = fs.statSync(filePath);
            console.log(`📊 Text file size: ${stats.size} bytes`);
            
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`✅ Successfully read ${content.length} characters from text file`);
            
            return content;
        } catch (error) {
            console.error('❌ Error reading text file:', error.message);
            throw new Error(`Failed to read text file: ${error.message}`);
        }
    }

    isSupported(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const supported = this.supportedTypes.includes(ext);
        
        console.log(`🔍 Checking if file is supported:`);
        console.log(`   File path: ${filePath}`);
        console.log(`   Extension: ${ext}`);
        console.log(`   Supported types: ${this.supportedTypes.join(', ')}`);
        console.log(`   Is supported: ${supported}`);
        
        return supported;
    }

    // Enhanced method that checks both extension and MIME type
    isSupportedAdvanced(filePath, mimeType) {
        const ext = path.extname(filePath).toLowerCase();
        const extSupported = this.supportedTypes.includes(ext);
        
        // Also check MIME type
        const mimeSupported = mimeType && (
            mimeType.includes('pdf') ||
            mimeType.includes('text') ||
            mimeType.includes('plain') ||
            mimeType.includes('markdown')
        );
        
        const supported = extSupported || mimeSupported;
        
        console.log(`🔍 Advanced file support check:`);
        console.log(`   File path: ${filePath}`);
        console.log(`   Extension: ${ext} (supported: ${extSupported})`);
        console.log(`   MIME type: ${mimeType} (supported: ${mimeSupported})`);
        console.log(`   Overall supported: ${supported}`);
        
        return supported;
    }

    generatePreview(text, maxLength = 500) {
        if (!text) return '';
        
        // For larger chunks, create a more intelligent preview
        if (text.length <= maxLength) {
            return text;
        }
        
        // Try to break at sentence boundary for preview
        const truncated = text.substring(0, maxLength);
        const lastSentence = Math.max(
            truncated.lastIndexOf('. '),
            truncated.lastIndexOf('.\n'),
            truncated.lastIndexOf('! '),
            truncated.lastIndexOf('? ')
        );
        
        if (lastSentence > maxLength * 0.5) {
            return truncated.substring(0, lastSentence + 1) + '...';
        }
        
        // Fall back to word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) {
            return truncated.substring(0, lastSpace) + '...';
        }
        
        return truncated + '...';
    }
    
    analyzeDocumentStructure(text) {
        const analysis = {
            totalLength: text.length,
            paragraphs: (text.match(/\n\n+/g) || []).length + 1,
            sentences: (text.match(/[.!?]+\s/g) || []).length,
            words: (text.match(/\S+/g) || []).length,
            hasHeaders: /\n#{1,6}\s/.test(text), // Markdown headers
            hasNumberedSections: /\n\d+\.\s/.test(text),
            hasLists: /\n\s*[-*+]\s/.test(text)
        };
        
        console.log('📊 Document structure analysis:', analysis);
        return analysis;
    }

    async processTextDocument(documentData) {
        const { content, filename, fileType = 'txt', collectionId, collectionName } = documentData;
        
        this.logger.log(`Processing text document: ${filename}`);
    
        // 1. Chunk the text
        const chunks = this.embeddingService.chunkText(content);
        this.logger.log(`Created ${chunks.length} chunks.`);
    
        if (chunks.length === 0) {
            return { points: [], documentInfo: null };
        }
    
        // 2. Generate embeddings for chunks
        const embeddings = await this.embeddingService.generateEmbeddings(chunks);
        this.logger.log(`Generated ${embeddings.length} embeddings.`);
    
        // 3. Create Qdrant points
        const points = chunks.map((chunk, index) => ({
            id: uuidv4(),
            vector: embeddings[index],
            payload: {
                text: chunk,
                filename: filename,
                file_type: fileType,
                collection_id: collectionId,
                chunk_index: index,
                chunk_total: chunks.length,
                created_at: new Date().toISOString(),
            }
        }));
    
        // The caller will be responsible for upserting points to Qdrant
        // and creating the document metadata in PostgreSQL.
    
        const documentInfo = {
            filename,
            fileType,
            collectionId,
            content,
            contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            // The caller should decide which qdrant_point_id to store, if any.
            // For a multi-chunk document, this model is problematic.
        };
    
        return { points, documentInfo };
    }

    // TODO: Implement processors for other file types (PDF, DOCX, etc.)
}

module.exports = { DocumentProcessor };
