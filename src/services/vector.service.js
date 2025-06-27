const { DatabaseService } = require('./databaseService');
const qdrantClient = require('../config/qdrant');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class VectorService {
  constructor() {
    this.db = null;
    this.qdrantClient = qdrantClient;
  }

  async initializeDatabase() {
    if (!this.db) {
      this.db = new DatabaseService();
      if (!this.db.pool) {
        await this.db.initialize();
      }
    }
  }

  async createCollection(userId, name, description = '') {
    await this.initializeDatabase();
    
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Insert collection into database to get the UUID
      const result = await client.query(
        'INSERT INTO collections (name, description, user_id) VALUES ($1, $2, $3) RETURNING *',
        [name, description, userId]
      );
      const collection = result.rows[0];

      // 2. Use the UUID as the Qdrant collection name
      const qdrantCollectionName = `collection_${collection.id}`;

      // 3. Update the collection with the Qdrant collection name
      await client.query(
        'UPDATE collections SET qdrant_collection_name = $1 WHERE id = $2',
        [qdrantCollectionName, collection.id]
      );

      // 4. Create collection in Qdrant
      await this.qdrantClient.createCollection(qdrantCollectionName, {
        vectors: {
          size: 768,
          distance: 'Cosine'
        }
      });

      await client.query('COMMIT');

      // 5. Return the updated collection
      return {
        ...collection,
        qdrant_collection_name: qdrantCollectionName
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserCollections(userId, includeStats = false) {
    await this.initializeDatabase();
    
    console.log(`🔍 VectorService.getUserCollections called for user ${userId}`);
    
    let query = `
      SELECT c.*, 
             COALESCE(d1.doc_count, d2.doc_count, 0) as document_count 
      FROM collections c 
      LEFT JOIN (
        SELECT collection_id, COUNT(*) as doc_count 
        FROM documents 
        WHERE collection_id IS NOT NULL 
        GROUP BY collection_id
      ) d1 ON c.id = d1.collection_id
      LEFT JOIN (
        SELECT collection_uuid, COUNT(*) as doc_count 
        FROM documents 
        WHERE collection_uuid IS NOT NULL 
        GROUP BY collection_uuid
      ) d2 ON c.uuid = d2.collection_uuid
      WHERE c.user_id = $1 
      ORDER BY c.created_at DESC
    `;
    
    console.log(`🔍 Executing VectorService query: ${query}`);
    console.log(`🔍 Parameters: [${userId}]`);
    
    const result = await this.db.pool.query(query, [userId]);
    
    console.log(`🔍 VectorService query returned ${result.rows.length} rows:`);
    result.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. Collection ${row.id} (${row.name}): ${row.document_count} documents`);
    });
    
    if (includeStats) {
      // Add additional stats for each collection
      for (let collection of result.rows) {
        const stats = await this.getCollectionStats(userId, collection.id);
        collection.stats = stats;
      }
    }
    
    return result.rows;
  }

  async getCollection(userId, collectionId) {
    await this.initializeDatabase();
    const result = await this.db.pool.query(
      'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get collection by UUID (preferred method)
   */
  async getCollectionByUuid(userId, uuid) {
    await this.initializeDatabase();
    const result = await this.db.pool.query(
      'SELECT * FROM collections WHERE uuid = $1 AND user_id = $2',
      [uuid, userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async updateCollection(userId, collectionId, updates) {
    await this.initializeDatabase();
    
    const { name, description } = updates;
    const result = await this.db.pool.query(
      `UPDATE collections 
       SET name = COALESCE($3, name), 
           description = COALESCE($4, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [collectionId, userId, name, description]
    );
    
    return result.rows[0];
  }

  /**
   * Update collection by UUID (preferred method)
   */
  async updateCollectionByUuid(userId, uuid, updates) {
    await this.initializeDatabase();
    
    const { name, description } = updates;
    const result = await this.db.pool.query(
      `UPDATE collections 
       SET name = COALESCE($3, name), 
           description = COALESCE($4, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE uuid = $1 AND user_id = $2 
       RETURNING *`,
      [uuid, userId, name, description]
    );
    
    return result.rows[0];
  }

  async deleteCollection(userId, collectionId) {
    await this.initializeDatabase();
    
    // Get collection info first
    const collection = await this.getCollection(userId, collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }
    
    // Delete from Qdrant
    try {
      await this.qdrantClient.deleteCollection(collection.qdrant_collection_name);
    } catch (error) {
      console.warn('Failed to delete Qdrant collection:', error.message);
    }
    
    // Delete documents first, then collection
    await this.db.pool.query(
      'DELETE FROM documents WHERE collection_id = $1',
      [collectionId]
    );
    
    await this.db.pool.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2',
      [collectionId, userId]
    );
    
    return true;
  }

  /**
   * Delete collection by UUID (preferred method)
   */
  async deleteCollectionByUuid(userId, uuid) {
    await this.initializeDatabase();
    
    // Get collection info first
    const collection = await this.getCollectionByUuid(userId, uuid);
    if (!collection) {
      throw new Error('Collection not found');
    }
    
    // Delete from Qdrant
    try {
      await this.qdrantClient.deleteCollection(collection.qdrant_collection_name);
    } catch (error) {
      console.warn('Failed to delete Qdrant collection:', error.message);
    }
    
    // Delete documents first, then collection using UUID relationships
    await this.db.pool.query(
      'DELETE FROM documents WHERE collection_uuid = $1',
      [uuid]
    );
    
    await this.db.pool.query(
      'DELETE FROM collections WHERE uuid = $1 AND user_id = $2',
      [uuid, userId]
    );
    
    return true;
  }

  async getCollectionStats(userId, collectionId) {
    await this.initializeDatabase();
    
    const result = await this.db.pool.query(
      `SELECT 
        COUNT(d.id) as document_count,
        SUM(length(d.content)) as total_content_size,
        AVG(length(d.content)) as avg_content_size,
        MAX(d.created_at) as last_updated
       FROM documents d 
       JOIN collections c ON d.collection_id = c.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [collectionId, userId]
    );
    
    return result.rows[0] || { 
      document_count: 0, 
      total_content_size: 0,
      avg_content_size: 0,
      last_updated: null
    };
  }

  /**
   * Get collection stats by UUID (preferred method)
   */
  async getCollectionStatsByUuid(userId, uuid) {
    await this.initializeDatabase();
    
    const result = await this.db.pool.query(
      `SELECT 
        COUNT(d.id) as document_count,
        SUM(length(d.content)) as total_content_size,
        AVG(length(d.content)) as avg_content_size,
        MAX(d.created_at) as last_updated
       FROM documents d 
       JOIN collections c ON d.collection_uuid = c.uuid
       WHERE c.uuid = $1 AND c.user_id = $2`,
      [uuid, userId]
    );
    
    return result.rows[0] || { 
      document_count: 0, 
      total_content_size: 0,
      avg_content_size: 0,
      last_updated: null
    };
  }

  async getCollectionDocuments(userId, collectionId, options = {}) {
    await this.initializeDatabase();
    
    const { type, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT d.*, c.name as collection_name
      FROM documents d
      JOIN collections c ON d.collection_id = c.id
      WHERE c.id = $1 AND c.user_id = $2
    `;
    
    const params = [collectionId, userId];
    
    if (type) {
      query += ' AND d.file_type = $3';
      params.push(type);
    }
    
    query += ' ORDER BY d.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await this.db.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get collection documents by UUID (preferred method)
   */
  async getCollectionDocumentsByUuid(userId, uuid, options = {}) {
    await this.initializeDatabase();
    
    const { type, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT d.*, c.name as collection_name
      FROM documents d
      JOIN collections c ON d.collection_uuid = c.uuid
      WHERE c.uuid = $1 AND c.user_id = $2
    `;
    
    const params = [uuid, userId];
    
    if (type) {
      query += ' AND d.file_type = $3';
      params.push(type);
    }
    
    query += ' ORDER BY d.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await this.db.pool.query(query, params);
    return result.rows;
  }

  async searchCollection(userId, collectionId, query, options = {}) {
    await this.initializeDatabase();
    
    const { limit = 10, threshold = 0.5 } = options;
    
    // Get collection info
    const collection = await this.getCollection(userId, collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }
    
    // Generate embedding for search query
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(query);
    const queryEmbedding = result.embedding.values;
    
    // Search in Qdrant
    const searchResult = await this.qdrantClient.search(collection.qdrant_collection_name, {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      with_vector: false,
      score_threshold: threshold
    });
    
    // Get document metadata from PostgreSQL
    const pointIds = searchResult.map(hit => hit.id);
    if (pointIds.length === 0) return [];
    
    const documentsResult = await this.db.pool.query(
      `SELECT d.*, c.name as collection_name
       FROM documents d
       JOIN collections c ON d.collection_id = c.id
       WHERE d.qdrant_point_id = ANY($1)`,
      [pointIds]
    );
    
    // Combine results
    return searchResult.map(hit => {
      const doc = documentsResult.rows.find(d => d.qdrant_point_id === hit.id);
      return {
        id: doc?.id || hit.id,
        filename: doc?.filename || hit.payload?.filename || 'Unknown',
        content_preview: doc?.content_preview || hit.payload?.text?.substring(0, 200) || '',
        file_type: doc?.file_type || 'unknown',
        collection_id: collectionId,
        collection_name: collection.name,
        similarity: hit.score,
        qdrant_point_id: hit.id
      };
    });
  }

  async searchUserCollections(userId, query, options = {}) {
    await this.initializeDatabase();
    
    const { limit = 10, threshold = 0.5 } = options;
    
    // Get all user collections
    const collections = await this.getUserCollections(userId);
    if (collections.length === 0) {
      return { results: [] };
    }
    
    // Generate embedding for search query
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(query);
    const queryEmbedding = result.embedding.values;
    
    const allResults = [];
    
    // Search each collection
    for (const collection of collections) {
      try {
        const searchResult = await this.qdrantClient.search(collection.qdrant_collection_name, {
          vector: queryEmbedding,
          limit,
          with_payload: true,
          with_vector: false,
          score_threshold: threshold
        });
        
        // Add collection info to results
        searchResult.forEach(hit => {
          hit.collection_id = collection.id;
          hit.collection_name = collection.name;
        });
        
        allResults.push(...searchResult);
      } catch (error) {
        console.warn(`Failed to search collection ${collection.name}:`, error.message);
      }
    }
    
    // Sort by score and limit
    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, limit);
    
    // Get document metadata
    const pointIds = topResults.map(hit => hit.id);
    if (pointIds.length === 0) return { results: [] };
    
    const documentsResult = await this.db.pool.query(
      `SELECT d.*, c.name as collection_name
       FROM documents d
       JOIN collections c ON d.collection_id = c.id
       WHERE d.qdrant_point_id = ANY($1)`,
      [pointIds]
    );
    
    const results = topResults.map(hit => {
      const doc = documentsResult.rows.find(d => d.qdrant_point_id === hit.id);
      return {
        id: doc?.id || hit.id,
        filename: doc?.filename || hit.payload?.filename || 'Unknown',
        content_preview: doc?.content_preview || hit.payload?.text?.substring(0, 200) || '',
        file_type: doc?.file_type || 'unknown',
        collection_id: hit.collection_id,
        collection_name: hit.collection_name,
        similarity: hit.score
      };
    });
    
    return { results };
  }

  async publicSearch(query, options = {}) {
    try {
      // TODO: Implement public search across public collections
      console.log(`Public search for "${query}"`);
      return { results: [] };
    } catch (error) {
      console.error('Failed to perform public search:', error);
      throw error;
    }
  }

  async getDocumentContent(userId, documentId) {
    try {
      await this.initializeDatabase();
      
      const result = await this.db.pool.query(
        `SELECT d.*, c.name as collection_name
         FROM documents d
         JOIN collections c ON d.collection_id = c.id
         WHERE d.id = $1 AND c.user_id = $2`,
        [documentId, userId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to get document content:', error);
      throw error;
    }
  }

  async getSimilarDocuments(documentId) {
    try {
      await this.initializeDatabase();
      
      // Get the document and its collection info
      const docResult = await this.db.pool.query(
        `SELECT d.*, c.qdrant_collection_name 
         FROM documents d 
         JOIN collections c ON d.collection_id = c.id 
         WHERE d.id = $1`,
        [documentId]
      );
      
      if (docResult.rows.length === 0) {
        return [];
      }
      
      const document = docResult.rows[0];
      
      // Get the document's vector from Qdrant
      const points = await this.qdrantClient.retrieve(document.qdrant_collection_name, {
        ids: [document.qdrant_point_id],
        with_vector: true
      });
      
      if (points.length === 0) {
        return [];
      }
      
      const embedding = points[0].vector;
      
      // Search for similar documents across all collections
      // This is a simplified implementation - in production you'd want to be more selective
      const collections = await this.db.pool.query('SELECT qdrant_collection_name FROM collections');
      
      const allResults = [];
      for (const collection of collections.rows) {
        try {
          const searchResult = await this.qdrantClient.search(collection.qdrant_collection_name, {
            vector: embedding,
            limit: 10,
            with_payload: true,
            with_vector: false,
            score_threshold: 0.7
          });
          
          allResults.push(...searchResult);
        } catch (error) {
          console.warn(`Failed to search collection ${collection.qdrant_collection_name}:`, error.message);
        }
      }
      
      // Remove the original document and sort by similarity
      const filtered = allResults
        .filter(hit => hit.id !== document.qdrant_point_id)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      return filtered.map(hit => ({
        id: hit.id,
        filename: hit.payload?.filename || 'Unknown',
        similarity: hit.score,
        content_preview: hit.payload?.text?.substring(0, 200) || ''
      }));
    } catch (error) {
      console.error('Failed to get similar documents:', error);
      throw error;
    }
  }

  async addDocument(userId, collectionId, documentData, embedding) {
    try {
      await this.initializeDatabase();
      
      // Get collection info
      const collectionResult = await this.db.pool.query(
        'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, userId]
      );
      
      if (collectionResult.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }
      
      const collection = collectionResult.rows[0];
      const qdrantPointId = uuidv4();
      
      // Add point to Qdrant
      await this.qdrantClient.upsert(collection.qdrant_collection_name, {
        points: [{
          id: qdrantPointId,
          vector: embedding,
          payload: {
            filename: documentData.filename,
            fileType: documentData.fileType,
            collectionId: collectionId,
            userId: userId,
            createdAt: new Date().toISOString()
          }
        }]
      });
      
      // Add metadata to PostgreSQL
      const documentResult = await this.db.pool.query(
        `INSERT INTO documents (filename, content, content_preview, file_type, collection_id, collection_uuid, qdrant_point_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          documentData.filename,
          documentData.content,
          documentData.contentPreview,
          documentData.fileType,
          collectionId,
          collection.uuid,  // Add collection UUID
          qdrantPointId
        ]
      );
      
      console.log(`Added document to collection ${collectionId} with Qdrant point ID ${qdrantPointId}`);
      return documentResult.rows[0];
      
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }
}

module.exports = { VectorService };
