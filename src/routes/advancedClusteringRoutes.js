const express = require('express');
const router = express.Router();
const AdvancedClusteringController = require('../controllers/advancedClusteringController');
const { authenticateToken } = require('../middleware/auth');

// Initialize controller
const advancedClusteringController = new AdvancedClusteringController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// ==================== CLUSTER INTELLIGENCE ROUTES ====================

/**
 * @route GET /api/clusters/intelligence/suggestions/:collectionId
 * @desc Get intelligent cluster suggestions for a collection
 * @access Private
 */
router.get('/intelligence/suggestions/:collectionId', 
    advancedClusteringController.getClusterSuggestions.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/intelligence/suggestions/:suggestionId/accept
 * @desc Accept a cluster suggestion
 * @access Private
 */
router.post('/intelligence/suggestions/:suggestionId/accept', 
    advancedClusteringController.acceptSuggestion.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/intelligence/suggestions/:suggestionId/dismiss
 * @desc Dismiss a cluster suggestion
 * @access Private
 */
router.post('/intelligence/suggestions/:suggestionId/dismiss', 
    advancedClusteringController.dismissSuggestion.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/intelligence/related/:collectionId
 * @desc Find collections related to the given collection
 * @access Private
 */
router.get('/intelligence/related/:collectionId', 
    advancedClusteringController.getRelatedCollections.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/intelligence/analyze-fit
 * @desc Analyze how well a collection fits in its current cluster
 * @access Private
 */
router.post('/intelligence/analyze-fit', 
    advancedClusteringController.analyzeClusterFit.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/suggestions
 * @desc Get all pending suggestions for the user
 * @access Private
 */
router.get('/suggestions', 
    advancedClusteringController.getUserSuggestions.bind(advancedClusteringController)
);

// ==================== CROSS-CLUSTER ANALYTICS ROUTES ====================

/**
 * @route GET /api/clusters/analytics/overlaps
 * @desc Get cluster overlap analysis
 * @access Private
 */
router.get('/analytics/overlaps', 
    advancedClusteringController.getClusterOverlaps.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/analytics/bridges
 * @desc Find bridge documents across clusters
 * @access Private
 */
router.get('/analytics/bridges', 
    advancedClusteringController.getBridgeDocuments.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/analytics/collaborations
 * @desc Find collaboration opportunities between clusters
 * @access Private
 */
router.get('/analytics/collaborations', 
    advancedClusteringController.getCollaborationOpportunities.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/analytics/duplications
 * @desc Find cross-cluster content duplication
 * @access Private
 */
router.get('/analytics/duplications', 
    advancedClusteringController.getContentDuplications.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/analytics/trends
 * @desc Get cluster evolution trends
 * @access Private
 */
router.get('/analytics/trends', 
    advancedClusteringController.getClusterTrends.bind(advancedClusteringController)
);

// ==================== DYNAMIC CLUSTERING ROUTES ====================

/**
 * @route GET /api/clusters/health
 * @desc Get cluster health analysis
 * @access Private
 */
router.get('/health', 
    advancedClusteringController.getClusterHealth.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/:clusterId/split
 * @desc Split a cluster into smaller clusters
 * @access Private
 */
router.post('/:clusterId/split', 
    advancedClusteringController.splitCluster.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/merge
 * @desc Merge multiple clusters into one
 * @access Private
 */
router.post('/merge', 
    advancedClusteringController.mergeClusters.bind(advancedClusteringController)
);

/**
 * @route POST /api/clusters/rebalance
 * @desc Trigger cluster rebalancing
 * @access Private
 */
router.post('/rebalance', 
    advancedClusteringController.rebalanceClusters.bind(advancedClusteringController)
);

/**
 * @route GET /api/clusters/events
 * @desc Get cluster management events history
 * @access Private
 */
router.get('/events', 
    advancedClusteringController.getClusterEvents.bind(advancedClusteringController)
);

module.exports = router;
