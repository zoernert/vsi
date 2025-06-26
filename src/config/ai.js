module.exports = {
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    models: {
      chat: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
      embedding: process.env.EMBEDDING_MODEL || 'text-embedding-004'
    },
    limits: {
      maxTokensPerRequest: 32000,
      requestsPerMinute: 60,
      embeddingBatchSize: 100
    },
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
      backoffMultiplier: 2
    }
  },
  
  vectorSearch: {
    defaultThreshold: 0.5,
    maxResults: 50,
    embeddingDimensions: 768
  },
  
  processing: {
    timeoutMs: 30000,
    maxConcurrentRequests: 10
  }
};
