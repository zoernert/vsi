const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');
const { createContextLogger } = require('../../utils/logger');

class SearchApplicationService {
  constructor(documentRepository, collectionRepository, config) {
    this.documentRepository = documentRepository;
    this.collectionRepository = collectionRepository;
    this.config = config;
    this.logger = createContextLogger('SearchApplicationService');
    
    if (config.ai.googleApiKey) {
      this.genAI = new GoogleGenerativeAI(config.ai.googleApiKey);
    }
  }

  async generateEmbedding(text) {
    if (!this.genAI) {
      throw new Error('Google AI API key not configured');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: this.config.ai.embeddingModel });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      this.logger.error('Failed to generate embedding', { error: error.message });
      throw new Error('Failed to generate embedding for search query');
    }
  }

  async searchDocuments(query, options = {}) {
    const {
      collectionId = null,
      limit = 10,
      threshold = 0.5,
      userId = null
    } = options;

    // Generate embedding for search query
    const queryEmbedding = await this.generateEmbedding(query);

    // If collectionId is provided, verify access
    if (collectionId && userId) {
      const collection = await this.collectionRepository.findById(collectionId);
      if (!collection) {
        throw new NotFoundError('Collection');
      }
      if (collection.user_id !== userId) {
        throw new ValidationError('Access denied to this collection');
      }
    }

    // Perform vector similarity search
    const results = await this.documentRepository.searchSimilar(
      queryEmbedding,
      collectionId,
      limit,
      threshold
    );

    this.logger.info('Search performed', {
      query: query.substring(0, 100),
      collectionId,
      userId,
      resultCount: results.length
    });

    return {
      query,
      results: results.map(result => ({
        id: result.id,
        filename: result.filename,
        contentPreview: result.content_preview,
        fileType: result.file_type,
        collectionId: result.collection_id,
        collectionName: result.collection_name,
        similarity: parseFloat(result.similarity.toFixed(4))
      })),
      metadata: {
        searchTime: new Date().toISOString(),
        threshold,
        totalResults: results.length
      }
    };
  }

  async searchInUserCollections(userId, query, options = {}) {
    const { limit = 10, threshold = 0.5 } = options;

    // Generate embedding for search query
    const queryEmbedding = await this.generateEmbedding(query);

    // Get all user collections for filtering
    const userCollections = await this.collectionRepository.findByUserId(userId);
    const collectionIds = userCollections.map(c => c.id);

    if (collectionIds.length === 0) {
      return {
        query,
        results: [],
        metadata: {
          searchTime: new Date().toISOString(),
          threshold,
          totalResults: 0
        }
      };
    }

    // Search across all user collections using database
    const allResults = await this.documentRepository.searchSimilar(
      queryEmbedding,
      null, // Search all collections
      limit * 2, // Get more results to filter
      threshold
    );

    // Filter results to only include user's collections
    const userResults = allResults.filter(result => 
      collectionIds.includes(result.collection_id)
    ).slice(0, limit);

    this.logger.info('User collection search performed', {
      query: query.substring(0, 100),
      userId,
      userCollectionCount: collectionIds.length,
      resultCount: userResults.length
    });

    return {
      query,
      results: userResults.map(result => ({
        id: result.id,
        filename: result.filename,
        contentPreview: result.content_preview,
        fileType: result.file_type,
        collectionId: result.collection_id,
        collectionName: result.collection_name,
        similarity: parseFloat(result.similarity.toFixed(4))
      })),
      metadata: {
        searchTime: new Date().toISOString(),
        threshold,
        totalResults: userResults.length,
        searchedCollections: collectionIds.length
      }
    };
  }

  async getDocumentContent(documentId, userId = null) {
    const document = await this.documentRepository.getDocumentWithContent(documentId);
    
    if (!document) {
      throw new NotFoundError('Document');
    }

    // If userId is provided, verify access
    if (userId && document.user_id !== userId) {
      throw new ValidationError('Access denied to this document');
    }

    return {
      id: document.id,
      filename: document.filename,
      content: document.content,
      fileType: document.file_type,
      collectionId: document.collection_id,
      collectionName: document.collection_name,
      createdAt: document.created_at,
      updatedAt: document.updated_at
    };
  }

  async getSimilarDocuments(documentId, options = {}) {
    const { limit = 5, threshold = 0.7 } = options;

    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    // Parse the embedding from the document
    const embedding = JSON.parse(document.embedding);

    // Find similar documents
    const results = await this.documentRepository.searchSimilar(
      embedding,
      null, // Search across all collections
      limit + 1, // Get one extra to exclude the source document
      threshold
    );

    // Filter out the source document
    const similarDocuments = results.filter(result => result.id !== documentId).slice(0, limit);

    return {
      sourceDocument: {
        id: document.id,
        filename: document.filename,
        fileType: document.file_type
      },
      similarDocuments: similarDocuments.map(result => ({
        id: result.id,
        filename: result.filename,
        contentPreview: result.content_preview,
        fileType: result.file_type,
        collectionId: result.collection_id,
        collectionName: result.collection_name,
        similarity: parseFloat(result.similarity.toFixed(4))
      }))
    };
  }
}

module.exports = SearchApplicationService;
