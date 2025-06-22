/**
 * Splits a given text into smaller chunks based on a maximum chunk size.
 * This is a basic character-based splitter. For more advanced splitting (e.g., by paragraphs, sentences, or recursively),
 * a dedicated library like LangChain's text splitters might be used.
 *
 * @param {string} text The input text to split.
 * @param {number} maxChunkSize The maximum size of each chunk.
 * @param {number} overlap The number of characters to overlap between chunks.
 * @returns {Array<string>} An array of text chunks.
 */
function splitTextIntoChunks(text, maxChunkSize = 1000, overlap = 100) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // Handle empty or very short text
    if (text.length <= maxChunkSize) {
        return [text];
    }

    const chunks = [];
    let startIndex = 0;
    
    // Prevent infinite loops and memory issues
    const maxChunks = 10000; // Reasonable limit
    let chunkCount = 0;

    while (startIndex < text.length && chunkCount < maxChunks) {
        let endIndex = startIndex + maxChunkSize;
        
        // Don't exceed text length
        if (endIndex >= text.length) {
            chunks.push(text.substring(startIndex));
            break;
        }

        // Try to break at word boundaries
        let chunk = text.substring(startIndex, endIndex);
        const lastSpaceIndex = chunk.lastIndexOf(' ');
        
        if (lastSpaceIndex > 0 && lastSpaceIndex > maxChunkSize * 0.5) {
            endIndex = startIndex + lastSpaceIndex;
            chunk = text.substring(startIndex, endIndex);
        }

        chunks.push(chunk);
        
        // Move start index with overlap
        startIndex = Math.max(startIndex + 1, endIndex - overlap);
        chunkCount++;
    }

    // Log warning if we hit the chunk limit
    if (chunkCount >= maxChunks) {
        console.warn(`Text splitting stopped at ${maxChunks} chunks to prevent memory issues`);
    }

    return chunks;
}

module.exports = { splitTextIntoChunks };
