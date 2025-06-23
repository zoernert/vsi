const fs = require('fs');
const path = require('path');
const { DatabaseService } = require('./databaseService');

class MigrationService {
    constructor() {
        this.db = new DatabaseService();
    }

    async createUsersTable() {
        try {
            console.log('Creating users table...');
            
            const createUsersTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    is_admin BOOLEAN DEFAULT FALSE,
                    tier VARCHAR(50) DEFAULT 'free',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(255)
                );
            `;
            
            await this.db.pool.query(createUsersTable);
            
            // Create indexes
            const createIndexes = `
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
                CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
            `;
            
            await this.db.pool.query(createIndexes);
            
            console.log('✅ Users table created successfully');
        } catch (error) {
            console.error('❌ Error creating users table:', error);
            throw error;
        }
    }

    async createUsageTrackingTable() {
        try {
            console.log('Creating usage_tracking table...');
            
            const createUsageTable = `
                CREATE TABLE IF NOT EXISTS usage_tracking (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    resource_type VARCHAR(50) NOT NULL,
                    amount INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            await this.db.pool.query(createUsageTable);
            
            // Create indexes
            const createIndexes = `
                CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_tracking(user_id);
                CREATE INDEX IF NOT EXISTS idx_usage_resource_type ON usage_tracking(resource_type);
                CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_tracking(created_at);
            `;
            
            await this.db.pool.query(createIndexes);
            
            console.log('✅ Usage tracking table created successfully');
        } catch (error) {
            console.error('❌ Error creating usage tracking table:', error);
            throw error;
        }
    }

    async createFilesTable() {
        try {
            console.log('Creating files table...');
            
            const createFilesTable = `
                CREATE TABLE IF NOT EXISTS files (
                    id SERIAL PRIMARY KEY,
                    uuid VARCHAR(255) UNIQUE NOT NULL,
                    original_name VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(100) NOT NULL,
                    file_data BYTEA NOT NULL,
                    file_size BIGINT NOT NULL,
                    uploaded_by VARCHAR(255) NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            await this.db.pool.query(createFilesTable);
            
            // Create indexes
            const createIndexes = `
                CREATE INDEX IF NOT EXISTS idx_files_uuid ON files(uuid);
                CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
                CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at);
            `;
            
            await this.db.pool.query(createIndexes);
            
            console.log('✅ Files table created successfully');
        } catch (error) {
            console.error('❌ Error creating files table:', error);
            throw error;
        }
    }

    async migrateUsersFromJson() {
        try {
            const usersFilePath = path.join(__dirname, '..', '..', 'data', 'users.json');
            
            if (!fs.existsSync(usersFilePath)) {
                console.log('No users.json file found, skipping migration');
                return;
            }

            console.log('Migrating users from JSON...');
            const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            
            for (const [username, userData] of Object.entries(usersData)) {
                await this.db.pool.query(`
                    INSERT INTO users (username, password, is_admin, created_at, created_by, tier)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (username) DO NOTHING
                `, [
                    username,
                    userData.password,
                    userData.isAdmin || false,
                    userData.createdAt || new Date().toISOString(),
                    userData.createdBy || 'migration',
                    'unlimited' // Existing users get unlimited access
                ]);
            }

            console.log('✅ User migration completed successfully');
            
            // Backup original file
            fs.renameSync(usersFilePath, `${usersFilePath}.backup`);
            
        } catch (error) {
            console.error('❌ User migration failed:', error);
            throw error;
        }
    }

    async ensureAdminUser() {
        try {
            console.log('Ensuring admin user exists...');
            
            const adminUsername = process.env.ADMIN_USERNAME || 'admin';
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

            await this.db.pool.query(`
                INSERT INTO users (username, password, is_admin, created_by, tier)
                VALUES ($1, $2, true, 'system', 'unlimited')
                ON CONFLICT (username) DO UPDATE SET
                    is_admin = true,
                    tier = 'unlimited'
            `, [adminUsername, adminPassword]);

            console.log('✅ Admin user ensured');
        } catch (error) {
            console.error('❌ Error ensuring admin user:', error);
            throw error;
        }
    }

    async migrateFilesFromFilesystem() {
        try {
            const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
            
            if (!fs.existsSync(uploadsDir)) {
                console.log('No uploads directory found, skipping file migration');
                return;
            }
            
            console.log('Migrating files from filesystem to database...');
            
            // Import FileService here to avoid circular dependency
            const { FileService } = require('./fileService');
            const fileService = new FileService();
            
            const files = fs.readdirSync(uploadsDir);
            let migratedCount = 0;
            
            for (const filename of files) {
                try {
                    const filePath = path.join(uploadsDir, filename);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isFile()) {
                        const fileUuid = path.parse(filename).name;
                        const ext = path.extname(filename);
                        
                        // Check if file already exists in database
                        const existingFile = await fileService.getFileInfo(fileUuid);
                        if (existingFile) {
                            console.log(`File ${filename} already migrated, skipping`);
                            continue;
                        }
                        
                        // Read file data
                        const fileBuffer = fs.readFileSync(filePath);
                        
                        // Determine mime type based on extension
                        const mimeTypes = {
                            '.pdf': 'application/pdf',
                            '.txt': 'text/plain',
                            '.md': 'text/markdown',
                            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            '.doc': 'application/msword',
                            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            '.xls': 'application/vnd.ms-excel',
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.png': 'image/png',
                            '.gif': 'image/gif',
                            '.bmp': 'image/bmp',
                            '.webp': 'image/webp'
                        };
                        
                        const mimeType = mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
                        
                        // Store in database (use 'system' as uploaded_by for migrated files)
                        await fileService.storeFile(fileUuid, filename, mimeType, fileBuffer, 'system');
                        
                        migratedCount++;
                        console.log(`✅ Migrated ${filename} to database`);
                    }
                } catch (error) {
                    console.error(`❌ Error migrating file ${filename}:`, error);
                }
            }
            
            console.log(`✅ File migration completed. Migrated ${migratedCount} files`);
            
        } catch (error) {
            console.error('❌ Error during file migration:', error);
            throw error;
        }
    }

    async runMigrations() {
        console.log('🔄 Running database migrations...');
        
        // Create tables in order (users first, then dependent tables)
        await this.createUsersTable();
        await this.createUsageTrackingTable();
        await this.createFilesTable();
        
        // Migrate data
        await this.migrateUsersFromJson();
        await this.ensureAdminUser();
        await this.migrateFilesFromFilesystem();
        
        console.log('✅ All migrations completed successfully');
    }
}

module.exports = { MigrationService };
