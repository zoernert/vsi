const { DatabaseService } = require('../services/databaseService');
const { TIER_LIMITS } = require('../config/tiers');

class UsageTracker {
    constructor() {
        this.db = new DatabaseService();
    }

    // Non-blocking usage tracking
    trackUsage(userId, resourceType, amount = 1, endpoint = null) {
        // Fire and forget - don't block requests
        setImmediate(async () => {
            try {
                await this.db.trackUsage(userId, resourceType, amount, endpoint);
            } catch (error) {
                console.error('Usage tracking error (non-blocking):', error);
            }
        });
    }

    async checkLimits(userId, resourceType, amount = 1) {
        try {
            const userTier = await this.db.getUserTier(userId);
            
            // Unlimited tier bypasses all checks
            if (userTier === 'unlimited') {
                return true;
            }

            const limits = TIER_LIMITS[userTier];
            if (!limits) {
                console.warn(`Unknown tier: ${userTier}, defaulting to free`);
                limits = TIER_LIMITS.free;
            }

            const currentUsage = await this.db.getCurrentUsage(userId, resourceType);
            const newUsage = currentUsage + amount;

            return newUsage <= limits[resourceType];
        } catch (error) {
            console.error('Limit check error (allowing request):', error);
            return true; // Fail open - don't block on errors
        }
    }
}

const usageTracker = new UsageTracker();

// Middleware factory
const createUsageMiddleware = (resourceType, amount = 1) => {
    return (req, res, next) => {
        // Always track usage (non-blocking)
        if (req.user && req.user.id) {
            usageTracker.trackUsage(req.user.id, resourceType, amount, req.route?.path);
        }
        next();
    };
};

// Middleware that checks limits before proceeding
const createLimitMiddleware = (resourceType, amount = 1) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.id) {
            return next();
        }

        try {
            const withinLimits = await usageTracker.checkLimits(req.user.id, resourceType, amount);
            
            if (!withinLimits) {
                return res.status(429).json({
                    error: 'Usage limit exceeded',
                    message: `You have exceeded your ${resourceType.replace('_', ' ')} limit for the current billing period`,
                    upgradeUrl: '/pricing',
                    currentTier: await usageTracker.db.getUserTier(req.user.id)
                });
            }
        } catch (error) {
            console.error('Limit check failed (allowing request):', error);
        }

        next();
    };
};

module.exports = {
    createUsageMiddleware,
    createLimitMiddleware,
    usageTracker
};
