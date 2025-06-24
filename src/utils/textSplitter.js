/**
 * Recursive text splitter that tries to split on different separators
 * to maintain semantic coherence while respecting chunk size limits
 */

function splitTextIntoChunks(text, chunkSize = 8000, overlap = 2000) {  // Increased to 8000/2000 (25% overlap)
    if (!text || typeof text !== 'string') {
        return [];
    }

    // If text is smaller than chunk size, return as single chunk
    if (text.length <= chunkSize) {
        return [text];
    }

    const chunks = [];
    const separators = [
        '\n\n\n',  // Multiple newlines (paragraph breaks)
        '\n\n',    // Double newlines (paragraph breaks)
        '\n',      // Single newlines
        '. ',      // Sentence endings
        '! ',      // Exclamation sentences
        '? ',      // Question sentences
        '; ',      // Semicolons
        ', ',      // Commas
        ' ',       // Spaces
        ''         // Character level (last resort)
    ];

    const rawChunks = recursiveSplit(text, chunkSize, overlap, separators, 0);
    
    // Validate all chunks for embedding API compliance
    return rawChunks.map(chunk => validateChunkForEmbedding(chunk)).filter(chunk => chunk.length > 0);
}

function recursiveSplit(text, chunkSize, overlap, separators, separatorIndex) {
    if (!text || text.length === 0) {
        return [];
    }

    // If text fits in chunk size, return it
    if (text.length <= chunkSize) {
        return [text];
    }

    // If we've exhausted all separators, do character-level split
    if (separatorIndex >= separators.length) {
        return characterSplit(text, chunkSize, overlap);
    }

    const separator = separators[separatorIndex];
    const chunks = [];

    // Try to split on current separator
    if (separator === '') {
        // Character-level split as last resort
        return characterSplit(text, chunkSize, overlap);
    }

    const parts = text.split(separator);
    let currentChunk = '';
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partWithSeparator = i < parts.length - 1 ? part + separator : part;
        
        // If adding this part would exceed chunk size
        if (currentChunk.length + partWithSeparator.length > chunkSize) {
            // If current chunk is not empty, save it
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
                
                // Start new chunk with overlap from previous chunk
                if (overlap > 0 && currentChunk.length > overlap) {
                    currentChunk = currentChunk.slice(-overlap) + partWithSeparator;
                } else {
                    currentChunk = partWithSeparator;
                }
            } else {
                // Current chunk is empty but part is too large
                // Try next separator level
                const subChunks = recursiveSplit(partWithSeparator, chunkSize, overlap, separators, separatorIndex + 1);
                chunks.push(...subChunks);
                currentChunk = '';
            }
        } else {
            // Part fits, add to current chunk
            currentChunk += partWithSeparator;
        }
    }

    // Add final chunk if not empty
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
}

function characterSplit(text, chunkSize, overlap) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = start + chunkSize;
        
        // If this is not the last chunk and we're not at the end of text
        if (end < text.length) {
            // Try to find a good breaking point near the end
            let breakPoint = end;
            const searchRange = Math.min(50, chunkSize * 0.1); // Search within 10% of chunk size
            
            // Look backwards for word boundaries
            for (let i = end; i >= end - searchRange && i > start; i--) {
                if (/\s/.test(text[i])) {
                    breakPoint = i;
                    break;
                }
            }
            
            end = breakPoint;
        }

        const chunk = text.slice(start, end).trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        // Move start position with overlap consideration
        start = Math.max(start + 1, end - overlap);
    }

    return chunks;
}

// Helper function to validate chunk size for embedding API
function validateChunkForEmbedding(chunk) {
    const maxBytes = 30000; // Conservative limit (Google's limit is 36000 bytes)
    const chunkBytes = Buffer.byteLength(chunk, 'utf8');
    
    if (chunkBytes > maxBytes) {
        console.warn(`Chunk too large for embedding API: ${chunkBytes} bytes, truncating to ${maxBytes} bytes`);
        // Truncate to fit within byte limit - more conservative approach with larger chunks
        let truncated = chunk;
        while (Buffer.byteLength(truncated, 'utf8') > maxBytes) {
            // Remove 2% of the text at a time for precise control with larger chunks
            const removeLength = Math.max(1, Math.floor(truncated.length * 0.02));
            truncated = truncated.slice(0, -removeLength);
        }
        return truncated.trim();
    }
    
    return chunk;
}

module.exports = {
    splitTextIntoChunks,
    validateChunkForEmbedding
};
