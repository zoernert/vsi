const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
  constructor(db) {
    super(db, 'users');
  }

  async findByUsername(username) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  async findByEmail(email) {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  async createUser(userData) {
    const { username, email, password, isAdmin = false, tier = 'free' } = userData;
    
    const result = await this.db.query(
      `INSERT INTO users (username, email, password_hash, is_admin, tier, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [username, email, password, isAdmin, tier]
    );
    
    return result.rows[0];
  }

  async updateLastLogin(userId) {
    await this.db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  }

  async getUserStats(userId) {
    const collectionsResult = await this.db.query(
      'SELECT COUNT(*) as collections_count FROM collections WHERE user_id = $1',
      [userId]
    );
    
    const documentsResult = await this.db.query(
      `SELECT COUNT(*) as documents_count 
       FROM documents d 
       JOIN collections c ON d.collection_id = c.id 
       WHERE c.user_id = $1`,
      [userId]
    );
    
    return {
      collectionsCount: parseInt(collectionsResult.rows[0].collections_count) || 0,
      documentsCount: parseInt(documentsResult.rows[0].documents_count) || 0
    };
  }

  async findActiveUsers(days = 30) {
    const result = await this.db.query(
      `SELECT id, username, last_login, created_at
       FROM users 
       WHERE last_login > NOW() - INTERVAL '${days} days'
       ORDER BY last_login DESC`,
      []
    );
    return result.rows;
  }
}

module.exports = UserRepository;
