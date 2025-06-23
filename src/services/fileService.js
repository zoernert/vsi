const { DatabaseService } = require('./databaseService');

class FileService {
    constructor() {
        this.db = new DatabaseService();
    }

    async storeFile(fileUuid, originalName, mimeType, buffer, uploadedBy) {
        try {
            const query = `
                INSERT INTO files (uuid, original_name, mime_type, file_data, file_size, uploaded_by, uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id, uuid, original_name, mime_type, file_size, uploaded_at
            `;
            
            const result = await this.db.pool.query(query, [
                fileUuid,
                originalName,
                mimeType,
                buffer,
                buffer.length,
                uploadedBy
            ]);
            
            return result.rows[0];
        } catch (error) {
            console.error('Error storing file in database:', error);
            throw error;
        }
    }

    async getFile(fileUuid) {
        try {
            const query = `
                SELECT uuid, original_name, mime_type, file_data, file_size, uploaded_by, uploaded_at
                FROM files 
                WHERE uuid = $1
            `;
            
            const result = await this.db.pool.query(query, [fileUuid]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('Error retrieving file from database:', error);
            throw error;
        }
    }

    async getFileInfo(fileUuid) {
        try {
            const query = `
                SELECT uuid, original_name, mime_type, file_size, uploaded_by, uploaded_at
                FROM files 
                WHERE uuid = $1
            `;
            
            const result = await this.db.pool.query(query, [fileUuid]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('Error retrieving file info from database:', error);
            throw error;
        }
    }

    async deleteFile(fileUuid) {
        try {
            const query = `DELETE FROM files WHERE uuid = $1 RETURNING uuid`;
            const result = await this.db.pool.query(query, [fileUuid]);
            
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error deleting file from database:', error);
            throw error;
        }
    }

    async getUserFileStats(userId) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as file_count,
                    COALESCE(SUM(file_size), 0) as total_size
                FROM files 
                WHERE uploaded_by = (SELECT username FROM users WHERE id = $1)
            `;
            
            const result = await this.db.pool.query(query, [userId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error getting user file stats:', error);
            throw error;
        }
    }
}

module.exports = { FileService };
