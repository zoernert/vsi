const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');
const { UserService } = require('../services/userService');
const { DatabaseService } = require('../services/databaseService');
const { TIER_LIMITS } = require('../config/tiers');
const analyticsRoutes = require('./analyticsRoutes');

const router = express.Router();
const userService = new UserService();
const db = new DatabaseService();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Analytics routes
router.use('/analytics', analyticsRoutes);

// Dashboard overview endpoint
router.get('/dashboard', async (req, res) => {
    try {
        // Get total users
        const allUsers = await db.getAllUsers();
        const totalUsers = allUsers.length;
        const adminUsers = allUsers.filter(user => user.is_admin).length;
        
        // Get usage statistics for current month
        const usageStats = await db.pool.query(`
            SELECT 
                resource_type,
                SUM(amount) as total_usage,
                COUNT(DISTINCT user_id) as active_users
            FROM usage_tracking 
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY resource_type
        `);
        
        // Get tier distribution
        const tierDistribution = await db.pool.query(`
            SELECT tier, COUNT(*) as count
            FROM users
            GROUP BY tier
            ORDER BY count DESC
        `);
        
        // Get recent activity (last 7 days)
        const recentActivity = await db.pool.query(`
            SELECT 
                u.username,
                ut.resource_type,
                SUM(ut.amount) as total,
                DATE(ut.created_at) as activity_date
            FROM usage_tracking ut
            JOIN users u ON ut.user_id = u.id
            WHERE ut.created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY u.username, ut.resource_type, DATE(ut.created_at)
            ORDER BY activity_date DESC, total DESC
            LIMIT 50
        `);
        
        res.json({
            overview: {
                totalUsers,
                adminUsers,
                activeUsers: usageStats.rows.length > 0 ? Math.max(...usageStats.rows.map(s => s.active_users)) : 0
            },
            usageStats: usageStats.rows,
            tierDistribution: tierDistribution.rows,
            recentActivity: recentActivity.rows
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get detailed user analytics
router.get('/users/:userId/analytics', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get user info
        const user = await db.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get monthly usage for the last 6 months
        const monthlyUsage = await db.pool.query(`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                resource_type,
                SUM(amount) as total
            FROM usage_tracking 
            WHERE user_id = $1 
                AND created_at >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', created_at), resource_type
            ORDER BY month DESC
        `, [userId]);
        
        // Get daily usage for current month
        const dailyUsage = await db.pool.query(`
            SELECT 
                DATE(created_at) as date,
                resource_type,
                SUM(amount) as total
            FROM usage_tracking 
            WHERE user_id = $1 
                AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY DATE(created_at), resource_type
            ORDER BY date DESC
        `, [userId]);
        
        res.json({
            user: user.rows[0],
            monthlyUsage: monthlyUsage.rows,
            dailyUsage: dailyUsage.rows,
            limits: TIER_LIMITS[user.rows[0].tier]
        });
    } catch (error) {
        console.error('User analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// System health endpoint
router.get('/system/health', async (req, res) => {
    try {
        // Database health
        const dbHealth = await db.pool.query('SELECT NOW()');
        
        // Usage tracking health (last 24 hours)
        const usageHealth = await db.pool.query(`
            SELECT COUNT(*) as events_24h
            FROM usage_tracking 
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);
        
        // Storage usage
        const storageUsage = await db.pool.query(`
            SELECT 
                SUM(amount) as total_bytes,
                COUNT(DISTINCT user_id) as users_with_storage
            FROM usage_tracking 
            WHERE resource_type = 'storage_bytes'
        `);
        
        res.json({
            database: {
                status: 'healthy',
                lastCheck: dbHealth.rows[0].now
            },
            usageTracking: {
                events24h: parseInt(usageHealth.rows[0].events_24h)
            },
            storage: {
                totalBytes: parseInt(storageUsage.rows[0].total_bytes || 0),
                usersWithStorage: parseInt(storageUsage.rows[0].users_with_storage || 0)
            }
        });
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
