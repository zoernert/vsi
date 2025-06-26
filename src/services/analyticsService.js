const { DatabaseService } = require('./databaseService');

class AnalyticsService {
    constructor() {
        this.db = new DatabaseService();
    }

    async getMonthlyTrends() {
        try {
            const query = `
                SELECT 
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(CASE WHEN resource_type = 'api_calls' THEN 1 END) as api_calls,
                    COUNT(CASE WHEN resource_type = 'file_uploads' THEN 1 END) as file_uploads,
                    COUNT(DISTINCT user_id) as active_users
                FROM usage_tracking 
                WHERE created_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month DESC
                LIMIT 12
            `;
            
            const result = await this.db.pool.query(query);
            
            // Also get new users per month
            const usersQuery = `
                SELECT 
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as new_users
                FROM users 
                WHERE created_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month DESC
            `;
            
            const usersResult = await this.db.pool.query(usersQuery);
            const usersMap = new Map(usersResult.rows.map(row => [row.month.toISOString(), row.new_users]));
            
            return result.rows.map(row => ({
                month: row.month.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
                apiCalls: parseInt(row.api_calls) || 0,
                fileUploads: parseInt(row.file_uploads) || 0,
                newUsers: parseInt(usersMap.get(row.month.toISOString())) || 0
            })).reverse();
            
        } catch (error) {
            console.error('Error getting monthly trends:', error);
            return [];
        }
    }

    async getTopUsers(limit = 10) {
        try {
            const query = `
                SELECT 
                    u.username,
                    u.tier,
                    COUNT(ut.id) as total_usage,
                    MAX(ut.created_at) as last_activity
                FROM users u
                LEFT JOIN usage_tracking ut ON u.id = ut.user_id
                WHERE ut.created_at >= NOW() - INTERVAL '30 days'
                GROUP BY u.id, u.username, u.tier
                ORDER BY total_usage DESC
                LIMIT $1
            `;
            
            const result = await this.db.pool.query(query, [limit]);
            
            return result.rows.map(row => ({
                username: row.username,
                tier: row.tier || 'free',
                totalUsage: parseInt(row.total_usage) || 0,
                lastActivity: row.last_activity
            }));
            
        } catch (error) {
            console.error('Error getting top users:', error);
            return [];
        }
    }

    async getCollectionStats() {
        try {
            // Get actual collection stats from database
            const query = `
                SELECT 
                    c.name,
                    COUNT(d.id) as document_count
                FROM collections c
                LEFT JOIN documents d ON c.id = d.collection_id
                GROUP BY c.id, c.name
                ORDER BY document_count DESC
                LIMIT 10
            `;
            
            const result = await this.db.pool.query(query);
            
            return result.rows.map(row => ({
                name: row.name,
                documentCount: parseInt(row.document_count) || 0
            }));
            
        } catch (error) {
            console.error('Error getting collection stats:', error);
            return [];
        }
    }

    async getEndpointUsage() {
        try {
            const query = `
                SELECT 
                    resource_type as endpoint,
                    COUNT(*) as count
                FROM usage_tracking 
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY resource_type
                ORDER BY count DESC
                LIMIT 6
            `;
            
            const result = await this.db.pool.query(query);
            
            return result.rows.map(row => ({
                endpoint: row.endpoint.replace('_', ' '),
                count: parseInt(row.count)
            }));
            
        } catch (error) {
            console.error('Error getting endpoint usage:', error);
            return [];
        }
    }

    async getUserGrowth() {
        try {
            const query = `
                SELECT 
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) OVER (ORDER BY DATE_TRUNC('month', created_at)) as total_users
                FROM (
                    SELECT DISTINCT DATE_TRUNC('month', created_at) as created_at
                    FROM users 
                    WHERE created_at >= NOW() - INTERVAL '12 months'
                ) months
                ORDER BY month
            `;
            
            const result = await this.db.pool.query(query);
            
            // Get cumulative user count for each month
            const cumulativeQuery = `
                WITH monthly_counts AS (
                    SELECT 
                        DATE_TRUNC('month', created_at) as month,
                        COUNT(*) as new_users
                    FROM users 
                    WHERE created_at >= NOW() - INTERVAL '12 months'
                    GROUP BY DATE_TRUNC('month', created_at)
                    ORDER BY month
                )
                SELECT 
                    month,
                    SUM(new_users) OVER (ORDER BY month) as total_users
                FROM monthly_counts
            `;
            
            const cumulativeResult = await this.db.pool.query(cumulativeQuery);
            
            return cumulativeResult.rows.map(row => ({
                month: row.month.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
                totalUsers: parseInt(row.total_users)
            }));
            
        } catch (error) {
            console.error('Error getting user growth:', error);
            return [];
        }
    }

    async getStorageAnalytics() {
        try {
            // First check if uploaded_files table exists
            const tableExistsQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'uploaded_files'
                );
            `;
            
            const tableExists = await this.db.pool.query(tableExistsQuery);
            
            if (!tableExists.rows[0].exists) {
                // If table doesn't exist, try to get file storage info from usage_tracking
                const storageQuery = `
                    SELECT 
                        COUNT(CASE WHEN resource_type = 'file_uploads' THEN 1 END) as total_files,
                        AVG(CASE WHEN resource_type = 'storage_bytes' THEN amount END) as avg_file_size,
                        SUM(CASE WHEN resource_type = 'storage_bytes' THEN amount END) as total_storage,
                        COUNT(DISTINCT CASE WHEN resource_type = 'file_uploads' THEN user_id END) as users_with_storage
                    FROM usage_tracking
                `;
                
                const result = await this.db.pool.query(storageQuery);
                const stats = result.rows[0];
                
                return {
                    totalFiles: parseInt(stats.total_files) || 0,
                    avgFileSize: parseInt(stats.avg_file_size) || 0,
                    totalStorage: parseInt(stats.total_storage) || 0,
                    usersWithStorage: parseInt(stats.users_with_storage) || 0,
                    topFileTypes: [
                        { type: 'unknown', count: parseInt(stats.total_files) || 0 }
                    ]
                };
            }
            
            // Original query if table exists
            const query = `
                SELECT 
                    COUNT(*) as total_files,
                    AVG(file_size) as avg_file_size,
                    SUM(file_size) as total_storage,
                    COUNT(DISTINCT user_id) as users_with_storage
                FROM uploaded_files
            `;
            
            const result = await this.db.pool.query(query);
            const stats = result.rows[0];
            
            // Get top file types
            const typesQuery = `
                SELECT 
                    file_type as type,
                    COUNT(*) as count
                FROM uploaded_files
                GROUP BY file_type
                ORDER BY count DESC
                LIMIT 5
            `;
            
            const typesResult = await this.db.pool.query(typesQuery);
            
            return {
                totalFiles: parseInt(stats.total_files) || 0,
                avgFileSize: parseInt(stats.avg_file_size) || 0,
                totalStorage: parseInt(stats.total_storage) || 0,
                usersWithStorage: parseInt(stats.users_with_storage) || 0,
                topFileTypes: typesResult.rows
            };
            
        } catch (error) {
            console.error('Error getting storage analytics:', error);
            return {
                totalFiles: 0,
                avgFileSize: 0,
                totalStorage: 0,
                usersWithStorage: 0,
                topFileTypes: []
            };
        }
    }
}

module.exports = { AnalyticsService };
