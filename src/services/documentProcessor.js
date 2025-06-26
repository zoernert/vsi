const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

class DocumentProcessor {
    constructor() {
        this.supportedTypes = ['.pdf', '.txt', '.md', '.doc', '.docx'];
        console.log('📄 DocumentProcessor initialized with supported types:', this.supportedTypes);
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
}

module.exports = { DocumentProcessor };
