const { Pool } = require('pg');

class DatabaseService {
    constructor() {
        this.pool = null;
        this.initializeConnection();
    }

    initializeConnection() {
        // Initialize connection with environment variables
        const config = {
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'vsi_vector_store',
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };

        this.pool = new Pool(config);

        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });
    }

    async initialize() {
        if (!this.pool) {
            this.initializeConnection();
        }
    }

    async getClient() {
        if (!this.pool) {
            await this.initialize();
        }
        return this.pool.connect();
    }

    async query(text, params) {
        if (!this.pool) {
            await this.initialize();
        }
        return this.pool.query(text, params);
    }

    async findUserByUsername(username) {
        try {
            console.log('Looking up user by username:', username);
            const result = await this.pool.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );
            const user = result.rows[0];
            if (user) {
                console.log('User found:', {
                    id: user.id,
                    username: user.username,
                    hasPasswordHash: !!user.password_hash,
                    isAdmin: user.is_admin
                });
            } else {
                console.log('No user found with username:', username);
            }
            return user;
        } catch (error) {
            console.error('Database error in findUserByUsername:', error);
            throw error;
        }
    }

    async findUserById(id) {
        try {
            const result = await this.pool.query(
                'SELECT * FROM users WHERE id = $1',
                [id]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Database error in findUserById:', error);
            throw error;
        }
    }

    async createUser(username, passwordHash, isAdmin = false) {
        try {
            console.log('Creating user:', { username, isAdmin, hasPasswordHash: !!passwordHash });
            
            if (!username || !passwordHash) {
                throw new Error('Username and password hash are required');
            }
            
            const result = await this.pool.query(
                'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING *',
                [username, passwordHash, isAdmin]
            );
            
            const user = result.rows[0];
            console.log('User created successfully:', {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin
            });
            
            return user;
        } catch (error) {
            console.error('Database error in createUser:', error);
            
            // Handle unique constraint violation
            if (error.code === '23505') {
                throw new Error('Username already exists');
            }
            
            throw error;
        }
    }

    async updateUser(id, updates) {
        try {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
            
            const result = await this.pool.query(
                `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
                [id, ...values]
            );

            // When updating user, ensure the column exists:
            await this.pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date(), id]);

            return result.rows[0];
        } catch (error) {
            console.error('Database error in updateUser:', error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
        } catch (error) {
            console.error('Database error in deleteUser:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            const result = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
            return result.rows;
        } catch (error) {
            console.error('Database error in getAllUsers:', error);
            throw error;
        }
    }

    async getActiveUsers() {
        try {
            const result = await this.pool.query(
                'SELECT * FROM users WHERE last_login > NOW() - INTERVAL \'30 days\' ORDER BY last_login DESC'
            );
            return result.rows;
        } catch (error) {
            console.error('Database error in getActiveUsers:', error);
            return [];
        }
    }

    async getSystemStats() {
        try {
            const [usersResult, collectionsResult, documentsResult] = await Promise.all([
                this.pool.query('SELECT COUNT(*) as total_users FROM users'),
                this.pool.query('SELECT COUNT(*) as total_collections FROM collections'),
                this.pool.query('SELECT COUNT(*) as total_documents FROM documents')
            ]);

            return {
                totalUsers: parseInt(usersResult.rows[0].total_users),
                totalCollections: parseInt(collectionsResult.rows[0].total_collections || 0),
                totalDocuments: parseInt(documentsResult.rows[0].total_documents || 0),
                systemHealth: { status: 'healthy' }
            };
        } catch (error) {
            console.error('Database error in getSystemStats:', error);
            return {
                totalUsers: 0,
                totalCollections: 0,
                totalDocuments: 0,
                systemHealth: { status: 'error' }
            };
        }
    }

    // Usage tracking
    async trackUsage(userId, resourceType, amount = 1, endpoint = null) {
        try {
            await this.pool.query(`
                INSERT INTO usage_tracking (user_id, resource_type, amount, endpoint)
                VALUES ($1, $2, $3, $4)
            `, [userId, resourceType, amount, endpoint]);
        } catch (error) {
            console.error('Error tracking usage:', error);
        }
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
            const result = await this.pool.query(
                'SELECT tier FROM users WHERE id = $1',
                [userId]
            );
            return result.rows[0]?.tier || 'free';
        } catch (error) {
            console.error('Error getting user tier:', error);
            return 'free'; // Default to 'free' on error
        }
    }

    async getUsersWithoutPasswordHash() {
        try {
            // First check if password_hash column exists
            const columnExists = await this.pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'password_hash'
                );
            `);
            
            if (!columnExists.rows[0].exists) {
                console.log('password_hash column does not exist, checking for password column...');
                
                // Check for 'password' column
                const passwordColumnExists = await this.pool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = 'users' 
                        AND column_name = 'password'
                    );
                `);
                
                if (passwordColumnExists.rows[0].exists) {
                    // Use password column instead
                    const result = await this.pool.query(
                        'SELECT * FROM users WHERE password IS NULL OR password = \'\''
                    );
                    return result.rows;
                } else {
                    console.log('Neither password_hash nor password column exists');
                    return [];
                }
            }
            
            const result = await this.pool.query(
                'SELECT * FROM users WHERE password_hash IS NULL OR password_hash = \'\''
            );
            return result.rows;
        } catch (error) {
            console.error('Database error in getUsersWithoutPasswordHash:', error);
            throw error;
        }
    }

    async fixUserPasswordHash(userId, newPasswordHash) {
        try {
            // Check which password column exists
            const passwordHashExists = await this.pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'password_hash'
                );
            `);
            
            const columnName = passwordHashExists.rows[0].exists ? 'password_hash' : 'password';
            
            const result = await this.pool.query(
                `UPDATE users SET ${columnName} = $1 WHERE id = $2 RETURNING *`,
                [newPasswordHash, userId]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Database error in fixUserPasswordHash:', error);
            throw error;
        }
    }
}

module.exports = { DatabaseService };
