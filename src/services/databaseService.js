const { Pool } = require('pg');

class DatabaseService {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });
    }

    // User management (replaces JSON file operations)
    async getUser(username) {
        const result = await this.pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0];
    }

    async createUser(userData) {
        const { username, password, email, isAdmin = false, tier = 'free', createdBy = 'self-registration' } = userData;
        
        const result = await this.pool.query(`
            INSERT INTO users (username, password, email, is_admin, tier, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [username, password, email, isAdmin, tier, createdBy]);
        
        return result.rows[0];
    }

    async getAllUsers() {
        try {
            const result = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
            return result.rows;
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    async updateUser(identifier, updates) {
        // Handle both username and ID lookups
        const isId = typeof identifier === 'number' || (!isNaN(identifier) && !isNaN(parseFloat(identifier)));
        const field = isId ? 'id' : 'username';
        
        const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 2}`).join(', ');
        const values = [identifier, ...Object.values(updates)];
        
        const result = await this.pool.query(`
            UPDATE users SET ${setClause}, updated_at = NOW()
            WHERE ${field} = $1
            RETURNING *
        `, values);
        
        return result.rows[0];
    }

    async deleteUser(username) {
        await this.pool.query('DELETE FROM users WHERE username = $1', [username]);
    }

    // Usage tracking
    async trackUsage(userId, resourceType, amount = 1, endpoint = null) {
        await this.pool.query(`
            INSERT INTO usage_tracking (user_id, resource_type, amount, endpoint)
            VALUES ($1, $2, $3, $4)
        `, [userId, resourceType, amount, endpoint]);
    }

    async getCurrentUsage(userId, resourceType) {
        try {
            const result = await this.pool.query(
                'SELECT COALESCE(SUM(amount), 0) as total FROM usage_tracking WHERE user_id = $1 AND resource_type = $2',
                [userId, resourceType]
            );
            return parseInt(result.rows[0].total) || 0;
        } catch (error) {
            console.error('Error getting current usage:', error);
            return 0;
        }
    }

    async getUserTier(userId) {
        try {
            const result = await this.pool.query('SELECT tier FROM users WHERE id = $1', [userId]);
            return result.rows.length > 0 ? result.rows[0].tier : 'free';
        } catch (error) {
            console.error('Error getting user tier:', error);
            return 'free'; // Default to free tier on error
        }
    }
}

module.exports = { DatabaseService };
