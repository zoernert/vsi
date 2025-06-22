const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Use text-embedding-004 for embeddings (this is the correct embedding model)
const embeddingModel = genAI.getGenerativeModel({ 
    model: 'text-embedding-004'
});

// Use gemini-1.5-flash for text generation if needed
const generativeModel = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash'
});

module.exports = {
    embeddingModel,
    generativeModel,
    genAI
};
