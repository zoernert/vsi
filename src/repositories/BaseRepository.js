class BaseRepository {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
  }

  async findById(id) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAll(options = {}) {
    const { limit = 50, offset = 0, orderBy = 'id', sortOrder = 'ASC' } = options;
    
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${sortOrder} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  async count(conditions = {}) {
    const whereClause = this.buildWhereClause(conditions);
    const query = `SELECT COUNT(*) FROM ${this.tableName}${whereClause.clause}`;
    
    const result = await this.db.query(query, whereClause.values);
    return parseInt(result.rows[0].count);
  }

  async create(data) {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async update(id, data) {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await this.db.query(query, [id, ...values]);
    return result.rows[0] || null;
  }

  async delete(id) {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findWhere(conditions = {}) {
    const whereClause = this.buildWhereClause(conditions);
    const query = `SELECT * FROM ${this.tableName}${whereClause.clause}`;
    
    const result = await this.db.query(query, whereClause.values);
    return result.rows;
  }

  buildWhereClause(conditions) {
    const keys = Object.keys(conditions);
    if (keys.length === 0) {
      return { clause: '', values: [] };
    }

    const clause = ' WHERE ' + keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    const values = Object.values(conditions);
    
    return { clause, values };
  }
}

module.exports = BaseRepository;
