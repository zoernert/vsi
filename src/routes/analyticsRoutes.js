const express = require('express');
const { AnalyticsService } = require('../services/analyticsService');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const analyticsService = new AnalyticsService();

// All analytics routes require admin access
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/admin/analytics/monthly
router.get('/monthly', async (req, res) => {
    try {
        const data = await analyticsService.getMonthlyTrends();
        res.json(data);
    } catch (error) {
        console.error('Error getting monthly analytics:', error);
        res.status(500).json({ error: 'Failed to get monthly analytics' });
    }
});

// GET /api/admin/analytics/top-users
router.get('/top-users', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const data = await analyticsService.getTopUsers(limit);
        res.json(data);
    } catch (error) {
        console.error('Error getting top users:', error);
        res.status(500).json({ error: 'Failed to get top users' });
    }
});

// GET /api/admin/analytics/collections
router.get('/collections', async (req, res) => {
    try {
        const data = await analyticsService.getCollectionStats();
        res.json(data);
    } catch (error) {
        console.error('Error getting collection stats:', error);
        res.status(500).json({ error: 'Failed to get collection stats' });
    }
});

// GET /api/admin/analytics/endpoints
router.get('/endpoints', async (req, res) => {
    try {
        const data = await analyticsService.getEndpointUsage();
        res.json(data);
    } catch (error) {
        console.error('Error getting endpoint usage:', error);
        res.status(500).json({ error: 'Failed to get endpoint usage' });
    }
});

// GET /api/admin/analytics/user-growth
router.get('/user-growth', async (req, res) => {
    try {
        const data = await analyticsService.getUserGrowth();
        res.json(data);
    } catch (error) {
        console.error('Error getting user growth:', error);
        res.status(500).json({ error: 'Failed to get user growth' });
    }
});

// GET /api/admin/analytics/storage
router.get('/storage', async (req, res) => {
    try {
        const data = await analyticsService.getStorageAnalytics();
        res.json(data);
    } catch (error) {
        console.error('Error getting storage analytics:', error);
        res.status(500).json({ error: 'Failed to get storage analytics' });
    }
});

module.exports = router;
