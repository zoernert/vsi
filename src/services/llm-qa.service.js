const { GoogleGenerativeAI } = require('@google/generative-ai');

class LlmQaService {
  constructor(vectorService) {
    this.vectorService = vectorService;
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use configurable model name with fallback to gemini-2.5-flash
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async answerQuestion(request) {
    const queries = await this.generateQueryVariations(request.question);
    const context = await this.retrieveContext(queries, request.collectionName, request.maxResults || 5);
    const answer = await this.generateAnswer(request.question, context, request.systemPrompt, request.userPrompt);

    return {
      answer,
      queries,
      retrievedContext: context,
    };
  }

  async generateQueryVariations(question) {
    try {
      const prompt = `Generate 3-5 different variations of the given question to improve search results. Return each variation on a new line.

Question: ${question}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const variations = text
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);

      return [question, ...variations];
    } catch (error) {
      console.warn('Failed to generate query variations:', error);
      return [question]; // Fallback to original question only
    }
  }

  async retrieveContext(queries, collectionName, maxResults) {
    const allResults = new Set();

    for (const query of queries) {
      try {
        const results = await this.vectorService.search(collectionName, query, maxResults);
        results.forEach(result => {
          if (result.metadata?.content) {
            allResults.add(result.metadata.content);
          }
        });
      } catch (error) {
        console.warn(`Search failed for query: ${query}`, error);
      }
    }

    return Array.from(allResults);
  }

  async generateAnswer(question, context, systemPrompt, userPrompt) {
    try {
      const defaultSystemPrompt = 'You are a helpful assistant. Answer the question based on the provided context. If the context does not contain enough information to answer the question, say so clearly.';
      const defaultUserPrompt = `Context:\n${context.join('\n\n')}\n\nQuestion: ${question}`;

      const finalPrompt = systemPrompt 
        ? `${systemPrompt}\n\n${userPrompt || defaultUserPrompt}`
        : defaultUserPrompt;

      const result = await this.model.generateContent(finalPrompt);
      const response = await result.response;
      
      return response.text() || 'No answer generated.';
    } catch (error) {
      console.error('Failed to generate answer:', error);
      return `Error generating answer: ${error.message}`;
    }
  }
}

module.exports = { LlmQaService };
