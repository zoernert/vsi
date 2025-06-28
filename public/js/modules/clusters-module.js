/**
 * VSI Clusters Module
 * Handles cluster management and organization
 */
class VSIClustersModule {
    constructor(app) {
        this.app = app;
        
        // Listen for collection changes to refresh available collections in modals
        window.addEventListener('collectionsChanged', () => {
            this.onCollectionsChanged();
        });
    }

    /**
     * Handle collections changed event
     */
    onCollectionsChanged() {
        // If any cluster-related modal is open, refresh its collections list
        const addCollectionModal = document.getElementById('addCollectionModal');
        const quickAddModal = document.getElementById('quickAddCollectionModal');
        
        if (addCollectionModal && addCollectionModal.classList.contains('show')) {
            // Refresh the add collection modal if it's open
            const clusterId = document.getElementById('addCollectionClusterId').value;
            if (clusterId) {
                this.refreshCollectionsListInModal(clusterId);
            }
        }
        
        if (quickAddModal && quickAddModal.classList.contains('show')) {
            // Refresh the quick add modal if it's open
            const clusterId = document.getElementById('quickAddClusterId').value;
            const clusterName = document.getElementById('quickAddClusterName').textContent;
            if (clusterId) {
                this.refreshQuickAddModal(clusterId, clusterName);
            }
        }
    }

    /**
     * Refresh collections list in add collection modal
     */
    async refreshCollectionsListInModal(clusterId) {
        try {
            const response = await this.app.api.getCollections(true);
            if (response.success || Array.isArray(response)) {
                const collections = Array.isArray(response) ? response : response.data;
                this.populateCollectionsList(collections, clusterId);
            }
        } catch (error) {
            console.error('Error refreshing collections list:', error);
        }
    }

