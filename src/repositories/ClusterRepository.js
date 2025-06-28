const BaseRepository = require('./BaseRepository');

class ClusterRepository extends BaseRepository {
    constructor(db) {
        super(db, 'clusters');
    }

    async findByUserIdAndName(userId, name) {
        const result = await this.db.query(
            'SELECT * FROM clusters WHERE user_id = $1 AND name = $2',
            [userId, name]
        );
        return result.rows[0] || null;
    }

    async findByUserId(userId, options = {}) {
        const { limit = 50, offset = 0, orderBy = 'created_at', sortOrder = 'DESC' } = options;
        
        const result = await this.db.query(
            `SELECT c.*, 
                    COUNT(col.id) as collection_count,
                    COALESCE(SUM(d.doc_count), 0) as total_documents
             FROM clusters c 
             LEFT JOIN collections col ON c.id = col.cluster_id
             LEFT JOIN (
                 SELECT collection_id, COUNT(*) as doc_count 
                 FROM documents 
                 GROUP BY collection_id
             ) d ON col.id = d.collection_id
             WHERE c.user_id = $1 
             GROUP BY c.id
             ORDER BY ${orderBy} ${sortOrder} 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows;
    }

    async getClusterCollections(clusterId, userId) {
        const result = await this.db.query(
            `SELECT col.*, COUNT(d.id) as document_count
             FROM collections col
             LEFT JOIN documents d ON col.id = d.collection_id
             JOIN clusters c ON col.cluster_id = c.id
             WHERE c.id = $1 AND c.user_id = $2
             GROUP BY col.id
             ORDER BY col.created_at DESC`,
            [clusterId, userId]
        );
        return result.rows;
    }

    async updateClusterSettings(clusterId, settings) {
        const result = await this.db.query(
            'UPDATE clusters SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [JSON.stringify(settings), clusterId]
        );
        return result.rows[0];
    }
}

module.exports = ClusterRepository;
