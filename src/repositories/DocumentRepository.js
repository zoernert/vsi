const BaseRepository = require('./BaseRepository');
const qdrantClient = require('../config/qdrant');

class DocumentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'documents');
  }

  async findByCollectionId(collectionId, options = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', sortOrder = 'DESC' } = options;
    
    const result = await this.db.query(
      `SELECT id, filename, content_preview, file_type, qdrant_point_id, created_at, updated_at
       FROM documents 
       WHERE collection_id = $1 
       ORDER BY ${orderBy} ${sortOrder} 
       LIMIT $2 OFFSET $3`,
      [collectionId, limit, offset]
    );
    return result.rows;
  }

  async createDocument(documentData) {
    const { filename, content, contentPreview, fileType, collectionId, qdrantPointId } = documentData;
    
    const result = await this.db.query(
      `INSERT INTO documents (filename, content, content_preview, file_type, collection_id, qdrant_point_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [filename, content, contentPreview, fileType, collectionId, qdrantPointId]
    );
    
    return result.rows[0];
  }

  async searchSimilar(embedding, collectionId = null, limit = 10, threshold = 0.5) {
    // Get collection info to know which Qdrant collection to search
    let qdrantCollectionName;
    
    if (collectionId) {
      const collectionResult = await this.db.query(
        'SELECT c.qdrant_collection_name FROM collections c WHERE c.id = $1',
        [collectionId]
      );
      
      if (collectionResult.rows.length === 0) {
        return [];
      }
      
      qdrantCollectionName = collectionResult.rows[0].qdrant_collection_name;
      
      // Search in specific Qdrant collection
      const searchResult = await qdrantClient.search(qdrantCollectionName, {
        vector: embedding,
        limit,
        with_payload: true,
        with_vector: false,
        score_threshold: threshold
      });
      
      // Get document metadata from PostgreSQL
      const pointIds = searchResult.map(hit => hit.id);
      if (pointIds.length === 0) return [];
      
      const documentsResult = await this.db.query(
        `SELECT d.*, c.name as collection_name
         FROM documents d
         JOIN collections c ON d.collection_id = c.id
         WHERE d.qdrant_point_id = ANY($1)`,
        [pointIds]
      );
      
      // Combine Qdrant results with PostgreSQL metadata
      return searchResult.map(hit => {
        const doc = documentsResult.rows.find(d => d.qdrant_point_id === hit.id);
        return {
          id: doc?.id || hit.id,
          filename: doc?.filename || 'Unknown',
          content_preview: doc?.content_preview || '',
          file_type: doc?.file_type || 'unknown',
          collection_id: doc?.collection_id || collectionId,
          collection_name: doc?.collection_name || 'Unknown',
          similarity: hit.score,
          qdrant_point_id: hit.id
        };
      });
      
    } else {
      // Search across all user collections
      // First get all collection names for the user
      const collectionsResult = await this.db.query(
        'SELECT qdrant_collection_name FROM collections'
      );
      
      const allResults = [];
      
      for (const collection of collectionsResult.rows) {
        try {
          const searchResult = await qdrantClient.search(collection.qdrant_collection_name, {
            vector: embedding,
            limit,
            with_payload: true,
            with_vector: false,
            score_threshold: threshold
          });
          
          allResults.push(...searchResult);
        } catch (error) {
          // Skip collections that don't exist or have errors
          console.warn(`Failed to search collection ${collection.qdrant_collection_name}:`, error.message);
        }
      }
      
      // Sort by score and limit
      allResults.sort((a, b) => b.score - a.score);
      const topResults = allResults.slice(0, limit);
      
      // Get document metadata from PostgreSQL
      const pointIds = topResults.map(hit => hit.id);
      if (pointIds.length === 0) return [];
      
      const documentsResult = await this.db.query(
        `SELECT d.*, c.name as collection_name
         FROM documents d
         JOIN collections c ON d.collection_id = c.id
         WHERE d.qdrant_point_id = ANY($1)`,
        [pointIds]
      );
      
      // Combine results
      return topResults.map(hit => {
        const doc = documentsResult.rows.find(d => d.qdrant_point_id === hit.id);
        return {
          id: doc?.id || hit.id,
          filename: doc?.filename || 'Unknown',
          content_preview: doc?.content_preview || '',
          file_type: doc?.file_type || 'unknown',
          collection_id: doc?.collection_id,
          collection_name: doc?.collection_name || 'Unknown',
          similarity: hit.score,
          qdrant_point_id: hit.id
        };
      });
    }
  }

  async getPoint(qdrantCollectionName, pointId) {
    const points = await qdrantClient.retrieve(qdrantCollectionName, {
      ids: [pointId],
      with_vector: true
    });
    return points[0] || null;
  }

  async getDocumentWithContent(documentId) {
    const result = await this.db.query(
      `SELECT d.*, c.name as collection_name, c.user_id, c.qdrant_collection_name
       FROM documents d
       JOIN collections c ON d.collection_id = c.id
       WHERE d.id = $1`,
      [documentId]
    );
    return result.rows[0] || null;
  }

  async updateDocument(documentId, updateData) {
    const { filename, content, contentPreview, fileType } = updateData;
    
    const result = await this.db.query(
      `UPDATE documents 
       SET filename = COALESCE($2, filename),
           content = COALESCE($3, content),
           content_preview = COALESCE($4, content_preview),
           file_type = COALESCE($5, file_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [documentId, filename, content, contentPreview, fileType]
    );
    return result.rows[0] || null;
  }

  async deleteByCollectionId(collectionId) {
    const result = await this.db.query(
      'DELETE FROM documents WHERE collection_id = $1 RETURNING id, qdrant_point_id',
      [collectionId]
    );
    return result.rows;
  }

  async deleteDocument(documentId) {
    const result = await this.db.query(
      'DELETE FROM documents WHERE id = $1 RETURNING qdrant_point_id, collection_id',
      [documentId]
    );
    return result.rows[0] || null;
  }

  async countByCollectionId(collectionId) {
    const result = await this.db.query(
      'SELECT COUNT(*) FROM documents WHERE collection_id = $1',
      [collectionId]
    );
    return parseInt(result.rows[0].count);
  }

  async findByQdrantPointId(qdrantPointId) {
    const result = await this.db.query(
      'SELECT * FROM documents WHERE qdrant_point_id = $1',
      [qdrantPointId]
    );
    return result.rows[0] || null;
  }
}

module.exports = DocumentRepository;
