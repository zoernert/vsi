const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { UserService } = require('../services/userService');
const { DatabaseService } = require('../services/databaseService');
const { TIER_LIMITS } = require('../config/tiers');
const analyticsRoutes = require('./analyticsRoutes');

const router = express.Router();
const userService = new UserService();
const db = new DatabaseService();

// Apply admin authentication to all routes
router.use(authenticateToken);
router.use(requireAdmin);

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
            success: true,
            data: {
                totalUsers,
                adminUsers,
                activeUsers: usageStats.rows.length > 0 ? Math.max(...usageStats.rows.map(s => parseInt(s.active_users))) : 0,
                totalCollections: parseInt(usageStats.rows.find(s => s.resource_type === 'collections')?.total_usage || 0),
                totalDocuments: parseInt(usageStats.rows.find(s => s.resource_type === 'documents')?.total_usage || 0),
                storageUsed: parseInt(usageStats.rows.find(s => s.resource_type === 'storage_bytes')?.total_usage || 0),
                usageStats: usageStats.rows,
                tierDistribution: tierDistribution.rows,
                recentActivity: recentActivity.rows
            }
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
        
        // Get basic user stats
        const userStats = await db.pool.query(`
            SELECT 
                COUNT(DISTINCT c.id) as collections,
                COUNT(DISTINCT d.id) as documents,
                COALESCE(SUM(CASE WHEN ut.resource_type = 'searches' THEN ut.amount ELSE 0 END), 0) as searches,
                MAX(ut.created_at) as last_activity
            FROM users u
            LEFT JOIN collections c ON u.id = c.user_id
            LEFT JOIN documents d ON c.id = d.collection_id
            LEFT JOIN usage_tracking ut ON u.id = ut.user_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [userId]);
        
        const stats = userStats.rows[0] || { collections: 0, documents: 0, searches: 0, last_activity: null };
        
        res.json({
            success: true,
            data: {
                user: user.rows[0],
                collections: parseInt(stats.collections),
                documents: parseInt(stats.documents),
                searches: parseInt(stats.searches),
                lastActivity: stats.last_activity,
                monthlyUsage: monthlyUsage.rows,
                dailyUsage: dailyUsage.rows,
                limits: TIER_LIMITS[user.rows[0].tier]
            }
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

        // Check Qdrant health
        let qdrantStatus = 'unknown';
        let qdrantLastCheck = null;
        try {
            const qdrant = require('../config/qdrant');
            // Test if we can list collections
            await qdrant.getCollections();
            qdrantStatus = 'healthy';
            qdrantLastCheck = new Date().toISOString();
        } catch (error) {
            console.warn('Qdrant health check failed:', error.message);
            qdrantStatus = 'error';
            qdrantLastCheck = new Date().toISOString();
        }

        // Check Embeddings service health
        let embeddingsStatus = 'unknown';
        let embeddingsLastCheck = null;
        try {
            const { EmbeddingService } = require('../services/embeddingService');
            const embeddingService = new EmbeddingService();
            // Test with a simple embedding
            await embeddingService.generateEmbedding('health check test');
            embeddingsStatus = 'healthy';
            embeddingsLastCheck = new Date().toISOString();
        } catch (error) {
            console.warn('Embeddings health check failed:', error.message);
            embeddingsStatus = 'error';
            embeddingsLastCheck = new Date().toISOString();
        }
        
        res.json({
            success: true,
            data: {
                database: {
                    status: 'healthy',
                    lastCheck: dbHealth.rows[0].now
                },
                qdrant: {
                    status: qdrantStatus,
                    lastCheck: qdrantLastCheck
                },
                embeddings: {
                    status: embeddingsStatus,
                    lastCheck: embeddingsLastCheck
                },
                usageTracking: {
                    events24h: parseInt(usageHealth.rows[0].events_24h)
                },
                storage: {
                    totalBytes: parseInt(storageUsage.rows[0].total_bytes || 0),
                    usersWithStorage: parseInt(storageUsage.rows[0].users_with_storage || 0)
                },
                uptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({ error: error.message });
    }
});

// User management endpoints

// Get all users
router.get('/users', async (req, res) => {
    try {
        const { search, tier, isAdmin, sortBy = 'created_at', sortOrder = 'desc', page = 1, limit = 50 } = req.query;
        
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 1;
        
        // Search filter
        if (search) {
            whereConditions.push(`(u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
            queryParams.push(`%${search}%`);
            paramCount++;
        }
        
        // Tier filter
        if (tier) {
            whereConditions.push(`u.tier = $${paramCount}`);
            queryParams.push(tier);
            paramCount++;
        }
        
        // Admin filter
        if (isAdmin !== undefined) {
            whereConditions.push(`u.is_admin = $${paramCount}`);
            queryParams.push(isAdmin === 'true');
            paramCount++;
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Validate sort column
        const validSortColumns = ['username', 'created_at', 'tier', 'is_admin'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        
        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        queryParams.push(parseInt(limit), offset);
        
        const usersQuery = `
            SELECT u.*, 
                   COUNT(*) OVER() as total_count
            FROM users u
            ${whereClause}
            ORDER BY u.${sortColumn} ${order}
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        
        const users = await db.pool.query(usersQuery, queryParams);
        
        const usersWithStats = await Promise.all(users.rows.map(async (user) => {
            // Get user statistics
            const stats = await db.pool.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as collections,
                    COUNT(DISTINCT d.id) as documents,
                    COALESCE(SUM(CASE WHEN ut.resource_type = 'searches' THEN ut.amount ELSE 0 END), 0) as searches,
                    MAX(ut.created_at) as last_activity
                FROM users u
                LEFT JOIN collections c ON u.id = c.user_id
                LEFT JOIN documents d ON c.id = d.collection_id
                LEFT JOIN usage_tracking ut ON u.id = ut.user_id
                WHERE u.id = $1
                GROUP BY u.id
            `, [user.id]);
            
            const { total_count, ...userWithoutCount } = user;
            return {
                ...userWithoutCount,
                stats: stats.rows[0] || { collections: 0, documents: 0, searches: 0, last_activity: null }
            };
        }));
        
        const totalCount = users.rows.length > 0 ? parseInt(users.rows[0].total_count) : 0;
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        
        res.json({
            success: true,
            data: usersWithStats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages,
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            },
            filters: {
                search,
                tier,
                isAdmin,
                sortBy: sortColumn,
                sortOrder: order.toLowerCase()
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch users', 
            error: error.message 
        });
    }
});

