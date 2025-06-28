const { VectorService } = require('./vector.service');
const { SmartContextService } = require('./smartContextService');
const { ClusterService } = require('./clusterService');
const { AnalyticsService } = require('./analyticsService');
const { UserService } = require('./userService');
const jwt = require('jsonwebtoken');

class McpService {
  constructor() {
    this.vectorService = new VectorService();
    this.smartContextService = new SmartContextService();
    this.clusterService = new ClusterService();
    this.analyticsService = new AnalyticsService();
    this.userService = new UserService();
  }

  // Helper function to verify JWT token and get user info
  async authenticateUser(token) {
    if (!token) {
      throw new Error('Authentication token required');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await this.userService.getUserById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      throw new Error('Invalid authentication token');
    }
  }

  // Get user-specific collection name
  getUserCollectionName(userId, collectionName) {
    return `user_${userId}_${collectionName}`;
  }

  // List collections for authenticated user
  async listCollections(token) {
    const user = await this.authenticateUser(token);
    const collections = await this.vectorService.getUserCollections(user.id, true);
    
    return {
      status: 'success',
      collections: collections.map(col => ({
        id: col.id,
        name: col.name,
        description: col.description,
        document_count: col.document_count || 0,
        cluster_name: col.cluster_name,
        created_at: col.created_at,
        qdrant_collection_name: col.qdrant_collection_name
      }))
    };
  }

