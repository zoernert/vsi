const express = require('express');
const { UsageService } = require('../services/usageService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const usageService = new UsageService();

// GET /api/usage/personal - Get personal usage statistics
router.get('/personal', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const usage = await usageService.getUserUsage(userId);
        
        // Format the response with percentage calculations
        const response = {
            tier: usage.tier,
            limits: {
                documents: usage.limits.documents,
                storageBytes: usage.limits.storage_bytes,
                apiCallsMonthly: usage.limits.api_calls_monthly,
                collections: usage.limits.collections,
                maxFileSize: usage.limits.max_file_size,
                features: usage.limits.features
            },
            current: {
                documents: usage.total.documents,
                storageBytes: usage.total.storageBytes,
                apiCallsThisMonth: usage.currentMonth.apiCalls,
                collections: usage.total.collections
            },
            usage: {
                documentsPercent: usageService.calculateUsagePercentage(usage.total.documents, usage.limits.documents),
                storagePercent: usageService.calculateUsagePercentage(usage.total.storageBytes, usage.limits.storage_bytes),
                apiCallsPercent: usageService.calculateUsagePercentage(usage.currentMonth.apiCalls, usage.limits.api_calls_monthly),
                collectionsPercent: usageService.calculateUsagePercentage(usage.total.collections, usage.limits.collections)
            },
            formatted: {
                storageUsed: usageService.formatBytes(usage.total.storageBytes),
                storageLimit: usageService.formatBytes(usage.limits.storage_bytes),
                maxFileSize: usageService.formatBytes(usage.limits.max_file_size)
            }
        };
        
        res.json(response);
    } catch (error) {
        console.error('Error getting personal usage:', error);
        res.status(500).json({ error: 'Failed to get usage statistics' });
    }
});

module.exports = router;
