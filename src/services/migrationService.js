const fs = require('fs');
const path = require('path');
const { DatabaseService } = require('./databaseService');

class MigrationService {
    constructor() {
        this.db = new DatabaseService();
    }

    async runMigrations() {
        console.log('🔄 Running database migrations...');
        
        try {
            const migrations = [
                '001_initial_schema.sql',
                '002_add_usage_tracking.sql', 
                '003_add_user_tiers.sql',
                '004_make_qdrant_collection_name_nullable.sql' // Add the new migration
            ];

            for (const migration of migrations) {
                await this.runMigration(migration);
            }

            console.log('✅ All migrations completed successfully');
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    async runMigration(filename) {
        const migrationPath = path.join(__dirname, '../migrations', filename);
        
        if (!fs.existsSync(migrationPath)) {
            console.warn(`⚠️ Migration file not found: ${filename}`);
            return;
        }

        try {
            console.log(`📄 Running migration: ${filename}`);
            const sql = fs.readFileSync(migrationPath, 'utf8');
            
            // Split on semicolons to handle multiple statements
            const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
            
            for (const statement of statements) {
                if (statement.trim()) {
                    await this.db.query(statement.trim());
                }
            }
            
            console.log(`✅ Migration completed: ${filename}`);
        } catch (error) {
            console.error(`❌ Migration failed: ${filename}`, error);
            throw error;
        }
    }

    async createUsersTable() {
        const migrationName = 'create_users_table';
        
        try {
            // First, check if the users table exists at all
            const tableExists = await this.db.pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'users'
                );
            `);
            
            if (!tableExists.rows[0].exists) {
                console.log('Users table does not exist, creating it...');
                
                // Create users table with proper structure for PostgreSQL
                await this.db.pool.query(`
                    CREATE TABLE users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        email VARCHAR(255),
                        is_admin BOOLEAN DEFAULT FALSE,
                        tier VARCHAR(50) DEFAULT 'free',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP
                    );
                    
                    -- Create indices for better performance
                    CREATE INDEX idx_users_username ON users(username);
                    CREATE INDEX idx_users_email ON users(email);
                    CREATE INDEX idx_users_tier ON users(tier);
                `);
                
                console.log('✅ Users table created successfully with indices');
            } else {
                console.log('Users table exists, checking structure...');
                
                // Check if password_hash column exists
                const columnExists = await this.db.pool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = 'users' 
                        AND column_name = 'password_hash'
                    );
                `);
                
                if (!columnExists.rows[0].exists) {
                    console.log('password_hash column missing, adding it...');
                    
                    // Check if there's a 'password' column instead
                    const passwordColumnExists = await this.db.pool.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns 
                            WHERE table_name = 'users' 
                            AND column_name = 'password'
                        );
                    `);
                    
                    if (passwordColumnExists.rows[0].exists) {
                        // Rename password column to password_hash
                        await this.db.pool.query('ALTER TABLE users RENAME COLUMN password TO password_hash');
                        console.log('✅ Renamed password column to password_hash');
                    } else {
                        // Add password_hash column
                        await this.db.pool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
                        console.log('✅ Added password_hash column');
                    }
                }

                // Ensure last_login column exists
                const lastLoginColumn = await this.db.pool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = 'users' 
                        AND column_name = 'last_login'
                    );
                `);
                if (!lastLoginColumn.rows[0].exists) {
                    await this.db.pool.query('ALTER TABLE users ADD COLUMN last_login TIMESTAMP');
                    console.log('✅ Added last_login column to users table');
                }
            }
            
            // Check if migration already ran
            const existingMigration = await this.db.pool.query(
                'SELECT * FROM migrations WHERE name = $1',
                [migrationName]
            );

            if (existingMigration.rows.length === 0) {
                // Record migration
                await this.db.pool.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [migrationName]
                );
                console.log(`✅ Migration ${migrationName} recorded`);
            }
            
            // Verify final table structure
            const finalStructure = await this.db.pool.query(`
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'users'
                ORDER BY ordinal_position
            `);
            
            console.log('Final users table structure:', finalStructure.rows.map(row => `${row.column_name}: ${row.data_type}`));
            
        } catch (error) {
            console.error(`Failed to execute migration ${migrationName}:`, error);
            throw error;
        }
    }

    async createCollectionsTable() {
        const migrationName = 'create_collections_table';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            // Still check if we need to add the documents table
            await this.createDocumentsTable();
            return;
        }

        // Create collections table
        await this.db.pool.query(`
            CREATE TABLE IF NOT EXISTS collections (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                qdrant_collection_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, name)
            )
        `);

        // Create documents table
        await this.createDocumentsTable();

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
    }

    async createDocumentsTable() {
        const migrationName = 'create_documents_table';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            return;
        }

        // Create documents table WITHOUT vector embeddings (those go to Qdrant)
        console.log('Creating documents table with metadata only (vectors stored in Qdrant)...');
        await this.db.pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                content TEXT,
                content_preview TEXT,
                file_type VARCHAR(100),
                collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
                qdrant_point_id VARCHAR(255), -- Reference to Qdrant point ID
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(qdrant_point_id)
            )
        `);

        // Create index on qdrant_point_id for fast lookups
        await this.db.pool.query(`
            CREATE INDEX IF NOT EXISTS documents_qdrant_point_id_idx 
            ON documents (qdrant_point_id)
        `);

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
        console.log('Note: Vector embeddings are stored in Qdrant, not PostgreSQL');
    }

    async createUsageTrackingTable() {
        const migrationName = 'create_usage_tracking_table';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            return;
        }

        // Create usage tracking table
        await this.db.pool.query(`
            CREATE TABLE IF NOT EXISTS usage_tracking (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                resource_type VARCHAR(50) NOT NULL,
                amount INTEGER DEFAULT 1,
                endpoint VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indices for performance
        await this.db.pool.query(`
            CREATE INDEX IF NOT EXISTS usage_tracking_user_resource_date_idx 
            ON usage_tracking (user_id, resource_type, created_at)
        `);

        await this.db.pool.query(`
            CREATE INDEX IF NOT EXISTS usage_tracking_user_date_idx 
            ON usage_tracking (user_id, created_at)
        `);

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
    }

    async createFilesTable() {
        const migrationName = 'create_files_table';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            return;
        }

        // Create files table for file storage
        await this.db.pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id SERIAL PRIMARY KEY,
                uuid VARCHAR(255) NOT NULL UNIQUE,
                original_name VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100),
                file_data BYTEA,
                file_size INTEGER,
                uploaded_by VARCHAR(255),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create index on UUID for fast lookups
        await this.db.pool.query(`
            CREATE INDEX IF NOT EXISTS files_uuid_idx ON files (uuid)
        `);

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
    }

    async checkVectorTypeExists() {
        // No longer needed since we're not storing vectors in PostgreSQL
        return false;
    }

    /**
     * Add UUID column to collections table
     */
    async addCollectionUuids() {
        const migrationName = 'add_collection_uuids';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            return;
        }

        console.log('Adding UUID column to collections table...');
        
        // Add UUID column with default generation
        await this.db.pool.query(`
            ALTER TABLE collections ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()
        `);

        // Create unique index on UUID for fast lookups
        await this.db.pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_uuid ON collections(uuid)
        `);

        // Ensure all existing collections have UUIDs
        await this.db.pool.query(`
            UPDATE collections SET uuid = gen_random_uuid() WHERE uuid IS NULL
        `);

        // Make UUID column NOT NULL
        await this.db.pool.query(`
            ALTER TABLE collections ALTER COLUMN uuid SET NOT NULL
        `);

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
    }

    /**
     * Add collection_uuid column to documents table
     */
    async addDocumentCollectionUuids() {
        const migrationName = 'add_document_collection_uuids';
        
        // Check if migration already ran
        const existingMigration = await this.db.pool.query(
            'SELECT * FROM migrations WHERE name = $1',
            [migrationName]
        );

        if (existingMigration.rows.length > 0) {
            console.log(`Migration ${migrationName} already executed`);
            return;
        }

        console.log('Adding collection_uuid to documents table...');
        
        // Add collection_uuid column
        await this.db.pool.query(`
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS collection_uuid UUID
        `);

        // Populate collection_uuid from existing collection_id relationships
        await this.db.pool.query(`
            UPDATE documents SET collection_uuid = (
                SELECT c.uuid 
                FROM collections c 
                WHERE c.id = documents.collection_id
            ) WHERE collection_uuid IS NULL
        `);

        // Create index on collection_uuid for performance
        await this.db.pool.query(`
            CREATE INDEX IF NOT EXISTS idx_documents_collection_uuid ON documents(collection_uuid)
        `);

        // Add foreign key constraint to maintain referential integrity
        await this.db.pool.query(`
            ALTER TABLE documents ADD CONSTRAINT IF NOT EXISTS fk_documents_collection_uuid 
                FOREIGN KEY (collection_uuid) REFERENCES collections(uuid) ON DELETE CASCADE
        `);

        // Record migration
        await this.db.pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migrationName]
        );

        console.log(`✅ Migration ${migrationName} completed`);
    }

    /**
     * Run all UUID-related migrations
     */
    async runUuidMigrations() {
        console.log('🔄 Starting UUID migration process...');
        
        try {
            await this.addCollectionUuids();
            await this.addDocumentCollectionUuids();
            
            console.log('✅ All UUID migrations completed successfully');
        } catch (error) {
            console.error('❌ UUID migration failed:', error);
            throw error;
        }
    }
}

module.exports = { MigrationService };