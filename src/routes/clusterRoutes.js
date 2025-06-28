const express = require('express');
const { ClusterController } = require('../controllers/clusterController');
const { auth } = require('../middleware');

const router = express.Router();
const clusterController = new ClusterController();

// Apply authentication to all routes
router.use(auth);

// Cluster management routes
router.get('/', clusterController.getUserClusters.bind(clusterController));
router.post('/', clusterController.createCluster.bind(clusterController));
router.get('/:id', clusterController.getCluster.bind(clusterController));
router.put('/:id', clusterController.updateCluster.bind(clusterController));
router.delete('/:id', clusterController.deleteCluster.bind(clusterController));

// Auto-generation routes (must come before :id routes)
router.post('/auto-generate/:collectionId', clusterController.autoGenerateClusterForCollection.bind(clusterController));
router.get('/for-collection/:collectionId', clusterController.getOrCreateCollectionCluster.bind(clusterController));
router.get('/content-analysis/:collectionId', clusterController.getContentBasedClusters.bind(clusterController));

// Cluster-collection association routes
router.post('/:id/collections/:collectionId', clusterController.addCollectionToCluster.bind(clusterController));
router.get('/:id/stats', clusterController.getClusterStats.bind(clusterController));

// Collection cluster management (remove from cluster)
router.delete('/collections/:id/cluster', clusterController.removeCollectionFromCluster.bind(clusterController));

module.exports = router;