  // Create collection for authenticated user
  async createCollection(token, name, description = '', vector_size = 768, distance = 'Cosine') {
    const user = await this.authenticateUser(token);
    
    const collection = await this.vectorService.createCollection(user.id, name, description);
    
    return {
      status: 'success',
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        qdrant_collection_name: collection.qdrant_collection_name,
        created_at: collection.created_at
      }
    };
  }

  // Delete collection for authenticated user
  async deleteCollection(token, collectionName) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    await this.vectorService.deleteCollection(user.id, collection.id);
    
    return {
      status: 'success',
      message: `Collection '${collectionName}' deleted successfully`
    };
  }

  // Add document to collection for authenticated user
  async addDocument(token, collectionName, title, content, metadata = {}) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    // Create text document data
    const documentData = {
      filename: title,
      content: content,
      contentPreview: content.length > 200 ? content.substring(0, 200) + '...' : content,
      fileType: 'text/plain',
      metadata: metadata
    };

    // Generate embedding for the content
    const { EmbeddingService } = require('./embeddingService');
    const embeddingService = new EmbeddingService();
    const text = `${title}\n\n${content}`;
    const embedding = await embeddingService.generateEmbedding(text);

    const document = await this.vectorService.addDocument(
      user.id,
      collection.id,
      documentData,
      embedding
    );
    
    return {
      status: 'success',
      document: {
        id: document.id,
        title: document.filename,
        content: document.content,
        metadata: document.metadata || metadata,
        created_at: document.created_at
      }
    };
  }

  // Upload file to collection for authenticated user
  async uploadFile(token, collectionName, filename, content, mimeType = null) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    // Decode base64 content
    const buffer = Buffer.from(content, 'base64');
    
    // Process the file using document processor
    const { DocumentProcessor } = require('./documentProcessor');
    const documentProcessor = new DocumentProcessor();
    
    // Create temporary file for processing
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempFilePath = path.join(os.tmpdir(), `mcp_upload_${Date.now()}_${filename}`);
    fs.writeFileSync(tempFilePath, buffer);
    
    try {
      // Extract text content
      const extractedText = await documentProcessor.extractText(tempFilePath, mimeType);
      
      // Create document data
      const documentData = {
        filename: filename,
        content: extractedText,
        contentPreview: extractedText.length > 200 ? extractedText.substring(0, 200) + '...' : extractedText,
        fileType: mimeType || 'application/octet-stream'
      };

      // Generate embedding for the content
      const { EmbeddingService } = require('./embeddingService');
      const embeddingService = new EmbeddingService();
      const embedding = await embeddingService.generateEmbedding(extractedText);

      const document = await this.vectorService.addDocument(
        user.id,
        collection.id,
        documentData,
        embedding
      );
      
      return {
        status: 'success',
        document: {
          id: document.id,
          filename: document.filename,
          size: buffer.length,
          created_at: document.created_at
        }
      };
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  // Search documents in collection for authenticated user
  async searchDocuments(token, collectionName, query, limit = 10, scoreThreshold = 0.0) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    const results = await this.vectorService.searchCollection(
      user.id,
      collection.id,
      query,
      { limit, scoreThreshold }
    );
    
    return {
      status: 'success',
      results: results.map(result => ({
        id: result.id,
        title: result.filename,
        content: result.content,
        score: result.score,
        metadata: result.metadata
      }))
    };
  }

  // Ask question using LLM for authenticated user  
  async askQuestion(token, collectionName, question, context_limit = 5) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    // Search for relevant documents first
    const searchResults = await this.vectorService.searchCollection(
      user.id,
      collection.id,
      question,
      { limit: context_limit }
    );

    if (searchResults.length === 0) {
      return {
        status: 'success',
        question,
        answer: "I couldn't find any relevant information in the collection to answer your question.",
        sources: []
      };
    }

    // Use LLM Q&A service if available
    try {
      const { LLMQAService } = require('./llm-qa.service');
      const llmService = new LLMQAService();
      
      const context = searchResults.map(doc => doc.content || '').join('\n\n---\n\n');
      const answer = await llmService.generateAnswer(question, context);
      
      return {
        status: 'success',
        question,
        answer: answer.answer || answer,
        sources: searchResults.map(doc => ({
          id: doc.id,
          title: doc.filename,
          score: doc.score
        }))
      };
    } catch (error) {
      // Fallback to simple context return
      return {
        status: 'success',
        question,
        answer: "Here are the relevant documents I found:\n\n" + 
               searchResults.map((doc, i) => `${i+1}. ${doc.filename}: ${doc.content?.substring(0, 300)}...`).join('\n\n'),
        sources: searchResults.map(doc => ({
          id: doc.id,
          title: doc.filename,
          score: doc.score
        }))
      };
    }
  }

  // Get specific document for authenticated user
  async getDocument(token, collectionName, documentId) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    const document = await this.vectorService.getDocumentContent(user.id, documentId);
    
    if (!document) {
      throw new Error(`Document '${documentId}' not found`);
    }
    
    return {
      status: 'success',
      document: {
        id: document.id,
        title: document.filename,
        content: document.content,
        metadata: document.metadata,
        created_at: document.created_at
      }
    };
  }

  // Delete document for authenticated user
  async deleteDocument(token, collectionName, documentId) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    // Delete from database (this should also handle Qdrant cleanup)
    await this.vectorService.initializeDatabase();
    const result = await this.vectorService.db.pool.query(
      'DELETE FROM documents WHERE id = $1 AND collection_id = $2 RETURNING *',
      [documentId, collection.id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Document '${documentId}' not found in collection '${collectionName}'`);
    }

    // Also delete from Qdrant if qdrant_point_id exists
    const deletedDoc = result.rows[0];
    if (deletedDoc.qdrant_point_id) {
      try {
        await this.vectorService.qdrantClient.delete(collection.qdrant_collection_name, {
          points: [deletedDoc.qdrant_point_id]
        });
      } catch (error) {
        console.warn('Failed to delete from Qdrant:', error.message);
      }
    }
    
    return {
      status: 'success',
      message: `Document '${documentId}' deleted successfully`
    };
  }

  // List documents in collection for authenticated user
  async listDocuments(token, collectionName, limit = 50, offset = 0) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    const documents = await this.vectorService.getCollectionDocuments(
      user.id, 
      collection.id, 
      { limit, offset }
    );
    
    return {
      status: 'success',
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.filename,
        content: doc.content ? doc.content.substring(0, 200) + '...' : '',
        metadata: doc.metadata,
        created_at: doc.created_at
      })),
      total: documents.length
    };
  }

  // Get collection info for authenticated user
  async getCollectionInfo(token, collectionName) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id, true);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    return {
      status: 'success',
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        document_count: collection.document_count || 0,
        cluster_name: collection.cluster_name,
        created_at: collection.created_at,
        qdrant_collection_name: collection.qdrant_collection_name
      }
    };
  }

  // NEW: Cluster management operations
  async listClusters(token) {
    const user = await this.authenticateUser(token);
    const clusters = await this.clusterService.getUserClusters(user.id);
    
    return {
      status: 'success',
      clusters: clusters.map(cluster => ({
        id: cluster.id,
        name: cluster.name,
        description: cluster.description,
        cluster_type: cluster.cluster_type,
        collection_count: cluster.collection_count || 0,
        created_at: cluster.created_at
      }))
    };
  }

  async createCluster(token, name, description = '') {
    const user = await this.authenticateUser(token);
    const cluster = await this.clusterService.createCluster(user.id, {
      name,
      description,
      type: 'logical'
    });
    
    return {
      status: 'success',
      cluster: {
        id: cluster.id,
        name: cluster.name,
        description: cluster.description,
        cluster_type: cluster.cluster_type,
        created_at: cluster.created_at
      }
    };
  }

  async deleteCluster(token, clusterId) {
    const user = await this.authenticateUser(token);
    await this.clusterService.deleteCluster(clusterId, user.id);
    
    return {
      status: 'success',
      message: `Cluster '${clusterId}' deleted successfully`
    };
  }

  // NEW: Smart context generation
  async generateSmartContext(token, collectionName, query, maxTokens = 4000) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    const context = await this.smartContextService.createSmartContext(
      user.id,
      collection.id,
      query,
      { maxContextSize: maxTokens }
    );
    
    return {
      status: 'success',
      context: context.context,
      sources: context.sources || [],
      token_count: context.contextSize || 0,
      cluster_info: context.clusterInfo
    };
  }

  // NEW: Analytics operations
  async getCollectionAnalytics(token, collectionName) {
    const user = await this.authenticateUser(token);
    
    // Find collection by name for this user
    const collections = await this.vectorService.getUserCollections(user.id);
    const collection = collections.find(c => c.name === collectionName);
    
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found for user`);
    }

    // Get collection-specific analytics
    const stats = await this.vectorService.getCollectionStats(user.id, collection.id);
    
    return {
      status: 'success',
      analytics: {
        collection_id: collection.id,
        collection_name: collection.name,
        document_count: stats.document_count || 0,
        total_size: stats.total_size || 0,
        created_at: collection.created_at,
        cluster_name: collection.cluster_name,
        last_updated: stats.last_updated
      }
    };
  }

  async getUserAnalytics(token) {
    const user = await this.authenticateUser(token);
    
    // Get user collections for overview
    const collections = await this.vectorService.getUserCollections(user.id, true);
    const clusters = await this.clusterService.getUserClusters(user.id);
    
    // Calculate totals
    const totalCollections = collections.length;
    const totalDocuments = collections.reduce((sum, col) => sum + (col.document_count || 0), 0);
    const totalClusters = clusters.length;
    
    return {
      status: 'success',
      analytics: {
        user_id: user.id,
        username: user.username,
        total_collections: totalCollections,
        total_documents: totalDocuments,
        total_clusters: totalClusters,
        collections_by_cluster: clusters.map(cluster => ({
          cluster_name: cluster.name,
          collection_count: collections.filter(col => col.cluster_id === cluster.id).length
        })),
        recent_collections: collections.slice(0, 5).map(col => ({
          name: col.name,
          document_count: col.document_count || 0,
          created_at: col.created_at
        }))
      }
    };
  }
}

module.exports = { McpService };
