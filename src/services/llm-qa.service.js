const { GoogleGenerativeAI } = require('@google/generative-ai');

class LlmQaService {
  constructor(vectorService) {
    this.vectorService = vectorService;
    this.logger = console; // Replace with a proper logger
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    } else {
      this.logger.warn('GEMINI_API_KEY not found. Q&A functionality will be disabled.');
    }
  }

  async answerQuestion(qaRequest) {
    const { question, collectionName, systemPrompt, maxResults = 5 } = qaRequest;

    if (!this.genAI) {
      throw new Error('LLM service is not configured.');
    }

    // 1. Search for relevant context in the vector store
    const searchResults = await this.vectorService.search(collectionName, question, maxResults);
    
    const context = searchResults
      .map(result => result.metadata?.content || '')
      .join('\n\n---\n\n');

    if (context.trim() === '') {
      return {
        answer: "I could not find any relevant information in the provided documents to answer your question.",
        sources: [],
        contextUsed: false,
      };
    }

    // 2. Prepare the prompt for the LLM
    const finalSystemPrompt = systemPrompt || 'You are a helpful assistant. Answer the question based ONLY on the provided context. If the answer is not in the context, say so.';
    const prompt = `${finalSystemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

    // 3. Call the LLM to generate an answer
    const model = this.genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    return {
      answer,
      sources: searchResults,
      contextUsed: true,
    };
  }
}

module.exports = { LlmQaService };
