const { GoogleGenerativeAI } = require('@google/generative-ai');

class EmbeddingService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-004';
        this._vectorSize = null; // Cache the vector size
    }

    async getVectorSize() {
        if (this._vectorSize) return this._vectorSize;
        
        try {
            // Generate a test embedding to determine vector size
            const testEmbedding = await this.generateEmbedding('test');
            this._vectorSize = testEmbedding.length;
            console.log(`📏 Determined vector size for ${this.embeddingModel}: ${this._vectorSize} dimensions`);
            return this._vectorSize;
        } catch (error) {
            console.error('Error determining vector size:', error.message);
            // Default to known sizes for common models
            const modelSizes = {
                'text-embedding-004': 768,
                'text-embedding-3-small': 1536,
                'text-embedding-3-large': 3072
            };
            
            this._vectorSize = modelSizes[this.embeddingModel] || 768;
            console.log(`📏 Using default vector size for ${this.embeddingModel}: ${this._vectorSize} dimensions`);
            return this._vectorSize;
        }
    }

    async generateEmbedding(text) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('Empty text provided for embedding');
            }

            const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
            const result = await model.embedContent(text.trim());
            
            const embedding = result.embedding.values;
            
            // Cache vector size if not already cached
            if (!this._vectorSize) {
                this._vectorSize = embedding.length;
                console.log(`📏 Cached vector size: ${this._vectorSize} dimensions`);
            }
            
            return embedding;
        } catch (error) {
            console.error('Error generating embedding with Gemini:', error.message);
            throw error;
        }
    }

    async generateEmbeddings(texts) {
        try {
            const validTexts = texts.filter(text => text && text.trim().length > 0);
            
            if (validTexts.length === 0) {
                return [];
            }

            const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
            const embeddings = [];
            
            // Process embeddings in batches to avoid rate limits
            for (const text of validTexts) {
                const result = await model.embedContent(text);
                embeddings.push(result.embedding.values);
            }

            return embeddings;
        } catch (error) {
            console.error('Error generating embeddings with Gemini:', error.message);
            throw error;
        }
    }

    chunkText(text, maxChunkSize = 4000, overlap = 1000) {
        if (!text || text.length === 0) return [];
        
        console.log(`📝 Chunking text: ${text.length} characters with ${maxChunkSize} chunk size and ${overlap} overlap`);
        
        const chunks = [];
        let start = 0;
        
        while (start < text.length) {
            let end = start + maxChunkSize;
            
            // For large chunks, try multiple boundary types for better splits
            if (end < text.length) {
                // Try to break at paragraph boundary first (double newline)
                const lastParagraph = text.lastIndexOf('\n\n', end);
                
                // Try to break at sentence boundary (period followed by space or newline)
                const lastSentence = Math.max(
                    text.lastIndexOf('. ', end),
                    text.lastIndexOf('.\n', end),
                    text.lastIndexOf('! ', end),
                    text.lastIndexOf('!', end),
                    text.lastIndexOf('? ', end),
                    text.lastIndexOf('?\n', end)
                );
                
                // Try to break at single newline
                const lastNewline = text.lastIndexOf('\n', end);
                
                // Try to break at word boundary (space)
                const lastSpace = text.lastIndexOf(' ', end);
                
                // Choose the best break point, preferring paragraph > sentence > newline > space
                // But ensure we don't go too far back (less than 50% of chunk size)
                const minAcceptableEnd = start + (maxChunkSize * 0.5);
                
                let bestBreakPoint = end;
                
                if (lastParagraph > minAcceptableEnd) {
                    bestBreakPoint = lastParagraph + 2; // Include the double newline
                } else if (lastSentence > minAcceptableEnd) {
                    bestBreakPoint = lastSentence + 1; // Include the period/punctuation
                } else if (lastNewline > minAcceptableEnd) {
                    bestBreakPoint = lastNewline + 1; // Include the newline
                } else if (lastSpace > minAcceptableEnd) {
                    bestBreakPoint = lastSpace + 1; // Include the space
                }
                
                end = bestBreakPoint;
            }
            
            const chunk = text.slice(start, end).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
                console.log(`📄 Created chunk ${chunks.length}: ${chunk.length} characters`);
            }
            
            // Move start position with overlap
            start = Math.max(start + maxChunkSize - overlap, end - overlap);
            
            // Prevent infinite loop
            if (start >= text.length) break;
        }
        
        console.log(`✅ Created ${chunks.length} chunks total`);
        
        // Log chunk statistics
        if (chunks.length > 0) {
            const avgSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length;
            const minSize = Math.min(...chunks.map(chunk => chunk.length));
            const maxSize = Math.max(...chunks.map(chunk => chunk.length));
            
            console.log(`📊 Chunk statistics:`);
            console.log(`   Average size: ${Math.round(avgSize)} characters`);
            console.log(`   Min size: ${minSize} characters`);
            console.log(`   Max size: ${maxSize} characters`);
            console.log(`   Total coverage: ${chunks.reduce((sum, chunk) => sum + chunk.length, 0)} characters`);
        }
        
        return chunks;
    }

    // Add a method for recursive chunking of very large documents
    recursiveChunkText(text, maxChunkSize = 4000, overlap = 1000) {
        if (text.length <= maxChunkSize) {
            return [text];
        }

        const chunks = [];
        const separators = ['\n\n', '\n', '. ', ' ', ''];

        function split(text, currentSeparators) {
            if (text.length <= maxChunkSize) {
                return [text];
            }
            if (currentSeparators.length === 0) {
                // Base case: split by character if no separators work
                const result = [];
                for (let i = 0; i < text.length; i += maxChunkSize) {
                    result.push(text.slice(i, i + maxChunkSize));
                }
                return result;
            }

            const separator = currentSeparators[0];
            const parts = text.split(separator);
            const subChunks = [];

            let currentChunk = '';
            for (const part of parts) {
                const potentialChunk = currentChunk + (currentChunk ? separator : '') + part;
                if (potentialChunk.length > maxChunkSize) {
                    if (currentChunk) {
                        subChunks.push(currentChunk);
                    }
                    currentChunk = part;
                } else {
                    currentChunk = potentialChunk;
                }
            }
            if (currentChunk) {
                subChunks.push(currentChunk);
            }
            
            const finalChunks = [];
            for (const subChunk of subChunks) {
                finalChunks.push(...split(subChunk, currentSeparators.slice(1)));
            }
            return finalChunks;
        }
        
        return split(text, separators);
    }
}

module.exports = { EmbeddingService };
