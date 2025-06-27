const BaseRepository = require('./BaseRepository');

class CollectionRepository extends BaseRepository {
  constructor(db) {
    super(db, 'collections');
  }

  /**
   * Validate UUID format
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Find collection by UUID
   */
  async findByUuid(uuid) {
    if (!this.isValidUUID(uuid)) {
      throw new Error('Invalid UUID format');
    }
    
    const result = await this.db.query(
      'SELECT * FROM collections WHERE uuid = $1',
      [uuid]
    );
    return result.rows[0] || null;
  }

  /**
   * Find collection by UUID and user ID
   */
  async findByUuidAndUser(uuid, userId) {
    if (!this.isValidUUID(uuid)) {
      throw new Error('Invalid UUID format');
    }
    
    const result = await this.db.query(
      'SELECT * FROM collections WHERE uuid = $1 AND user_id = $2',
      [uuid, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create collection with UUID support
   */
  async createWithUuid(collectionData) {
    const { name, description, userId, qdrantCollectionName } = collectionData;
    
    const result = await this.db.query(
      `INSERT INTO collections (name, description, user_id, qdrant_collection_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, description, userId, qdrantCollectionName]
    );
    
    return result.rows[0];
  }

  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', sortOrder = 'DESC' } = options;
    
    console.log(`🔍 CollectionRepository.findByUserId called for user ${userId}`);
    
    const query = `SELECT c.*, 
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
       ORDER BY ${orderBy} ${sortOrder} 
       LIMIT $2 OFFSET $3`;
    
    console.log(`🔍 Executing query: ${query}`);
    console.log(`🔍 Parameters: [${userId}, ${limit}, ${offset}]`);
    
    const result = await this.db.query(query, [userId, limit, offset]);
    
    console.log(`🔍 Query returned ${result.rows.length} rows:`);
    result.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. Collection ${row.id} (${row.name}): ${row.document_count} documents`);
    });
    
    return result.rows;
  }

  async findByNameAndUser(name, userId) {
    const result = await this.db.query(
      'SELECT * FROM collections WHERE name = $1 AND user_id = $2',
      [name, userId]
    );
    return result.rows[0] || null;
  }

  async createCollection(collectionData) {
    const { name, description, userId, qdrantCollectionName } = collectionData;
    
    const result = await this.db.query(
      `INSERT INTO collections (name, description, user_id, qdrant_collection_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, description, userId, qdrantCollectionName]
    );
    
    return result.rows[0];
  }

  async countByUserId(userId) {
    const result = await this.db.query(
      'SELECT COUNT(*) FROM collections WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async getCollectionStats(collectionId) {
    const result = await this.db.query(
      `SELECT 
        COUNT(d.id) as document_count,
        SUM(length(d.content)) as total_content_size
       FROM documents d 
       WHERE d.collection_id = $1`,
      [collectionId]
    );
    
    return result.rows[0] || { document_count: 0, total_content_size: 0 };
  }

  /**
   * Get collection stats by UUID
   */
  async getCollectionStatsByUuid(uuid) {
    if (!this.isValidUUID(uuid)) {
      throw new Error('Invalid UUID format');
    }
    
    const result = await this.db.query(
      `SELECT 
        COUNT(d.id) as document_count,
        SUM(length(d.content)) as total_content_size
       FROM documents d 
       INNER JOIN collections c ON d.collection_uuid = c.uuid
       WHERE c.uuid = $1`,
      [uuid]
    );
    
    return result.rows[0] || { document_count: 0, total_content_size: 0 };
  }

  async deleteWithDocuments(collectionId) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Delete documents first
      await client.query('DELETE FROM documents WHERE collection_id = $1', [collectionId]);
      
      // Delete collection
      const result = await client.query(
        'DELETE FROM collections WHERE id = $1 RETURNING *',
        [collectionId]
      );
      
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete collection and documents by UUID
   */
  async deleteWithDocumentsByUuid(uuid) {
    if (!this.isValidUUID(uuid)) {
      throw new Error('Invalid UUID format');
    }
    
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Delete documents using UUID relationship
      await client.query('DELETE FROM documents WHERE collection_uuid = $1', [uuid]);
      
      // Delete collection
      const result = await client.query(
        'DELETE FROM collections WHERE uuid = $1 RETURNING *',
        [uuid]
      );
      
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = CollectionRepository;
