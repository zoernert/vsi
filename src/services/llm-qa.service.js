const { GoogleGenerativeAI } = require('@google/generative-ai');

class LlmQaService {
  constructor(vectorService) {
    this.vectorService = vectorService;
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }

  async askQuestion(userId, collectionId, question, options = {}) {
    try {
      const { systemPrompt, maxResults = 5, maxQueries = 3 } = options;
      
      // Generate query variations
      const queries = await this.generateQueries(question, maxQueries);
      
      // Search for relevant documents
      const allResults = [];
      for (const query of queries) {
        const results = await this.vectorService.searchCollection(userId, collectionId, query, {
          limit: maxResults
        });
        allResults.push(...results);
      }
      
      // Remove duplicates and get top results
      const uniqueResults = allResults.reduce((acc, current) => {
        const exists = acc.find(item => item.id === current.id);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      const topResults = uniqueResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);
      
      // Prepare context from search results
      const context = topResults.map(result => result.content_preview || '').join('\n\n');
      
      // Generate answer using LLM
      const answer = await this.generateAnswer(question, context, systemPrompt);
      
      return {
        answer,
        sources: topResults.map(result => ({
          id: result.id,
          filename: result.filename,
          similarity: result.similarity,
          collection_name: result.collection_name
        })),
        generatedQueries: queries,
        contextUsed: context.length > 0
      };
    } catch (error) {
      console.error('Failed to process question:', error);
      throw error;
    }
  }

  async generateQueries(question, maxQueries = 3) {
    try {
      if (!process.env.GOOGLE_AI_API_KEY) {
        return [question];
      }
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Generate ${maxQueries - 1} alternative search queries for the following question.
        The queries should help find relevant information to answer the question.
        Return only the queries, one per line, without numbering or explanations.
        
        Original question: ${question}
      `;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const alternativeQueries = response.text().split('\n')
        .filter(line => line.trim().length > 0)
        .slice(0, maxQueries - 1);
      
      return [question, ...alternativeQueries];
    } catch (error) {
      console.error('Failed to generate queries:', error);
      return [question];
    }
  }

  async generateAnswer(question, context, systemPrompt = null) {
    try {
      if (!process.env.GOOGLE_AI_API_KEY) {
        return "I'm sorry, but the AI Q&A service is not yet configured. Please check the Google AI API key configuration.";
      }
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const defaultSystemPrompt = `You are a helpful AI assistant. Answer the user's question based on the provided context. 
      If the context doesn't contain enough information to answer the question, say so clearly.
      Be concise but thorough in your response.`;
      
      const finalSystemPrompt = systemPrompt || defaultSystemPrompt;
      
      const prompt = `${finalSystemPrompt}

Context:
${context}

Question: ${question}

Answer:`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Failed to generate answer:', error);
      return "I'm sorry, but I encountered an error while processing your question. Please try again later.";
    }
  }

  // Method for the existing QA controller
  async answerQuestion(qaRequest) {
    const { question, collectionName, systemPrompt, userPrompt, maxResults = 5 } = qaRequest;
    
    try {
      // Search for relevant context using the vector service
      const searchResults = await this.vectorService.search(collectionName, question, maxResults);
      
      const retrievedContext = searchResults.map(result => result.metadata.content);
      
      if (retrievedContext.length === 0) {
        return {
          answer: "I couldn't find any relevant information in the collection to answer your question.",
          retrievedContext: [],
          generatedQueries: [question]
        };
      }
      
      // Generate answer
      const contextText = retrievedContext.join('\n\n');
      const answer = await this.generateAnswer(question, contextText, systemPrompt);
      
      return {
        answer,
        retrievedContext,
        generatedQueries: [question],
        sources: searchResults.map(result => ({
          id: result.id,
          score: result.score
        }))
      };
    } catch (error) {
      console.error('Failed to answer question:', error);
      return {
        answer: "I'm sorry, but I encountered an error while processing your question. Please try again later.",
        retrievedContext: [],
        generatedQueries: [question],
        error: error.message
      };
    }
  }
}

module.exports = { LlmQaService };
