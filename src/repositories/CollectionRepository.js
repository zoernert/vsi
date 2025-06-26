const BaseRepository = require('./BaseRepository');

class CollectionRepository extends BaseRepository {
  constructor(db) {
    super(db, 'collections');
  }

  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', sortOrder = 'DESC' } = options;
    
    const result = await this.db.query(
      `SELECT c.*, COUNT(d.id) as document_count 
       FROM collections c 
       LEFT JOIN documents d ON c.id = d.collection_id 
       WHERE c.user_id = $1 
       GROUP BY c.id 
       ORDER BY ${orderBy} ${sortOrder} 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
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
}

module.exports = CollectionRepository;