// Create new user
router.post('/users', validate(schemas.user.adminCreate), async (req, res) => {
    try {
        const { username, password, email, tier = 'free', isAdmin = false } = req.body;
        
        // Check if user already exists
        const existingUser = await db.findUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }
        
        // Create user with hashed password
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await db.pool.query(`
            INSERT INTO users (username, password_hash, email, tier, is_admin, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id, username, email, tier, is_admin, created_at
        `, [username, hashedPassword, email, tier, isAdmin]);
        
        const newUser = result.rows[0];
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create user', 
            error: error.message 
        });
    }
});

// Update user
router.put('/users/:username', validate(schemas.user.adminUpdate), async (req, res) => {
    try {
        const { username } = req.params;
        const { password, email, tier, isAdmin } = req.body;
        
        // Find user
        const user = await db.findUserByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        
        if (tier !== undefined) {
            updates.push(`tier = $${paramCount++}`);
            values.push(tier);
        }
        
        if (isAdmin !== undefined) {
            updates.push(`is_admin = $${paramCount++}`);
            values.push(isAdmin);
        }
        
        if (password !== undefined) {
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramCount++}`);
            values.push(hashedPassword);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }
        
        updates.push(`updated_at = NOW()`);
        values.push(user.id);
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, username, email, tier, is_admin, created_at, updated_at
        `;
        
        const result = await db.pool.query(query, values);
        
        res.json({
            success: true,
            message: 'User updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update user', 
            error: error.message 
        });
    }
});

// Delete user
router.delete('/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        // Find user
        const user = await db.findUserByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Prevent deleting the last admin
        if (user.is_admin) {
            const adminCount = await db.pool.query('SELECT COUNT(*) FROM users WHERE is_admin = true');
            if (parseInt(adminCount.rows[0].count) <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete the last admin user'
                });
            }
        }
        
        // Prevent self-deletion
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }
        
        // Delete user and cascade delete related data
        await db.pool.query('DELETE FROM users WHERE id = $1', [user.id]);
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete user', 
            error: error.message 
        });
    }
});

module.exports = router;
