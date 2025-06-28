const { ClusterService } = require('../services/clusterService');

class ClusterController {
    constructor() {
        this.clusterService = new ClusterService();
    }

    // GET /api/clusters
    async getUserClusters(req, res) {
        try {
            const userId = req.user.id;
            const options = {
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const clusters = await this.clusterService.getUserClusters(userId, options);
            
            res.json({
                success: true,
                data: clusters
            });
        } catch (error) {
            console.error('Get clusters error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /api/clusters
    async createCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterData = req.body;

            const cluster = await this.clusterService.createCluster(userId, clusterData);
            
            res.status(201).json({
                success: true,
                data: cluster,
                message: 'Cluster created successfully'
            });
        } catch (error) {
            console.error('Create cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/:id
    async getCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const cluster = await this.clusterService.getCluster(clusterId, userId);
            
            res.json({
                success: true,
                data: cluster
            });
        } catch (error) {
            console.error('Get cluster error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    // PUT /api/clusters/:id
    async updateCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);
            const updates = req.body;

            const cluster = await this.clusterService.updateCluster(clusterId, userId, updates);
            
            res.json({
                success: true,
                data: cluster,
                message: 'Cluster updated successfully'
            });
        } catch (error) {
            console.error('Update cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // DELETE /api/clusters/:id
    async deleteCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const result = await this.clusterService.deleteCluster(clusterId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Delete cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /api/clusters/:id/collections/:collectionId
    async addCollectionToCluster(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);
            const collectionId = parseInt(req.params.collectionId);

            const result = await this.clusterService.addCollectionToCluster(clusterId, collectionId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Add collection to cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // DELETE /api/collections/:id/cluster
    async removeCollectionFromCluster(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.id);

            const result = await this.clusterService.removeCollectionFromCluster(collectionId, userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Remove collection from cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/:id/stats
    async getClusterStats(req, res) {
        try {
            const userId = req.user.id;
            const clusterId = parseInt(req.params.id);

            const stats = await this.clusterService.getClusterStats(clusterId, userId);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get cluster stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /api/clusters/auto-generate/:collectionId
    async autoGenerateClusterForCollection(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.collectionId);

            const cluster = await this.clusterService.autoGenerateClusterForCollection(collectionId, userId);
            
            res.json({
                success: true,
                data: cluster,
                message: 'Auto-generated cluster created successfully'
            });
        } catch (error) {
            console.error('Auto-generate cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/for-collection/:collectionId
    async getOrCreateCollectionCluster(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.collectionId);

            const cluster = await this.clusterService.getOrCreateCollectionCluster(collectionId, userId);
            
            res.json({
                success: true,
                data: cluster
            });
        } catch (error) {
            console.error('Get or create collection cluster error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/clusters/content-analysis/:collectionId
    async getContentBasedClusters(req, res) {
        try {
            const userId = req.user.id;
            const collectionId = parseInt(req.params.collectionId);
            const options = {
                maxClusters: parseInt(req.query.maxClusters) || 5,
                minClusterSize: parseInt(req.query.minClusterSize) || 3,
                similarityThreshold: parseFloat(req.query.similarityThreshold) || 0.75
            };

            const contentAnalysis = await this.clusterService.getContentBasedClusters(collectionId, userId);
            
            res.json({
                success: true,
                data: contentAnalysis
            });
        } catch (error) {
            console.error('Content-based clustering error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = { ClusterController };
