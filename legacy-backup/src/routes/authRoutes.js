const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { authenticateAdmin, authenticateToken } = require('../middleware/auth');
const { UserService } = require('../services/userService');
const { DatabaseService } = require('../services/databaseService');
const { createUsageMiddleware } = require('../middleware/usageTracking');
const { TIER_LIMITS } = require('../config/tiers');
const router = express.Router();

const userService = new UserService();

// Register endpoint (now restricted)
router.post('/register', createUsageMiddleware('api_calls'), async (req, res) => {
    try {
        // Check if self-registration is allowed (existing logic)
        if (process.env.ALLOW_SELF_REGISTRATION !== 'true') {
            return res.status(403).json({ 
                error: 'Self-registration is disabled. Please contact an administrator.' 
            });
        }
        
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Check if user exists
        const existingUser = await userService.getUser(username);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create user with free tier
        await userService.createUser({
            username,
            password,
            email,
            tier: 'free'
        });
        
        console.log('User registered successfully:', username);
        res.json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin create user endpoint
router.post('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        console.log('Admin user creation attempt:', req.body);
        const { username, password, isAdmin = false, tier = 'free' } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Check if user exists
        const existingUser = await userService.getUser(username);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create user
        const newUser = await userService.createUser({
            username,
            password,
            isAdmin: Boolean(isAdmin),
            tier,
            createdBy: req.user.username
        });
        
        console.log('User created by admin:', username);
        
        res.json({ 
            message: 'User created successfully',
            user: {
                username: newUser.username,
                isAdmin: newUser.is_admin,
                tier: newUser.tier,
                createdAt: newUser.created_at
            }
        });
    } catch (error) {
        console.error('Admin user creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin list users endpoint
router.get('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await userService.db.getAllUsers();
        const userList = users.map(user => ({
            username: user.username,
            id: user.id,
            isAdmin: user.is_admin,
            tier: user.tier,
            createdAt: user.created_at,
            createdBy: user.created_by
        }));
        
        res.json({ users: userList });
    } catch (error) {
        console.error('Admin list users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin update user endpoint
router.put('/admin/users/:username', authenticateAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const { password, isAdmin, tier } = req.body;
        
        const user = await userService.getUser(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent removing admin status from the last admin
        if (user.is_admin && isAdmin === false) {
            const allUsers = await userService.db.getAllUsers();
            const adminCount = allUsers.filter(u => u.is_admin).length;
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove admin status from the last admin user' });
            }
        }
        
        const updates = {};
        if (password) updates.password = password;
        if (typeof isAdmin === 'boolean') updates.is_admin = isAdmin;
        if (tier) updates.tier = tier;
        
        const updatedUser = await userService.updateUser(username, updates);
        
        res.json({ 
            message: 'User updated successfully',
            user: {
                username: updatedUser.username,
                isAdmin: updatedUser.is_admin,
                tier: updatedUser.tier,
                updatedAt: updatedUser.updated_at
            }
        });
    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin delete user endpoint
router.delete('/admin/users/:username', authenticateAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const user = await userService.getUser(username);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent deleting the last admin
        if (user.is_admin) {
            const allUsers = await userService.db.getAllUsers();
            const adminCount = allUsers.filter(u => u.is_admin).length;
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin user' });
            }
        }
        
        // Prevent self-deletion
        if (username === req.user.username) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        await userService.deleteUser(username);
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
router.post('/login', createUsageMiddleware('api_calls'), async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = await userService.getUser(username);
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { 
                id: user.id, 
                username,
                isAdmin: user.is_admin || false,
                tier: user.tier || 'free'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ 
            token, 
            username,
            isAdmin: user.is_admin || false,
            tier: user.tier || 'free'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await userService.getUser(req.user.username);
        const usage = {
            documents: await userService.db.getCurrentUsage(req.user.id, 'documents'),
            storage_bytes: await userService.db.getCurrentUsage(req.user.id, 'storage_bytes'),
            api_calls: await userService.db.getCurrentUsage(req.user.id, 'api_calls'),
            collections: await userService.db.getCurrentUsage(req.user.id, 'collections')
        };
        
        res.json({
            username: user.username,
            email: user.email,
            isAdmin: user.is_admin || false,
            tier: user.tier || 'free',
            usage,
            limits: TIER_LIMITS[user.tier || 'free']
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get personal usage statistics
router.get('/usage/personal', authenticateToken, async (req, res) => {
    try {
        const user = await userService.getUser(req.user.username);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const db = new DatabaseService();
        
        // Get current usage
        const currentUsage = {
            documents: await db.getCurrentUsage(req.user.id, 'documents'),
            storage_bytes: await db.getCurrentUsage(req.user.id, 'storage_bytes'),
            api_calls: await db.getCurrentUsage(req.user.id, 'api_calls'),
            collections: await db.getCurrentUsage(req.user.id, 'collections')
        };

        // Get monthly API calls
        const monthlyApiCalls = await db.pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM usage_tracking 
            WHERE user_id = $1 
                AND resource_type = 'api_calls'
                AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        `, [req.user.id]);

        const limits = TIER_LIMITS[user.tier || 'free'];

        // Calculate usage percentages
        const usage = {
            documentsPercent: limits.documents === Infinity ? 0 : Math.min((currentUsage.documents / limits.documents) * 100, 100),
            storagePercent: limits.storage_bytes === Infinity ? 0 : Math.min((currentUsage.storage_bytes / limits.storage_bytes) * 100, 100),
            apiCallsPercent: limits.api_calls === Infinity ? 0 : Math.min((parseInt(monthlyApiCalls.rows[0].total) / limits.api_calls) * 100, 100),
            collectionsPercent: limits.collections === Infinity ? 0 : Math.min((currentUsage.collections / limits.collections) * 100, 100)
        };

        // Format storage sizes
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            if (bytes === Infinity) return '∞';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const formatted = {
            storageUsed: formatBytes(currentUsage.storage_bytes),
            storageLimit: limits.storage_bytes === Infinity ? '∞' : formatBytes(limits.storage_bytes),
            maxFileSize: limits.max_file_size === Infinity ? '∞' : formatBytes(limits.max_file_size)
        };

        res.json({
            tier: user.tier || 'free',
            current: {
                documents: currentUsage.documents,
                storage_bytes: currentUsage.storage_bytes,
                apiCallsThisMonth: parseInt(monthlyApiCalls.rows[0].total),
                collections: currentUsage.collections
            },
            limits: {
                documents: limits.documents,
                storage_bytes: limits.storage_bytes,
                apiCallsMonthly: limits.api_calls,
                collections: limits.collections,
                features: limits.features || ['Basic features']
            },
            usage,
            formatted
        });
    } catch (error) {
        console.error('Error loading personal usage:', error);
        res.status(500).json({ error: 'Failed to load usage statistics' });
    }
});

// Registration status endpoint
router.get('/registration-status', (req, res) => {
    res.json({
        selfRegistrationEnabled: process.env.ALLOW_SELF_REGISTRATION === 'true',
        rapidApiEnabled: process.env.ALLOW_RAPIDAPI_USERS === 'true'
    });
});

// Debug endpoint to list users (remove in production)
router.get('/debug/users', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const users = await userService.loadUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;