    /**
     * Refresh quick add collections modal
     */
    async refreshQuickAddModal(clusterId, clusterName) {
        try {
            const response = await this.app.api.getCollections(true);
            if (response.success || Array.isArray(response)) {
                const collections = Array.isArray(response) ? response : response.data;
                const availableCollections = collections.filter(c => !c.cluster_id);
                
                // Update the collections list in the modal
                const collectionsList = document.getElementById('quickAddCollectionsList');
                if (collectionsList) {
                    collectionsList.innerHTML = availableCollections.map(collection => `
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" value="${collection.id}" id="collection_${collection.id}">
                            <label class="form-check-label" for="collection_${collection.id}">
                                <strong>${collection.name}</strong>
                                <br><small class="text-muted">${collection.description || 'No description'} 
                                (${collection.document_count || 0} documents)</small>
                            </label>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error refreshing quick add modal:', error);
        }
    }

    showClusters() {
        // Use the UI module to hide all views
        if (this.app?.ui?.hideAllViews) {
            this.app.ui.hideAllViews();
        } else if (window.hideAllViews) {
            window.hideAllViews();
        } else {
            // Fallback
            document.querySelectorAll('[id$="View"]').forEach(view => {
                view.classList.add('hidden');
            });
        }
        
        document.getElementById('clustersView').classList.remove('hidden');
        document.getElementById('pageTitle').textContent = 'Clusters';
        
        // Update active navigation
        this.updateActiveNavLink('clusters');
        
        // Load clusters data
        this.loadClusters();
    }

    updateActiveNavLink(activeSection) {
        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current section
        const navLink = document.querySelector(`a[onclick="show${activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}()"]`);
        if (navLink) {
            navLink.classList.add('active');
        }
    }

    async loadClusters() {
        try {
            const response = await this.app.api.get('/api/clusters');
            if (response.success) {
                this.displayClusters(response.data);
            }
        } catch (error) {
            console.error('Error loading clusters:', error);
            this.app.ui.showNotification('Failed to load clusters', 'error');
        }
    }

    displayClusters(clusters) {
        const grid = document.getElementById('clustersGrid');
        if (!clusters || clusters.length === 0) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-layer-group fa-3x text-muted mb-3"></i>
                            <h5>No clusters yet</h5>
                            <p class="text-muted">Create your first cluster to organize your collections</p>
                            <button class="btn btn-primary" onclick="app.clusters.showCreateModal()">
                                <i class="fas fa-plus me-2"></i>Create Cluster
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = clusters.map(cluster => `
            <div class="col-md-4 mb-4">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">${cluster.name}</h5>
                        <span class="badge bg-${this.getClusterTypeColor(cluster.cluster_type)}">
                            ${cluster.cluster_type}
                        </span>
                    </div>
                    <div class="card-body">
                        <p class="text-muted small">${cluster.description || 'No description'}</p>
                        <div class="row text-center mb-3">
                            <div class="col-6">
                                <strong>${cluster.collection_count || 0}</strong>
                                <br><small class="text-muted">Collections</small>
                            </div>
                            <div class="col-6">
                                <strong>${cluster.total_documents || 0}</strong>
                                <br><small class="text-muted">Documents</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="app.clusters.viewCluster(${cluster.id})">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="app.clusters.editCluster(${cluster.id})">
                                <i class="fas fa-edit me-1"></i>Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="app.clusters.deleteCluster(${cluster.id})">
                                <i class="fas fa-trash me-1"></i>Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getClusterTypeColor(type) {
        const colors = {
            'logical': 'primary',
            'sharded': 'warning',
            'replicated': 'info'
        };
        return colors[type] || 'secondary';
    }

    async showCreateModal() {
        const modal = new bootstrap.Modal(document.getElementById('createClusterModal'));
        modal.show();
    }

    async createCluster() {
        try {
            const form = document.getElementById('createClusterForm');
            const formData = new FormData(form);
            
            const clusterData = {
                name: formData.get('name'),
                description: formData.get('description'),
                type: formData.get('type') || 'logical',
                settings: {}
            };

            // Add advanced settings if applicable
            if (clusterData.type === 'sharded') {
                clusterData.settings.shardCount = parseInt(formData.get('shardCount')) || 2;
                clusterData.settings.replicationFactor = parseInt(formData.get('replicationFactor')) || 1;
            } else if (clusterData.type === 'replicated') {
                clusterData.settings.replicationFactor = parseInt(formData.get('replicationFactor')) || 2;
            }

            const response = await this.app.api.post('/api/clusters', clusterData);
            if (response.success) {
                this.app.ui.showNotification('Cluster created successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('createClusterModal'));
                modal.hide();
                form.reset();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error creating cluster:', error);
            this.app.ui.showNotification('Failed to create cluster', 'error');
        }
    }

    async viewCluster(clusterId) {
        try {
            const response = await this.app.api.get(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.displayClusterDetail(response.data);
                if (window.app?.ui?.hideAllViews) {
                    this.app.ui.hideAllViews();
                } else if (window.hideAllViews) {
                    window.hideAllViews();
                }
                document.getElementById('clusterDetailView').classList.remove('hidden');
                document.getElementById('pageTitle').textContent = `Cluster: ${response.data.name}`;
            }
        } catch (error) {
            console.error('Error loading cluster:', error);
            this.app.ui.showNotification('Failed to load cluster details', 'error');
        }
    }

    displayClusterDetail(cluster) {
        document.getElementById('clusterDetailTitle').textContent = cluster.name;
        document.getElementById('clusterDescription').textContent = cluster.description || 'No description';
        document.getElementById('clusterType').textContent = cluster.cluster_type;
        document.getElementById('clusterDetailId').value = cluster.id;
        
        // Display collections in cluster
        const collectionsGrid = document.getElementById('clusterCollectionsGrid');
        if (!cluster.collections || cluster.collections.length === 0) {
            collectionsGrid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                            <h5>No collections in this cluster</h5>
                            <p class="text-muted">Add existing collections to this cluster</p>
                            <button class="btn btn-primary" onclick="app.clusters.showAddCollectionModal(${cluster.id})">
                                <i class="fas fa-plus me-2"></i>Add Collection
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        collectionsGrid.innerHTML = cluster.collections.map(collection => `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">${collection.name}</h6>
                        <p class="card-text text-muted small">${collection.description || 'No description'}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${collection.document_count || 0} documents</small>
                            <div>
                                <button class="btn btn-sm btn-outline-primary me-2" onclick="viewCollection(${collection.id})">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="app.clusters.removeCollectionFromCluster(${collection.id})">
                                    <i class="fas fa-unlink"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async editCluster(clusterId) {
        try {
            const response = await this.app.api.get(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.populateEditForm(response.data);
                const modal = new bootstrap.Modal(document.getElementById('editClusterModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading cluster for edit:', error);
            this.app.ui.showNotification('Failed to load cluster details', 'error');
        }
    }

    populateEditForm(cluster) {
        document.getElementById('editClusterId').value = cluster.id;
        document.getElementById('editClusterName').value = cluster.name;
        document.getElementById('editClusterDescription').value = cluster.description || '';
    }

    async updateCluster() {
        try {
            const clusterId = document.getElementById('editClusterId').value;
            const formData = new FormData(document.getElementById('editClusterForm'));
            
            const updates = {
                name: formData.get('name'),
                description: formData.get('description')
            };

            const response = await this.app.api.put(`/api/clusters/${clusterId}`, updates);
            if (response.success) {
                this.app.ui.showNotification('Cluster updated successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('editClusterModal'));
                modal.hide();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error updating cluster:', error);
            this.app.ui.showNotification('Failed to update cluster', 'error');
        }
    }

    async deleteCluster(clusterId) {
        if (!confirm('Are you sure you want to delete this cluster? Collections will not be deleted, only removed from the cluster.')) {
            return;
        }

        try {
            const response = await this.app.api.delete(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.app.ui.showNotification('Cluster deleted successfully', 'success');
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error deleting cluster:', error);
            this.app.ui.showNotification('Failed to delete cluster', 'error');
        }
    }

    async showAddCollectionModal(clusterId) {
        try {
            const response = await this.app.api.getCollections(true);
            if (response.success || Array.isArray(response)) {
                const collections = Array.isArray(response) ? response : response.data;
                this.populateCollectionsList(collections, clusterId);
                const modal = new bootstrap.Modal(document.getElementById('addCollectionModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading collections:', error);
            this.app.ui.showNotification('Failed to load collections', 'error');
        }
    }

    populateCollectionsList(collections, clusterId) {
        document.getElementById('addCollectionClusterId').value = clusterId;
        const select = document.getElementById('availableCollections');
        
        select.innerHTML = '<option value="">Select a collection...</option>' +
            collections.filter(c => !c.cluster_id).map(collection => 
                `<option value="${collection.id}">${collection.name} (${collection.document_count || 0} documents)</option>`
            ).join('');
    }

    async addCollectionToCluster() {
        try {
            const clusterId = document.getElementById('addCollectionClusterId').value;
            const collectionId = document.getElementById('availableCollections').value;
            
            if (!collectionId) {
                this.app.ui.showNotification('Please select a collection', 'error');
                return;
            }

            const response = await this.app.api.post(`/api/clusters/${clusterId}/collections/${collectionId}`);
            if (response.success) {
                this.app.ui.showNotification('Collection added to cluster successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('addCollectionModal'));
                modal.hide();
                
                // Refresh cluster view
                this.viewCluster(clusterId);
                
                // Also refresh collections view if user has it open/cached
                if (this.app.collections && typeof this.app.collections.loadCollections === 'function') {
                    this.app.collections.loadCollections();
                }
                
                // Refresh dashboard if it's currently visible
                const dashboardView = document.getElementById('dashboardView');
                if (dashboardView && !dashboardView.classList.contains('hidden')) {
                    this.app.collections.loadDashboard();
                }
            }
        } catch (error) {
            console.error('Error adding collection to cluster:', error);
            this.app.ui.showNotification('Failed to add collection to cluster', 'error');
        }
    }

    async removeCollectionFromCluster(collectionId) {
        if (!confirm('Remove this collection from the cluster?')) {
            return;
        }

        try {
            const response = await this.app.api.delete(`/api/collections/${collectionId}/cluster`);
            if (response.success) {
                this.app.ui.showNotification('Collection removed from cluster successfully', 'success');
                const clusterId = document.getElementById('clusterDetailId').value;
                
                // Refresh cluster view
                this.viewCluster(clusterId);
                
                // Also refresh collections view if user has it open/cached
                if (this.app.collections && typeof this.app.collections.loadCollections === 'function') {
                    this.app.collections.loadCollections();
                }
                
                // Refresh dashboard if it's currently visible
                const dashboardView = document.getElementById('dashboardView');
                if (dashboardView && !dashboardView.classList.contains('hidden')) {
                    this.app.collections.loadDashboard();
                }
            }
        } catch (error) {
            console.error('Error removing collection from cluster:', error);
            this.app.ui.showNotification('Failed to remove collection from cluster', 'error');
        }
    }

    // ==================== ADVANCED CLUSTERING FEATURES ====================

    /**
     * Load and display cluster health analysis
     */
    async loadClusterHealth() {
        try {
            // Show loading state
            const healthContainer = document.getElementById('clusterHealthDashboard');
            if (healthContainer) {
                healthContainer.innerHTML = `
                    <div class="clustering-loading">
                        <i class="fas fa-spinner"></i>
                        Loading cluster health data...
                    </div>
                `;
            }

            const response = await this.app.api.get('/api/clusters/health');
            if (response.success) {
                this.displayClusterHealth(response.data);
            }
        } catch (error) {
            console.error('Error loading cluster health:', error);
            this.app.ui.showNotification('Failed to load cluster health', 'error');
            
            // Show error state
            const healthContainer = document.getElementById('clusterHealthDashboard');
            if (healthContainer) {
                healthContainer.innerHTML = `
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                            <h5>Failed to load cluster health</h5>
                            <p class="text-muted">Please try again or check your connection</p>
                            <button class="btn btn-primary" onclick="app.clusters.loadClusterHealth()">
                                <i class="fas fa-sync me-2"></i>Retry
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    /**
     * Display cluster health dashboard
     */
    displayClusterHealth(healthData) {
        const healthContainer = document.getElementById('clusterHealthDashboard');
        if (!healthContainer) return;

        const healthScore = (healthData.healthScore * 100).toFixed(1);
        const scoreColor = healthScore >= 80 ? 'success' : healthScore >= 60 ? 'warning' : 'danger';

        healthContainer.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card text-center">
                        <div class="card-body">
                            <div class="display-4 text-${scoreColor}">${healthScore}%</div>
                            <h5>Overall Health Score</h5>
                            <p class="text-muted">Based on ${healthData.summary.totalClusters} clusters</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header">
                            <h5><i class="fas fa-chart-pie me-2"></i>Cluster Summary</h5>
                        </div>
                        <div class="card-body">
                            <div class="row text-center">
                                <div class="col-3">
                                    <div class="h4 text-success">${healthData.summary.healthyClusters}</div>
                                    <small class="text-muted">Healthy</small>
                                </div>
                                <div class="col-3">
                                    <div class="h4 text-warning">${healthData.summary.needsAttention}</div>
                                    <small class="text-muted">Needs Attention</small>
                                </div>
                                <div class="col-3">
                                    <div class="h4 text-info">${healthData.summary.oversized}</div>
                                    <small class="text-muted">Oversized</small>
                                </div>
                                <div class="col-3">
                                    <div class="h4 text-secondary">${healthData.summary.undersized}</div>
                                    <small class="text-muted">Undersized</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Recommendations -->
            ${healthData.recommendations && healthData.recommendations.length > 0 ? `
            <div class="card mb-4">
                <div class="card-header">
                    <h5><i class="fas fa-lightbulb me-2"></i>Recommendations</h5>
                </div>
                <div class="card-body">
                    <ul class="list-unstyled">
                        ${healthData.recommendations.map(rec => `
                            <li class="mb-2">
                                <i class="fas fa-arrow-right text-primary me-2"></i>${rec}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            ` : ''}

            <!-- Action Items -->
            ${healthData.actionItems && healthData.actionItems.length > 0 ? `
            <div class="card mb-4">
                <div class="card-header">
                    <h5><i class="fas fa-tasks me-2"></i>Action Items</h5>
                </div>
                <div class="card-body">
                    ${healthData.actionItems.map(item => `
                        <div class="d-flex justify-content-between align-items-center mb-3 p-3 border rounded">
                            <div>
                                <h6 class="mb-1">${item.clusterName}</h6>
                                <p class="mb-0 text-muted">${item.action}</p>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-${item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'info'} mb-2">
                                    ${item.priority} priority
                                </span>
                                <br>
                                ${this.getActionButton(item)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Individual Cluster Health -->
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-heartbeat me-2"></i>Individual Cluster Health</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        ${healthData.clusters.map(cluster => `
                            <div class="col-md-6 mb-3">
                                <div class="card border-${this.getHealthBorderColor(cluster.status)}">
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                            <h6 class="card-title">${cluster.clusterName}</h6>
                                            <span class="badge bg-${this.getHealthBadgeColor(cluster.status)}">${cluster.status}</span>
                                        </div>
                                        <div class="mb-2">
                                            <div class="progress" style="height: 8px;">
                                                <div class="progress-bar bg-${this.getHealthBadgeColor(cluster.status)}" 
                                                     style="width: ${cluster.healthScore * 100}%"></div>
                                            </div>
                                            <small class="text-muted">${(cluster.healthScore * 100).toFixed(1)}% health score</small>
                                        </div>
                                        <div class="row text-center small">
                                            <div class="col-4">
                                                <strong>${cluster.metrics.collectionCount}</strong><br>
                                                <span class="text-muted">Collections</span>
                                            </div>
                                            <div class="col-4">
                                                <strong>${cluster.metrics.recentActivity}</strong><br>
                                                <span class="text-muted">Recent</span>
                                            </div>
                                            <div class="col-4">
                                                <strong>${cluster.metrics.documentsPresent ? 'Yes' : 'No'}</strong><br>
                                                <span class="text-muted">Docs</span>
                                            </div>
                                        </div>
                                        ${cluster.issues && cluster.issues.length > 0 ? `
                                        <div class="mt-2">
                                            <small class="text-warning">
                                                <i class="fas fa-exclamation-triangle me-1"></i>
                                                ${cluster.issues.join(', ')}
                                            </small>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    getActionButton(item) {
        switch (item.type) {
            case 'split_cluster':
                return `<button class="btn btn-sm btn-warning" onclick="app.clusters.splitCluster(${item.clusterId})">
                    <i class="fas fa-cut me-1"></i>Split
                </button>`;
            case 'merge_or_expand':
                return `
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="app.clusters.showMergeOptions(${item.clusterId})">
                            <i class="fas fa-compress-arrows-alt me-1"></i>Merge
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="app.clusters.quickAddCollection(${item.clusterId}, '${item.clusterName.replace(/'/g, "\\'")}')">
                            <i class="fas fa-plus me-1"></i>Add Collection
                        </button>
                    </div>
                `;
            case 'improve_health':
                return `
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="app.clusters.viewCluster(${item.clusterId})">
                            <i class="fas fa-tools me-1"></i>Review
                        </button>
                        <button class="btn btn-sm btn-success" onclick="app.clusters.quickAddCollection(${item.clusterId}, '${item.clusterName.replace(/'/g, "\\'")}')">
                            <i class="fas fa-plus me-1"></i>Add Collection
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="app.clusters.quickDeleteCluster(${item.clusterId}, '${item.clusterName.replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash me-1"></i>Delete
                        </button>
                    </div>
                `;
            default:
                return `<button class="btn btn-sm btn-secondary" onclick="app.clusters.viewCluster(${item.clusterId})">
                    <i class="fas fa-eye me-1"></i>View
                </button>`;
        }
    }

    getHealthBorderColor(status) {
        return {
            'healthy': 'success',
            'fair': 'warning', 
            'poor': 'warning',
            'critical': 'danger'
        }[status] || 'secondary';
    }

    getHealthBadgeColor(status) {
        return {
            'healthy': 'success',
            'fair': 'warning',
            'poor': 'warning', 
            'critical': 'danger'
        }[status] || 'secondary';
    }

    /**
     * Load and display intelligent cluster suggestions
     */
    async loadClusterSuggestions() {
        try {
            // Show loading state
            const container = document.getElementById('clusterSuggestions');
            if (container) {
                container.innerHTML = `
                    <div class="clustering-loading">
                        <i class="fas fa-spinner"></i>
                        Loading AI suggestions...
                    </div>
                `;
            }

            const response = await this.app.api.get('/api/clusters/suggestions');
            if (response.success) {
                this.displayClusterSuggestions(response.data);
            }
        } catch (error) {
            console.error('Error loading cluster suggestions:', error);
            this.app.ui.showNotification('Failed to load cluster suggestions', 'error');
            
            // Show error state
            const container = document.getElementById('clusterSuggestions');
            if (container) {
                container.innerHTML = `
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                            <h5>Failed to load suggestions</h5>
                            <p class="text-muted">Please try again or check your connection</p>
                            <button class="btn btn-primary" onclick="app.clusters.loadClusterSuggestions()">
                                <i class="fas fa-sync me-2"></i>Retry
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    /**
     * Display intelligent cluster suggestions
     */
    displayClusterSuggestions(suggestionsData) {
        const container = document.getElementById('clusterSuggestions');
        if (!container) return;

        if (!suggestionsData.suggestions || suggestionsData.suggestions.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="card-body text-center">
                        <i class="fas fa-lightbulb fa-3x text-muted mb-3"></i>
                        <h5>No suggestions available</h5>
                        <p class="text-muted">Upload more documents or create collections to get AI-powered clustering suggestions</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-brain me-2"></i>AI Cluster Suggestions</h5>
                    <small class="text-muted">${suggestionsData.count} suggestions available</small>
                </div>
                <div class="card-body">
                    ${suggestionsData.suggestions.map(suggestion => `
                        <div class="suggestion-item mb-3 p-3 border rounded" data-suggestion-id="${suggestion.id}">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <h6 class="mb-2">
                                        <i class="fas fa-${suggestion.type === 'create' ? 'plus' : 'arrows-alt'} me-2 text-primary"></i>
                                        ${suggestion.reason}
                                    </h6>
                                    <p class="text-muted mb-2">${suggestion.description}</p>
                                    <div class="d-flex gap-2 mb-2">
                                        <span class="badge bg-info">Confidence: ${(suggestion.confidence * 100).toFixed(1)}%</span>
                                        <span class="badge bg-secondary">${suggestion.type}</span>
                                    </div>
                                    ${suggestion.details ? `
                                    <div class="small text-muted">
                                        <strong>Details:</strong> ${suggestion.details}
                                    </div>
                                    ` : ''}
                                </div>
                                <div class="text-end">
                                    <button class="btn btn-sm btn-success me-2" onclick="app.clusters.acceptSuggestion('${suggestion.id}')">
                                        <i class="fas fa-check me-1"></i>Accept
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="app.clusters.dismissSuggestion('${suggestion.id}')">
                                        <i class="fas fa-times me-1"></i>Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Accept a cluster suggestion
     */
    async acceptSuggestion(suggestionId) {
        try {
            const response = await this.app.api.post(`/api/clusters/intelligence/suggestions/${suggestionId}/accept`);
            if (response.success) {
                this.app.ui.showNotification('Suggestion accepted successfully', 'success');
                this.loadClusterSuggestions();
                this.loadClusters();
                this.loadClusterHealth();
            }
        } catch (error) {
            console.error('Error accepting suggestion:', error);
            this.app.ui.showNotification('Failed to accept suggestion', 'error');
        }
    }

    /**
     * Dismiss a cluster suggestion
     */
    async dismissSuggestion(suggestionId) {
        try {
            const response = await this.app.api.post(`/api/clusters/intelligence/suggestions/${suggestionId}/dismiss`);
            if (response.success) {
                this.app.ui.showNotification('Suggestion dismissed', 'info');
                this.loadClusterSuggestions();
            }
        } catch (error) {
            console.error('Error dismissing suggestion:', error);
            this.app.ui.showNotification('Failed to dismiss suggestion', 'error');
        }
    }

    /**
     * Load and display cross-cluster analytics
     */
    async loadClusterAnalytics() {
        try {
            // Show loading state
            const container = document.getElementById('clusterAnalytics');
            if (container) {
                container.innerHTML = `
                    <div class="clustering-loading">
                        <i class="fas fa-spinner"></i>
                        Loading analytics data...
                    </div>
                `;
            }

            const [overlaps, bridges, trends] = await Promise.all([
                this.app.api.get('/api/clusters/analytics/overlaps'),
                this.app.api.get('/api/clusters/analytics/bridges'),
                this.app.api.get('/api/clusters/analytics/trends')
            ]);

            if (overlaps.success && bridges.success && trends.success) {
                this.displayClusterAnalytics({
                    overlaps: overlaps.data,
                    bridges: bridges.data,
                    trends: trends.data
                });
            }
        } catch (error) {
            console.error('Error loading cluster analytics:', error);
            this.app.ui.showNotification('Failed to load cluster analytics', 'error');
            
            // Show error state
            const container = document.getElementById('clusterAnalytics');
            if (container) {
                container.innerHTML = `
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                            <h5>Failed to load analytics</h5>
                            <p class="text-muted">Please try again or check your connection</p>
                            <button class="btn btn-primary" onclick="app.clusters.loadClusterAnalytics()">
                                <i class="fas fa-sync me-2"></i>Retry
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    /**
     * Display cross-cluster analytics
     */
    displayClusterAnalytics(analyticsData) {
        const container = document.getElementById('clusterAnalytics');
        if (!container) return;

        container.innerHTML = `
            <!-- Cluster Overlaps -->
            <div class="card mb-4">
                <div class="card-header">
                    <h5><i class="fas fa-intersection me-2"></i>Cluster Overlaps</h5>
                </div>
                <div class="card-body">
                    ${analyticsData.overlaps.overlaps && analyticsData.overlaps.overlaps.length > 0 ? `
                        ${analyticsData.overlaps.overlaps.map(overlap => `
                            <div class="overlap-item mb-3 p-3 border rounded">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6>${overlap.cluster1Name} ↔ ${overlap.cluster2Name}</h6>
                                        <p class="mb-0 text-muted">Similarity: ${(overlap.similarity * 100).toFixed(1)}%</p>
                                    </div>
                                    <button class="btn btn-sm btn-outline-primary" onclick="app.clusters.analyzeOverlap(${overlap.cluster1Id}, ${overlap.cluster2Id})">
                                        <i class="fas fa-search me-1"></i>Analyze
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    ` : `
                        <p class="text-muted text-center">No significant overlaps found between clusters</p>
                    `}
                </div>
            </div>

            <!-- Bridge Documents -->
            <div class="card mb-4">
                <div class="card-header">
                    <h5><i class="fas fa-bridge me-2"></i>Bridge Documents</h5>
                </div>
                <div class="card-body">
                    ${analyticsData.bridges.bridgeDocuments && analyticsData.bridges.bridgeDocuments.length > 0 ? `
                        ${analyticsData.bridges.bridgeDocuments.map(bridge => `
                            <div class="bridge-item mb-3 p-3 border rounded">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div class="flex-grow-1">
                                        <h6>${bridge.documentTitle}</h6>
                                        <p class="text-muted mb-2">${bridge.summary || 'Document connecting multiple clusters'}</p>
                                        <div class="d-flex gap-2">
                                            ${bridge.clusters.map(cluster => `
                                                <span class="badge bg-primary">${cluster.name}</span>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div class="text-end">
                                        <div class="text-muted small">Bridge Score: ${(bridge.bridgeScore * 100).toFixed(1)}%</div>
                                        <button class="btn btn-sm btn-outline-primary mt-1" onclick="viewDocument(${bridge.documentId})">
                                            <i class="fas fa-eye me-1"></i>View
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    ` : `
                        <p class="text-muted text-center">No bridge documents found</p>
                    `}
                </div>
            </div>

            <!-- Growth Trends -->
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-chart-line me-2"></i>Cluster Growth Trends</h5>
                </div>
                <div class="card-body">
                    ${analyticsData.trends.trends && analyticsData.trends.trends.length > 0 ? `
                        <div class="row">
                            ${analyticsData.trends.trends.map(trend => `
                                <div class="col-md-6 mb-3">
                                    <div class="card border-${this.getTrendColor(trend.trend)}">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between align-items-start">
                                                <div>
                                                    <h6 class="card-title">${trend.clusterName}</h6>
                                                    <p class="text-muted small mb-2">
                                                        ${trend.collectionCount} collections, ${trend.documentCount} documents
                                                    </p>
                                                    <span class="badge bg-${this.getTrendColor(trend.trend)}">
                                                        <i class="fas fa-${this.getTrendIcon(trend.trend)} me-1"></i>
                                                        ${trend.trend}
                                                    </span>
                                                </div>
                                                <div class="text-end">
                                                    <div class="text-${this.getTrendColor(trend.trend)} h5">
                                                        ${trend.recentDocuments}
                                                    </div>
                                                    <small class="text-muted">Recent docs</small>
                                                </div>
                                            </div>
                                            ${trend.lastActivity ? `
                                            <div class="mt-2 small text-muted">
                                                Last activity: ${new Date(trend.lastActivity).toLocaleDateString()}
                                            </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <p class="text-muted text-center">No trend data available</p>
                    `}
                </div>
            </div>
        `;
    }

    getTrendColor(trend) {
        return {
            'growing': 'success',
            'stable': 'info',
            'declining': 'warning',
            'new': 'secondary'
        }[trend] || 'secondary';
    }

    getTrendIcon(trend) {
        return {
            'growing': 'arrow-up',
            'stable': 'arrow-right',
            'declining': 'arrow-down',
            'new': 'star'
        }[trend] || 'circle';
    }

    /**
     * Split a cluster
     */
    async splitCluster(clusterId) {
        if (!confirm('Split this cluster into smaller, more focused clusters?')) {
            return;
        }

        try {
            const response = await this.app.api.post(`/api/clusters/${clusterId}/split`);
            if (response.success) {
                this.app.ui.showNotification(`Cluster split into ${response.data.newClusters.length} new clusters`, 'success');
                this.loadClusters();
                this.loadClusterHealth();
            }
        } catch (error) {
            console.error('Error splitting cluster:', error);
            this.app.ui.showNotification('Failed to split cluster', 'error');
        }
    }

    /**
     * Show advanced clustering dashboard
     */
    showAdvancedDashboard() {
        if (this.app?.ui?.hideAllViews) {
            this.app.ui.hideAllViews();
        } else if (window.hideAllViews) {
            window.hideAllViews();
        } else {
            document.querySelectorAll('[id$="View"]').forEach(view => {
                view.classList.add('hidden');
            });
        }
        
        document.getElementById('advancedClusteringView').classList.remove('hidden');
        document.getElementById('pageTitle').textContent = 'Advanced Clustering';
        
        // Update active navigation
        this.updateActiveNavLink('advanced-clustering');
        
        // Load all advanced clustering data
        this.loadClusterHealth();
        this.loadClusterSuggestions();
        this.loadClusterAnalytics();
    }

    /**
     * Show merge options for a cluster
     */
    async showMergeOptions(clusterId) {
        try {
            // Get available clusters to merge with
            const response = await this.app.api.get('/api/clusters');
            if (response.success) {
                const availableClusters = response.data.filter(c => c.id !== clusterId);
                
                if (availableClusters.length === 0) {
                    this.app.ui.showNotification('No other clusters available to merge with', 'info');
                    return;
                }

                // Show merge modal
                this.showMergeModal(clusterId, availableClusters);
            }
        } catch (error) {
            console.error('Error loading merge options:', error);
            this.app.ui.showNotification('Failed to load merge options', 'error');
        }
    }

    /**
     * Show merge modal
     */
    showMergeModal(clusterId, availableClusters) {
        // Create modal HTML if it doesn't exist
        let mergeModal = document.getElementById('mergeClusterModal');
        if (!mergeModal) {
            const modalHTML = `
                <div class="modal fade" id="mergeClusterModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Merge Clusters</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p>Select clusters to merge together:</p>
                                <div id="mergeClustersList"></div>
                                <input type="hidden" id="primaryClusterId">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-warning" onclick="app.clusters.executeMerge()">
                                    <i class="fas fa-compress-arrows-alt me-2"></i>Merge Clusters
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            mergeModal = document.getElementById('mergeClusterModal');
        }

        // Populate the modal
        document.getElementById('primaryClusterId').value = clusterId;
        const clustersList = document.getElementById('mergeClustersList');
        
        clustersList.innerHTML = availableClusters.map(cluster => `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" value="${cluster.id}" id="cluster_${cluster.id}">
                <label class="form-check-label" for="cluster_${cluster.id}">
                    <strong>${cluster.name}</strong>
                    <br><small class="text-muted">${cluster.description || 'No description'} 
                    (${cluster.collection_count || 0} collections)</small>
                </label>
            </div>
        `).join('');

        const modal = new bootstrap.Modal(mergeModal);
        modal.show();
    }

    /**
     * Execute cluster merge
     */
    async executeMerge() {
        try {
            const primaryClusterId = document.getElementById('primaryClusterId').value;
            const checkboxes = document.querySelectorAll('#mergeClustersList input[type="checkbox"]:checked');
            
            if (checkboxes.length === 0) {
                this.app.ui.showNotification('Please select at least one cluster to merge', 'error');
                return;
            }

            const clusterIds = [parseInt(primaryClusterId), ...Array.from(checkboxes).map(cb => parseInt(cb.value))];
            
            const response = await this.app.api.post('/api/clusters/merge', {
                clusterIds: clusterIds
            });

            if (response.success) {
                this.app.ui.showNotification('Clusters merged successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('mergeClusterModal'));
                modal.hide();
                this.loadClusters();
                this.loadClusterHealth();
            }
        } catch (error) {
            console.error('Error merging clusters:', error);
            this.app.ui.showNotification('Failed to merge clusters', 'error');
        }
    }

    /**
     * Quick delete cluster from action items
     */
    async quickDeleteCluster(clusterId, clusterName) {
        if (!confirm(`Are you sure you want to delete the cluster "${clusterName}"? Collections will not be deleted, only removed from the cluster.`)) {
            return;
        }

        try {
            const response = await this.app.api.delete(`/api/clusters/${clusterId}`);
            if (response.success) {
                this.app.ui.showNotification('Cluster deleted successfully', 'success');
                this.loadClusterHealth();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error deleting cluster:', error);
            this.app.ui.showNotification('Failed to delete cluster', 'error');
        }
    }

    /**
     * Quick add collection to cluster
     */
    async quickAddCollection(clusterId, clusterName) {
        try {
            // Always fetch fresh collections data (not cached)
            const response = await this.app.api.getCollections(true);
            if (response.success || Array.isArray(response)) {
                const collections = Array.isArray(response) ? response : response.data;
                const availableCollections = collections.filter(c => !c.cluster_id);
                
                if (availableCollections.length === 0) {
                    this.app.ui.showNotification('No collections available to add', 'info');
                    return;
                }

                this.showQuickAddCollectionModal(clusterId, clusterName, availableCollections);
            }
        } catch (error) {
            console.error('Error loading collections:', error);
            this.app.ui.showNotification('Failed to load collections', 'error');
        }
    }

    /**
     * Show quick add collection modal
     */
    showQuickAddCollectionModal(clusterId, clusterName, availableCollections) {
        // Create modal HTML if it doesn't exist
        let quickAddModal = document.getElementById('quickAddCollectionModal');
        if (!quickAddModal) {
            const modalHTML = `
                <div class="modal fade" id="quickAddCollectionModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Add Collection to Cluster</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p>Add collections to cluster: <strong id="quickAddClusterName"></strong></p>
                                <div id="quickAddCollectionsList"></div>
                                <input type="hidden" id="quickAddClusterId">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" onclick="app.clusters.executeQuickAdd()">
                                    <i class="fas fa-plus me-2"></i>Add Collections
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            quickAddModal = document.getElementById('quickAddCollectionModal');
        }

        // Populate the modal
        document.getElementById('quickAddClusterId').value = clusterId;
        document.getElementById('quickAddClusterName').textContent = clusterName;
        const collectionsList = document.getElementById('quickAddCollectionsList');
        
        collectionsList.innerHTML = availableCollections.map(collection => `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" value="${collection.id}" id="collection_${collection.id}">
                <label class="form-check-label" for="collection_${collection.id}">
                    <strong>${collection.name}</strong>
                    <br><small class="text-muted">${collection.description || 'No description'} 
                    (${collection.document_count || 0} documents)</small>
                </label>
            </div>
        `).join('');

        const modal = new bootstrap.Modal(quickAddModal);
        modal.show();
    }

    /**
     * Execute quick add collections
     */
    async executeQuickAdd() {
        try {
            const clusterId = document.getElementById('quickAddClusterId').value;
            const checkboxes = document.querySelectorAll('#quickAddCollectionsList input[type="checkbox"]:checked');
            
            if (checkboxes.length === 0) {
                this.app.ui.showNotification('Please select at least one collection to add', 'error');
                return;
            }

            // Add each selected collection to the cluster
            const promises = Array.from(checkboxes).map(cb => 
                this.app.api.post(`/api/clusters/${clusterId}/collections/${cb.value}`)
            );

            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success).length;

            if (successful > 0) {
                this.app.ui.showNotification(`${successful} collection(s) added successfully`, 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('quickAddCollectionModal'));
                modal.hide();
                this.loadClusterHealth();
                this.loadClusters();
            }
        } catch (error) {
            console.error('Error adding collections:', error);
            this.app.ui.showNotification('Failed to add collections', 'error');
        }
    }
}

window.VSIClustersModule = VSIClustersModule;
