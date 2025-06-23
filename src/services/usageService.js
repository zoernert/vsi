const { DatabaseService } = require('./databaseService');
const { TIER_LIMITS } = require('../config/tiers');

class UsageService {
    constructor() {
        this.db = new DatabaseService();
    }

    async getUserUsage(userId) {
        try {
            // Get current month usage
            const currentMonthQuery = `
                SELECT 
                    resource_type,
                    COALESCE(SUM(amount), 0) as total
                FROM usage_tracking 
                WHERE user_id = $1 
                AND created_at >= DATE_TRUNC('month', NOW())
                GROUP BY resource_type
            `;
            
            const currentMonthResult = await this.db.pool.query(currentMonthQuery, [userId]);
            const currentMonthUsage = {};
            currentMonthResult.rows.forEach(row => {
                currentMonthUsage[row.resource_type] = parseInt(row.total);
            });

            // Get total usage
            const totalQuery = `
                SELECT 
                    resource_type,
                    COALESCE(SUM(amount), 0) as total
                FROM usage_tracking 
                WHERE user_id = $1 
                GROUP BY resource_type
            `;
            
            const totalResult = await this.db.pool.query(totalQuery, [userId]);
            const totalUsage = {};
            totalResult.rows.forEach(row => {
                totalUsage[row.resource_type] = parseInt(row.total);
            });

            // Get user tier
            const userQuery = `SELECT tier FROM users WHERE id = $1`;
            const userResult = await this.db.pool.query(userQuery, [userId]);
            const userTier = userResult.rows[0]?.tier || 'free';

            // Get collection count for user
            const collectionsQuery = `
                SELECT COUNT(DISTINCT collection_name) as count
                FROM usage_tracking 
                WHERE user_id = $1 
                AND resource_type = 'collection_created'
            `;
            const collectionsResult = await this.db.pool.query(collectionsQuery, [userId]);
            const collectionCount = parseInt(collectionsResult.rows[0]?.count) || 0;

            return {
                tier: userTier,
                limits: TIER_LIMITS[userTier] || TIER_LIMITS.free,
                currentMonth: {
                    apiCalls: currentMonthUsage.api_calls || 0,
                    fileUploads: currentMonthUsage.file_uploads || 0,
                    storageBytes: currentMonthUsage.storage_bytes || 0
                },
                total: {
                    documents: totalUsage.documents || 0,
                    storageBytes: totalUsage.storage_bytes || 0,
                    collections: collectionCount
                }
            };

        } catch (error) {
            console.error('Error getting user usage:', error);
            return {
                tier: 'free',
                limits: TIER_LIMITS.free,
                currentMonth: { apiCalls: 0, fileUploads: 0, storageBytes: 0 },
                total: { documents: 0, storageBytes: 0, collections: 0 }
            };
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        if (bytes === Infinity) return '∞';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    calculateUsagePercentage(used, limit) {
        if (limit === Infinity) return 0;
        return Math.min((used / limit) * 100, 100);
    }
}

module.exports = { UsageService };
