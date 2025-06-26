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
    recursiveChunkText(text, maxChunkSize = 4000, overlap = 1000, maxDepth = 3, currentDepth = 0) {
        console.log(`🔄 Recursive chunking at depth ${currentDepth}, text length: ${text.length}`);
        
        // If text is small enough or we've reached max depth, use regular chunking
        if (text.length <= maxChunkSize * 2 || currentDepth >= maxDepth) {
            return this.chunkText(text, maxChunkSize, overlap);
        }
        
        // For very large texts, first split by major sections
        let majorChunks = [];
        
        if (currentDepth === 0) {
            // First level: split by major section markers
            const sectionMarkers = [
                /\n#{1,3}\s+/g,  // Markdown headers
                /\n\d+\.\s+/g,   // Numbered sections
                /\n[A-Z][A-Z\s]{10,}\n/g, // ALL CAPS section headers
                /\n\n[A-Z][^.!?]*[.!?]\n\n/g // Paragraph headers
            ];
            
            let bestSplit = this.findBestSplit(text, sectionMarkers);
            if (bestSplit.length > 1) {
                majorChunks = bestSplit;
            }
        }
        
        // If no major sections found, split by paragraphs
        if (majorChunks.length <= 1) {
            majorChunks = text.split(/\n\n+/).filter(chunk => chunk.trim().length > 0);
        }
        
        // If still no good splits, split by sentences
        if (majorChunks.length <= 1) {
            majorChunks = text.split(/[.!?]+\s+/).filter(chunk => chunk.trim().length > 0);
        }
        
        // Recursively chunk each major section
        const allChunks = [];
        for (const majorChunk of majorChunks) {
            if (majorChunk.length > maxChunkSize) {
                const subChunks = this.recursiveChunkText(
                    majorChunk, 
                    maxChunkSize, 
                    overlap, 
                    maxDepth, 
                    currentDepth + 1
                );
                allChunks.push(...subChunks);
            } else if (majorChunk.trim().length > 0) {
                allChunks.push(majorChunk.trim());
            }
        }
        
        console.log(`✅ Recursive chunking completed at depth ${currentDepth}: ${allChunks.length} chunks`);
        return allChunks;
    }
    
    findBestSplit(text, patterns) {
        for (const pattern of patterns) {
            const matches = Array.from(text.matchAll(pattern));
            if (matches.length > 1) {
                const splits = [];
                let lastIndex = 0;
                
                for (const match of matches) {
                    if (match.index > lastIndex) {
                        splits.push(text.slice(lastIndex, match.index).trim());
                    }
                    lastIndex = match.index;
                }
                
                // Add the final section
                if (lastIndex < text.length) {
                    splits.push(text.slice(lastIndex).trim());
                }
                
                // Filter out very small sections
                const validSplits = splits.filter(split => split.length > 100);
                if (validSplits.length > 1) {
                    console.log(`📑 Found ${validSplits.length} sections using pattern: ${pattern}`);
                    return validSplits;
                }
            }
        }
        return [text];
    }
}

module.exports = { EmbeddingService };
