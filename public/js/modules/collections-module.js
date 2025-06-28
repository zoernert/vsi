/**
 * VSI Collections Module
 * Handles collection management, dashboard, and collection details
 */
class VSICollectionsModule {
    constructor(app) {
        this.app = app;
    }

    async loadDashboard() {
        try {
            console.log('Loading dashboard...');
            
            const [collections, usage] = await Promise.all([
                this.app.api.getCollections(true),
                this.app.api.getUserUsage()
            ]);

            console.log('Dashboard data loaded:', { collections, usage });
            
            this.renderDashboard(collections, usage);
        } catch (error) {
            console.error('Dashboard load error:', error);
            this.app.showNotification('Failed to load dashboard', 'error');
        }
    }

    renderDashboard(collections, usage) {
        // The HTML uses individual elements, not a container called 'dashboardStats'
        // Update the individual dashboard counters and recent collections
        
        // Handle collections response - OpenAPI shows it's returned directly as array
        let collectionsArray = [];
        if (Array.isArray(collections)) {
            collectionsArray = collections;
        } else if (collections && Array.isArray(collections.data)) {
            collectionsArray = collections.data;
        }
        
        // Calculate stats from actual collections
        const totalCollections = collectionsArray.length;
        const totalDocuments = collectionsArray.reduce((sum, col) => 
            sum + parseInt(col.document_count || col.stats?.document_count || '0'), 0
        );
        
        // Use the correct usage structure - handle both wrapped and direct response
        let usageStats = usage;
        if (usage && usage.success && usage.data) {
            usageStats = usage.data;
        }
        usageStats = usageStats || {};
        
        const collectionsUsage = usageStats.collections || { current: totalCollections, limit: -1, percentage: 0 };
        const documentsUsage = usageStats.documents || { current: totalDocuments, limit: -1, percentage: 0 };
        const searchesUsage = usageStats.searches || { current: 0, limit: -1, percentage: 0 };
        const uploadsUsage = usageStats.uploads || { current: 0, limit: -1, percentage: 0 };
        
        // Update the individual dashboard counters
        this.updateDashboardCounters(collectionsUsage, documentsUsage, searchesUsage, uploadsUsage);
        
        // Update recent collections
        const recentCollectionsContainer = document.getElementById('recentCollections');
        if (recentCollectionsContainer) {
            recentCollectionsContainer.innerHTML = this.renderRecentCollectionsHTML(collectionsArray.slice(0, 5));
        }
        
        // Update recent activity (placeholder for now)
        const recentActivityContainer = document.getElementById('recentActivity');
        if (recentActivityContainer) {
            recentActivityContainer.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-clock fa-2x mb-2"></i>
                    <p class="small">Recent activity tracking will be available soon.</p>
                </div>
            `;
        }
    }

    updateDashboardCounters(collections, documents, searches, uploads) {
        // Update the dashboard view counters if they exist
        const collectionsCountEl = document.getElementById('collectionsCount');
        const documentsCountEl = document.getElementById('documentsCount');
        const searchesCountEl = document.getElementById('searchesCount');
        const uploadsCountEl = document.getElementById('uploadsCount');
        
        if (collectionsCountEl) collectionsCountEl.textContent = collections.current;
        if (documentsCountEl) documentsCountEl.textContent = documents.current;
        if (searchesCountEl) searchesCountEl.textContent = searches.current;
        if (uploadsCountEl) uploadsCountEl.textContent = uploads.current;
    }

    renderRecentCollectionsHTML(collections) {
        if (!collections || collections.length === 0) {
            return '<p class="text-muted">No collections yet. Create your first collection to get started!</p>';
        }

        return collections.map(collection => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${collection.name}</strong>
                    <br>
                    <small class="text-muted">
                        ${collection.document_count || collection.stats?.document_count || 0} documents • 
                        Updated ${new Date(collection.updated_at).toLocaleDateString()}
                    </small>
                </div>
                <button class="btn btn-outline-primary btn-sm" onclick="app.collections.openCollection('${collection.id}')">
                    <i class="fas fa-folder-open me-2"></i>Open
                </button>
            </div>
        `).join('');
    }

    renderRecentCollections(collections) {
        const container = document.getElementById('recentCollections');
        
        if (!collections || collections.length === 0) {
            container.innerHTML = '<p class="text-muted">No collections yet. Create your first collection to get started!</p>';
            return;
        }

        container.innerHTML = collections.map(collection => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${collection.name}</strong>
                    <br>
                    <small class="text-muted">
                        ${collection.documentsCount || 0} documents • 
                        ${collection.chunksCount || 0} chunks • 
                        ${this.app.formatBytes(collection.stats?.totalContentSize || 0)}
                    </small>
                </div>
                <button class="btn btn-outline-primary btn-sm" onclick="app.collections.openCollection('${collection.id}')">
                    Open
                </button>
            </div>
        `).join('');
    }

    async showCollections() {
        try {
            console.log('Showing collections view...');
            
            // Hide all views first
            if (this.app.ui && this.app.ui.hideAllViews) {
                this.app.ui.hideAllViews();
            }
            
            // Show collections view
            const collectionsView = document.getElementById('collectionsView');
            if (collectionsView) {
                collectionsView.classList.remove('hidden');
            }
            
            // Update page title
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) {
                pageTitle.textContent = 'Collections';
            }
            
            // Update navigation
            this.updateActiveNavLink('collections');
            
            // Load and display collections
            await this.loadCollections();
        } catch (error) {
            console.error('Error showing collections:', error);
            this.app.showNotification('Failed to load collections', 'error');
        }
    }

    async loadCollections() {
        try {
            console.log('Loading collections...');
            const response = await this.app.api.getCollections(true);
            
            let collections = [];
            if (Array.isArray(response)) {
                collections = response;
            } else if (response && Array.isArray(response.data)) {
                collections = response.data;
            }
            
            this.displayCollections(collections);
        } catch (error) {
            console.error('Error loading collections:', error);
            this.app.showNotification('Failed to load collections', 'error');
        }
    }

    displayCollections(collections) {
        const grid = document.getElementById('collectionsGrid');
        if (!grid) return;
        
        if (!collections || collections.length === 0) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-folder fa-3x text-muted mb-3"></i>
                            <h5>No collections yet</h5>
                            <p class="text-muted">Create your first collection to get started</p>
                            <button class="btn btn-primary" onclick="showCreateCollection()">
                                <i class="fas fa-plus me-2"></i>Create Collection
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Group collections by cluster for organized display
        const grouped = this.groupCollectionsByCluster(collections);
        
        grid.innerHTML = Object.keys(grouped).map(clusterName => {
            const clusterCollections = grouped[clusterName];
            const isUnclustered = clusterName === 'Unclustered';
            
            return `
                <div class="col-12 mb-4">
                    <div class="cluster-section">
                        <h5 class="mb-3 d-flex align-items-center">
                            ${isUnclustered ? 
                                '<i class="fas fa-folder-open me-2 text-muted"></i>Unclustered Collections' : 
                                `<i class="fas fa-layer-group me-2 text-primary"></i>Cluster: ${clusterName}`
                            }
                            <span class="badge bg-secondary ms-2">${clusterCollections.length}</span>
                        </h5>
                        <div class="row">
                            ${clusterCollections.map(collection => this.renderCollectionCard(collection)).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    groupCollectionsByCluster(collections) {
        const grouped = {};
        
        collections.forEach(collection => {
            const clusterName = collection.cluster_name || 'Unclustered';
            if (!grouped[clusterName]) {
                grouped[clusterName] = [];
            }
            grouped[clusterName].push(collection);
        });
        
        return grouped;
    }

    renderCollectionCard(collection) {
        const clusterBadge = collection.cluster_name ? 
            `<span class="badge bg-primary mb-2">${collection.cluster_name}</span>` : '';
        
        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card h-100 collection-card" onclick="window.app.collections.openCollection('${collection.id}')">
                    <div class="card-body">
                        ${clusterBadge}
                        <h6 class="card-title">${collection.name}</h6>
                        <p class="card-text text-muted small">${collection.description || 'No description'}</p>
                        <div class="d-flex justify-content-between text-muted small">
                            <span><i class="fas fa-file me-1"></i>${collection.document_count || 0} docs</span>
                            <span><i class="fas fa-calendar me-1"></i>${new Date(collection.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent">
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="event.stopPropagation(); window.app.collections.openCollection('${collection.id}')">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); window.app.collections.editCollection('${collection.id}')">
                                <i class="fas fa-edit me-1"></i>Edit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
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

    async openCollection(id) {
        try {
            const response = await this.app.api.getCollection(id);
            let collection = response;
            if (response && response.success && response.data) collection = response.data;
            this.app.currentCollection = collection;
            
            // Auto-generate or get cluster for this collection
            await this.loadCollectionCluster(id);
            
            this.showCollectionDetail();
        } catch (error) {
            this.app.showNotification('Failed to load collection', 'error');
        }
    }

    async loadCollectionCluster(collectionId) {
        try {
            // Load both simple cluster and content-based analysis
            const [clusterResponse, contentResponse] = await Promise.all([
                this.app.api.get(`/api/clusters/for-collection/${collectionId}`).catch(e => null),
                this.app.api.getContentBasedClusters(collectionId, {
                    maxClusters: 5,
                    minClusterSize: 2
                }).catch(e => null)
            ]);

            if (clusterResponse && clusterResponse.success) {
                this.app.currentCollectionCluster = clusterResponse.data;
            }

            if (contentResponse && contentResponse.success) {
                this.app.currentCollectionContentClusters = contentResponse.data;
                console.log('Content-based clusters loaded:', contentResponse.data);
            }
        } catch (error) {
            console.warn('Failed to load collection clusters:', error);
            // Don't show error notification as this is optional functionality
        }
    }

    showCollectionDetail() {
        this.app.showView('collectionDetail');
        
        // Update collection info
        document.getElementById('collectionDetailTitle').textContent = this.app.currentCollection.name;
        document.getElementById('chatCollectionName').textContent = this.app.currentCollection.name;
        
        document.getElementById('collectionDocuments').textContent = this.app.currentCollection.documentsCount || this.app.currentCollection.document_count || 0;
        document.getElementById('collectionChunks').textContent = this.app.currentCollection.chunksCount || 0;
        
        if (this.app.currentCollection.stats) {
            document.getElementById('collectionSize').textContent = this.app.formatBytes(this.app.currentCollection.stats.totalContentSize || this.app.currentCollection.stats.total_content_size || 0);
            document.getElementById('collectionUpdated').textContent = new Date(this.app.currentCollection.stats.lastUpdated || this.app.currentCollection.stats.last_updated || this.app.currentCollection.updatedAt || this.app.currentCollection.updated_at).toLocaleDateString();
        } else {
            document.getElementById('collectionSize').textContent = '0 Bytes';
            document.getElementById('collectionUpdated').textContent = new Date(this.app.currentCollection.updatedAt || this.app.currentCollection.updated_at).toLocaleDateString();
        }

        // Display cluster information if available
        this.displayClusterInfo();
        
        // Show initial tab - now defaults to chat
        this.showCollectionTab('chat');
    }

    displayClusterInfo() {
        const clusterInfoContainer = document.getElementById('collectionClusterInfo');
        if (!clusterInfoContainer) {
            // If cluster info container doesn't exist, create it
            this.createClusterInfoContainer();
            return;
        }

        let content = '';

        // Display main cluster if available
        if (this.app.currentCollectionCluster) {
            const cluster = this.app.currentCollectionCluster;
            const isAutoGenerated = cluster.settings && cluster.settings.auto_generated;
            const isContentBased = cluster.settings && cluster.settings.content_based;
            
            content += `
                <div class="card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">
                            <i class="fas fa-layer-group me-2"></i>Main Cluster
                        </h6>
                        <div>
                            ${isContentBased ? '<span class="badge bg-success me-1">Content-Based</span>' : ''}
                            ${isAutoGenerated ? '<span class="badge bg-info">Auto-generated</span>' : '<span class="badge bg-primary">Manual</span>'}
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-8">
                                <h6 class="card-title">${cluster.name}</h6>
                                <p class="card-text text-muted small">${cluster.description || 'No description'}</p>
                                <div class="d-flex gap-3 text-muted small">
                                    <span><i class="fas fa-cubes me-1"></i>${cluster.cluster_type}</span>
                                    <span><i class="fas fa-folder me-1"></i>${cluster.collections ? cluster.collections.length : 1} collection(s)</span>
                                </div>
                            </div>
                            <div class="col-md-4 text-end">
                                <button class="btn btn-sm btn-outline-primary" onclick="app.clusters.viewCluster(${cluster.id})">
                                    <i class="fas fa-eye me-1"></i>View Cluster
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Display content-based topic clusters if available
        if (this.app.currentCollectionContentClusters && this.app.currentCollectionContentClusters.clusters) {
            const contentClusters = this.app.currentCollectionContentClusters.clusters;
            
            if (contentClusters.length > 0) {
                content += `
                    <div class="card mb-3">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-brain me-2"></i>Content Topics 
                                <span class="badge bg-secondary ms-2">${contentClusters.length} topics found</span>
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                `;

                contentClusters.forEach((topicCluster, index) => {
                    const cohesionPercentage = Math.round(topicCluster.stats.cohesion * 100);
                    content += `
                        <div class="col-md-6 mb-3">
                            <div class="card border-left-primary">
                                <div class="card-body p-3">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h6 class="card-title mb-1">${topicCluster.name}</h6>
                                        <span class="badge bg-primary">${topicCluster.size} docs</span>
                                    </div>
                                    <p class="card-text text-muted small mb-2">${topicCluster.description}</p>
                                    <div class="d-flex justify-content-between text-muted small">
                                        <span><i class="fas fa-chart-line me-1"></i>Cohesion: ${cohesionPercentage}%</span>
                                        <button class="btn btn-xs btn-outline-info" onclick="app.collections.showTopicDetails(${index})">
                                            <i class="fas fa-info-circle"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                content += `
                            </div>
                            <div class="mt-3 text-center">
                                <small class="text-muted">
                                    <i class="fas fa-info-circle me-1"></i>
                                    Topics discovered using vector similarity analysis
                                </small>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Show default message if no clusters
        if (!content) {
            content = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    This collection is not part of any cluster yet. Add some documents to enable topic analysis.
                </div>
            `;
        }

        clusterInfoContainer.innerHTML = content;
    }

    showTopicDetails(topicIndex) {
        if (!this.app.currentCollectionContentClusters || !this.app.currentCollectionContentClusters.clusters[topicIndex]) {
            return;
        }

        const topic = this.app.currentCollectionContentClusters.clusters[topicIndex];
        
        // Create modal to show topic details
        const modalContent = `
            <div class="modal fade" id="topicDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-brain me-2"></i>${topic.name}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <h3 class="text-primary">${topic.size}</h3>
                                        <small class="text-muted">Documents</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <h3 class="text-success">${Math.round(topic.stats.cohesion * 100)}%</h3>
                                        <small class="text-muted">Cohesion</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <h3 class="text-info">${topic.stats.avgDistanceFromCentroid.toFixed(2)}</h3>
                                        <small class="text-muted">Avg Distance</small>
                                    </div>
                                </div>
                            </div>
                            
                            <h6><i class="fas fa-file-alt me-2"></i>Documents in this Topic:</h6>
                            <div class="list-group">
                                ${topic.documents.map(doc => `
                                    <div class="list-group-item">
                                        <div class="d-flex w-100 justify-content-between">
                                            <h6 class="mb-1">${doc.filename}</h6>
                                        </div>
                                        <p class="mb-1 small text-muted">${doc.content_preview}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('topicDetailModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to DOM and show
        document.body.insertAdjacentHTML('beforeend', modalContent);
        const modal = new bootstrap.Modal(document.getElementById('topicDetailModal'));
        modal.show();

        // Clean up modal when hidden
        document.getElementById('topicDetailModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    createClusterInfoContainer() {
        // Find the collection detail view and add the cluster info container
        const collectionDetailView = document.getElementById('collectionDetailView');
        if (collectionDetailView) {
            const collectionHeader = collectionDetailView.querySelector('.d-flex.justify-content-between.align-items-center');
            if (collectionHeader) {
                const clusterInfoContainer = document.createElement('div');
                clusterInfoContainer.id = 'collectionClusterInfo';
                clusterInfoContainer.className = 'mt-3';
                
                // Insert after the header
                collectionHeader.parentNode.insertBefore(clusterInfoContainer, collectionHeader.nextSibling);
                
                // Now display the cluster info
                this.displayClusterInfo();
            }
        }
    }

    showCollectionTab(tabName) {
        // Hide all tabs
        document.getElementById('chatTab').classList.add('hidden');
        document.getElementById('searchTab').classList.add('hidden');
        document.getElementById('smartContextTab').classList.add('hidden');
        document.getElementById('documentsTab').classList.add('hidden');
        
        // Remove active class from all nav links
        document.querySelectorAll('.nav-tabs .nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Show selected tab and mark nav link as active
        if (tabName === 'chat') {
            document.getElementById('chatTab').classList.remove('hidden');
            document.querySelector('a[onclick="app.collections.showCollectionTab(\'chat\')"]').classList.add('active');
        } else if (tabName === 'search') {
            document.getElementById('searchTab').classList.remove('hidden');
            document.querySelector('a[onclick="app.collections.showCollectionTab(\'search\')"]').classList.add('active');
        } else if (tabName === 'smart-context') {
            document.getElementById('smartContextTab').classList.remove('hidden');
            document.querySelector('a[onclick="app.collections.showCollectionTab(\'smart-context\')"]').classList.add('active');
            // Load smart context capabilities when switching to smart context tab
            this.loadSmartContextCapabilities();
        } else if (tabName === 'documents') {
            document.getElementById('documentsTab').classList.remove('hidden');
            document.querySelector('a[onclick="app.collections.showCollectionTab(\'documents\')"]').classList.add('active');
            // Load documents when switching to documents tab
            if (this.app.documents) {
                this.app.documents.loadCollectionDocuments();
            }
        }
    }

    showCreateCollection() {
        const modal = new bootstrap.Modal(document.getElementById('createCollectionModal'));
        modal.show();
    }

    async createCollection() {
        try {
            const form = document.getElementById('createCollectionForm');
            const formData = new FormData(form);
            
            const collectionData = {
                name: formData.get('name'),
                description: formData.get('description')
            };

            const response = await this.app.api.createCollection(collectionData);
            if (response.success) {
                this.app.ui.showNotification('Collection created successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('createCollectionModal'));
                modal.hide();
                form.reset();
                
                // Refresh collections view
                this.loadCollections();
                
                // Also refresh dashboard counters
                this.loadDashboard();
                
                // Refresh any open cluster views or modals that might show collections
                this.notifyCollectionsChanged();
            }
        } catch (error) {
            console.error('Error creating collection:', error);
            this.app.ui.showNotification('Failed to create collection', 'error');
        }
    }

    /**
     * Notify other modules that collections have changed
     */
    notifyCollectionsChanged() {
        // Refresh clusters module if it exists
        if (this.app.clusters) {
            // Reload clusters data which includes collection counts
            this.app.clusters.loadClusters();
        }
        
        // Emit a custom event that other modules can listen to
        window.dispatchEvent(new CustomEvent('collectionsChanged', {
            detail: { source: 'collections-module' }
        }));
    }

    async deleteCurrentCollection() {
        if (!this.app.currentCollection) return;
        
        const confirmed = confirm(`Are you sure you want to delete "${this.app.currentCollection.name}" and all its documents?`);
        if (!confirmed) return;
        
        try {
            console.log(`🗑️ Deleting collection ${this.app.currentCollection.id}`);
            
            const response = await this.app.api.deleteCollection(this.app.currentCollection.id);
            
            if (response && response.success) {
                this.app.showNotification('Collection deleted successfully!', 'success');
                this.showCollections();
            } else {
                this.app.showNotification(response?.message || 'Failed to delete collection', 'error');
            }
        } catch (error) {
            console.error('Delete collection error:', error);
            this.app.showNotification('Failed to delete collection', 'error');
        }
    }

    showDeveloperIntegration() {
        if (!this.app.currentCollection) return;
        
        const modal = new bootstrap.Modal(document.getElementById('developerModal'));
        
        // Update modal title with collection name
        document.getElementById('devModalCollectionName').textContent = this.app.currentCollection.name;
        
        // Get base URL
        const baseUrl = window.location.origin;
        const collectionId = this.app.currentCollection.id;
        // Use the correct working endpoint from uploadRoutes.js
        const uploadEndpoint = `${baseUrl}/api/upload/${collectionId}`;
        const chatEndpoint = `${baseUrl}/api/collections/${collectionId}/ask`;
        
        // Update API information
        document.getElementById('apiEndpoint').textContent = uploadEndpoint;
        document.getElementById('chatEndpoint').textContent = chatEndpoint;
        document.getElementById('collectionId').textContent = collectionId;
        
        // Update token status
        const actualToken = this.app.token || localStorage.getItem(`${this.app.config.storagePrefix}token`);
        const tokenStatusElement = document.getElementById('tokenStatusText');
        
        if (actualToken) {
            tokenStatusElement.innerHTML = `<span class="text-success">✓ Your authentication token is included in all code examples below</span>`;
            document.getElementById('tokenStatus').className = 'alert alert-success d-flex align-items-center';
        } else {
            tokenStatusElement.innerHTML = `<span class="text-warning">⚠ No token found - you may need to log in again to get updated examples</span>`;
            document.getElementById('tokenStatus').className = 'alert alert-warning d-flex align-items-center';
        }
        
        // Generate code examples
        this.generateCodeExamples(baseUrl, collectionId, this.app.currentCollection.name);
        
        modal.show();
    }

    generateCodeExamples(baseUrl, collectionId, collectionName) {
        // Use the correct working endpoint from uploadRoutes.js
        const endpoint = `${baseUrl}/api/upload/${collectionId}`;
        const chatEndpoint = `${baseUrl}/api/collections/${collectionId}/ask`;
        
        // Get actual JWT token from localStorage
        const actualToken = this.app.token || localStorage.getItem(`${this.app.config.storagePrefix}token`);
        const token = actualToken || 'YOUR_JWT_TOKEN_HERE';
        
        // cURL Example - Simple file upload only
        const curlCode = `# Upload a file to the "${collectionName}" collection
curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@/path/to/your/document.pdf"

# Upload multiple files (one at a time)
curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document1.pdf"

curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document2.docx"

curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document3.txt"

# Ask AI questions about uploaded documents
curl -X POST "${chatEndpoint}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "question": "What are the main topics in these documents?",
    "maxResults": 5,
    "systemPrompt": "You are a helpful document analyst. Provide concise summaries."
  }'`;
        
        // Node.js Fetch Example - Simplified to only send file
        const fetchCode = `const fs = require('fs');
const FormData = require('form-data');

// Upload files - Simple implementation
async function uploadFile(filePath) {
  const form = new FormData();
  const fileStream = fs.createReadStream(filePath);
  
  form.append('file', fileStream);
  
  const response = await fetch('${endpoint}', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ${token}',
      ...form.getHeaders()
    },
    body: form
  });
  
  const result = await response.json();
  console.log('Upload result:', result);
  return result;
}

// Ask AI questions
async function askQuestion(question, options = {}) {
  const response = await fetch('${chatEndpoint}', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ${token}',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      question,
      maxResults: options.maxResults || 5,
      systemPrompt: options.systemPrompt || 'You are a helpful assistant.'
    })
  });
  
  const result = await response.json();
  console.log('AI Response:', result.data?.answer);
  console.log('Sources:', result.data?.sources);
  return result;
}

// Batch upload and analyze
async function uploadAndAnalyze(filePaths, questions) {
  console.log('Starting batch upload...');
  
  // Upload all files
  for (const filePath of filePaths) {
    console.log(\`Uploading: \${filePath}\`);
    await uploadFile(filePath);
    
    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Wait for processing
  console.log('Waiting for document processing...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Ask questions
  console.log('Starting AI analysis...');
  const results = [];
  
  for (const question of questions) {
    const result = await askQuestion(question);
    results.push({
      question,
      answer: result.data?.answer,
      sources: result.data?.sources
    });
    console.log(\`Q: \${question}\`);
    console.log(\`A: \${result.data?.answer}\`);
    console.log('---');
  }
  
  return results;
}

// Usage examples
async function main() {
  // Single file upload
  await uploadFile('./document.pdf');
  
  // Wait and ask question
  await new Promise(resolve => setTimeout(resolve, 2000));
  await askQuestion('What is the main topic of this document?');
  
  // Batch processing
  const files = ['./doc1.pdf', './doc2.docx', './doc3.txt'];
  const questions = [
    'What are the main topics covered?',
    'Summarize the key findings',
    'What are the action items?'
  ];
  
  const results = await uploadAndAnalyze(files, questions);
  console.log('Analysis complete:', results);
}

main().catch(console.error);`;
        
        // Axios Example - Simplified
        const axiosCode = `const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Configure axios with default headers
const apiClient = axios.create({
  headers: {
    'Authorization': 'Bearer ${token}'
  }
});

// Upload files - Simple implementation
async function uploadFile(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  try {
    const response = await apiClient.post('${endpoint}', form, {
      headers: form.getHeaders()
    });
    console.log('Upload successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
    throw error;
  }
}

// Ask AI questions
async function askQuestion(question, options = {}) {
  try {
    const response = await apiClient.post('${chatEndpoint}', {
      question,
      maxResults: options.maxResults || 5,
      systemPrompt: options.systemPrompt 
    });
    const result = response.data;
    console.log('AI Answer:', result.data?.answer);
    return result;
  } catch (error) {
    console.error('AI question failed:', error.response?.data || error.message);
    throw error;
  }
}

// Batch upload with progress tracking
async function batchUpload(filePaths) {
  console.log(\`Starting upload of \${filePaths.length} files...\`);
  
  const results = [];
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    console.log(\`[\${i + 1}/\${filePaths.length}] Uploading: \${filePath}\`);
    
    try {
      const result = await uploadFile(filePath);
      results.push({ file: filePath, success: true, data: result });
    } catch (error) {
      results.push({ file: filePath, success: false, error: error.message });
    }
    
    // Rate limiting - wait between uploads
    if (i < filePaths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('Upload completed:', results);
  return results;
}

// Usage
const filesToUpload = ['./document1.pdf', './document2.docx'];
batchUpload(filesToUpload)
  .then(() => askQuestion('What are the main topics in these documents?'))
  .catch(console.error);`;
        
        // Python Example - Simplified
        const pythonCode = `import requests
import json
import time
import os

class VSIVectorStore:
    def __init__(self, token='${token}'):
        self.base_url = '${baseUrl}'
        self.collection_id = '${collectionId}'
        self.headers = {
            'Authorization': f'Bearer {token}'
        }
    
    def upload_file(self, file_path):
        """Upload a file to the collection - Simple implementation."""
        url = f'{self.base_url}/api/upload/{self.collection_id}'
        
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            return None
        
        with open(file_path, 'rb') as file:
            files = {'file': file}
            response = requests.post(url, headers=self.headers, files=files)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Upload successful: {result.get('message', 'File uploaded')}");
            return result;
        else:
            print(f"❌ Upload failed: {response.status_code} - {response.text}");
            return None;
    
    def ask_question(self, question, max_results=5, system_prompt=None):
        """Ask an AI question about the uploaded documents."""
        url = f'{self.base_url}/api/collections/${this.collection_id}/ask'
        
        payload = {
            'question': question,
            'maxResults': max_results
        };
        
        if system_prompt:
            payload['systemPrompt'] = system_prompt;
        
        headers = {**self.headers, 'Content-Type': 'application/json'};
        response = requests.post(url, headers=headers, json=payload);
        
        if response.status_code == 200:
            result = response.json();
            if result.get('success'):
                return result['data'];
            else:
                print(f"AI request failed: {result.get('message', 'Unknown error')}");
                return None;
        else:
            print(f"AI request failed: {response.status_code} - {response.text}");
            return None;
    
    def batch_upload(self, file_paths):
        """Upload multiple files with progress tracking."""
        print(f"📁 Starting batch upload of {len(file_paths)} files...");
        
        results = [];
        for i, file_path in enumerate(file_paths, 1) {
            print(f"[{i}/{len(file_paths)}] Uploading: {os.path.basename(file_path)}");
            result = self.upload_file(file_path);
            
            if result:
                results.append({'file': file_path, 'success': True, 'data': result});
            else {
                results.append({'file': file_path, 'success': False});
            }
            
            # Rate limiting between uploads
            if i < len(file_paths):
                time.sleep(1);
        };
        
        successful = sum(1 for r in results if r['success']);
        print(f"✅ Batch upload complete: {successful}/{len(file_paths)} files uploaded");
        return results;
    
    def upload_and_analyze(self, file_paths, questions):
        """Complete workflow: upload files and analyze with AI."""
        print("🚀 Starting upload and analysis workflow...");
        
        # Upload files
        upload_results = self.batch_upload(file_paths);
        
        # Check if any uploads succeeded
        successful_uploads = [r for r in upload_results if r['success']];
        if not successful_uploads:
            print("❌ No files uploaded successfully. Aborting analysis.");
            return None;
        
        # Wait for processing
        print("⏳ Waiting for document processing...");
        time.sleep(5);
        
        # Ask questions
        print("🤖 Starting AI analysis...");
        analysis_results = [];
        
        for question in questions {
            print(f"\\n❓ Q: {question}");
            answer_data = self.ask_question(question);
            
            if answer_data {
                answer = answer_data.get('answer', 'No answer');
                sources = answer_data.get('sources', []);
                print(f"✅ A: {answer}");
                print(f"📚 Sources: {len(sources)} documents referenced");
                
                analysis_results.append({
                    'question': question,
                    'answer': answer,
                    'sources': sources
                });
            } else {
                print("❌ Failed to get AI response");
                analysis_results.append({
                    'question': question,
                    'answer': None,
                    'sources': []
                });
            }
            
            print("-" * 50);
        }
        
        return {
            'uploads': upload_results,
            'analysis': analysis_results
        };
    }

# Usage examples
if __name__ == "__main__":
    # Initialize the client
    vsi = VSIVectorStore();
    
    # Example 1: Simple upload and question
    print("=== Example 1: Simple Upload ===");
    result = vsi.upload_file('./document.pdf');
    if result:
        time.sleep(2);  # Wait for processing
        answer_data = vsi.ask_question('What is the main topic of this document?');
        if answer_data:
            print(f"Answer: {answer_data.get('answer')}");
    
    # Example 2: Batch analysis
    print("\\n=== Example 2: Batch Analysis ===");
    files_to_upload = [
        './research_paper.pdf',
        './meeting_notes.docx',
        './project_plan.txt'
    ];
    
    analysis_questions = [
        'What are the main objectives mentioned across all documents?',
        'Are there any deadlines or important dates mentioned?',
        'What are the key risks or challenges identified?',
        'Summarize the main action items and next steps'
    ];
    
    # Only proceed if files exist
    existing_files = [f for f in files_to_upload if os.path.exists(f)];
    if existing_files:
        results = vsi.upload_and_analyze(existing_files, analysis_questions);
        
        # Save results
        if results:
            with open('analysis_results.json', 'w') as f:
                json.dump(results, f, indent=2);
            print("\\n💾 Analysis complete! Results saved to analysis_results.json");
    else {
        print("ℹ️ No files found for batch upload example");
    }`;

        // Update DOM elements
        document.getElementById('curlCode').textContent = curlCode;
        document.getElementById('fetchCode').textContent = fetchCode;
        document.getElementById('axiosCode').textContent = axiosCode;
        document.getElementById('pythonCode').textContent = pythonCode;
    }

    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.textContent;
        
        navigator.clipboard.writeText(text).then(() => {
            this.app.showNotification('Copied to clipboard!', 'success');
        }).catch(() => {
            this.app.showNotification('Failed to copy to clipboard', 'error');
        });
    }

    copyCodeExample(codeElementId) {
        const codeElement = document.getElementById(codeElementId);
        const code = codeElement.textContent;
        
        navigator.clipboard.writeText(code).then(() => {
            this.app.showNotification('Code copied to clipboard!', 'success');
        }).catch(() => {
            this.app.showNotification('Failed to copy code', 'error');
        });
    }

    showBookmarklet() {
        if (!this.app.currentCollection) return;
        
        const modal = new bootstrap.Modal(document.getElementById('bookmarkletModal'));
        
        // Update modal with collection info
        document.getElementById('bookmarkletCollectionName').textContent = this.app.currentCollection.name;
        document.getElementById('bookmarkletLinkText').textContent = this.app.currentCollection.name;
        
        // Generate the bookmarklet
        this.generateBookmarklet();
        
        modal.show();
    }

    generateBookmarklet() {
        const baseUrl = window.location.origin;
        const collectionId = this.app.currentCollection.id;
        const collectionName = this.app.currentCollection.name;
        const uploadEndpoint = `${baseUrl}/api/upload/${collectionId}`;
        const token = this.app.token || localStorage.getItem(`${this.app.config.storagePrefix}token`);
        
        if (!token) {
            this.app.showNotification('No authentication token found. Please log in again.', 'error');
            return;
        }

        // Create the bookmarklet JavaScript code
        const bookmarkletCode = `
(function() {
    const UPLOAD_URL = '${uploadEndpoint}';
    const AUTH_TOKEN = '${token}';
    const COLLECTION_NAME = '${collectionName}';
    
    function showStatus(message, isError = false) {
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = \`
            position: fixed; top: 20px; right: 20px; z-index: 999999;
            background: \${isError ? '#dc3545' : '#28a745'}; color: white;
            padding: 12px 20px; border-radius: 6px; font-family: Arial, sans-serif;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 350px; line-height: 1.4;
        \`;
        statusDiv.textContent = message;
        document.body.appendChild(statusDiv);
        
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.remove();
            }
        }, 5000);
    }
    
    async function uploadFile(formData, filename) {
        try {
            const response = await fetch(UPLOAD_URL, {
                method: 'POST',
                headers: {
                    'Authorization': \`Bearer \${AUTH_TOKEN}\`
                },
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(\`Upload failed: \${response.status} \${response.statusText}\`);
            }
            
            // Handle Server-Sent Events response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\\n');
                buffer = lines.pop(); // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'complete') {
                                showStatus(\`✅ \${filename} uploaded to "\${COLLECTION_NAME}" successfully!\`);
                                return;
                            } else if (data.type === 'error') {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            // Ignore JSON parse errors for partial data
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            showStatus(\`❌ Upload failed: \${error.message}\`, true);
        }
    }
    
    async function uploadText(text, title, url) {
        const blob = new Blob([text], { type: 'text/plain' });
        const formData = new FormData();
        const filename = \`\${title || 'Selected Text'}_\${new Date().toISOString().slice(0,10)}.txt\`;
        formData.append('file', blob, filename);
        
        showStatus(\`📄 Uploading selected text to "\${COLLECTION_NAME}"...\`);
        await uploadFile(formData, 'Selected text');
    }
    
    async function takeScreenshot() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error('Screenshot API not supported in this browser');
            }
            
            showStatus('📸 Starting screen capture...', false);
            
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' }
            });
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();
            
            video.addEventListener('loadedmetadata', () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                
                // Stop the stream
                stream.getTracks().forEach(track => track.stop());
                
                // Convert to blob and upload
                canvas.toBlob(async (blob) => {
                    const formData = new FormData();
                    const filename = \`screenshot_\${new Date().toISOString().slice(0,19).replace(/[:.]/g, '-')}.png\`;
                    formData.append('file', blob, filename);
                    
                    showStatus(\`📸 Uploading screenshot to "\${COLLECTION_NAME}"...\`);
                    await uploadFile(formData, 'Screenshot');
                }, 'image/png');
            });
            
        } catch (error) {
            console.error('Screenshot error:', error);
            if (error.name === 'NotAllowedError') {
                showStatus('❌ Screen capture permission denied', true);
            } else {
                showStatus(\`❌ Screenshot failed: \${error.message}\`, true);
            }
        }
    }
    
    // Main logic
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText) {
        // Upload selected text
        const pageTitle = document.title || 'Untitled Page';
        const pageUrl = window.location.href;
        const content = \`Title: \${pageTitle}\\nURL: \${pageUrl}\\n\\n\${selectedText}\`;
        
        uploadText(content, pageTitle, pageUrl);
    } else {
        // Take screenshot
        takeScreenshot();
    }
})();`.trim();

        // Create the bookmarklet URL
        const bookmarkletUrl = 'javascript:' + encodeURIComponent(bookmarkletCode);
        
        // Update the UI elements
        document.getElementById('bookmarkletLink').href = bookmarkletUrl;
        document.getElementById('bookmarkletCode').value = bookmarkletCode;
    }

    copyBookmarkletCode() {
        const codeElement = document.getElementById('bookmarkletCode');
        const code = codeElement.value;
        
        navigator.clipboard.writeText(code).then(() => {
            this.app.showNotification('Bookmarklet code copied to clipboard!', 'success');
        }).catch(() => {
            this.app.showNotification('Failed to copy bookmarklet code', 'error');
        });
    }

    // Smart Context Methods
    async loadSmartContextCapabilities() {
        if (!this.app.currentCollection) return;

        try {
            const response = await this.app.api.getSmartContextCapabilities(this.app.currentCollection.id);
            if (response && response.success) {
                this.renderSmartContextCapabilities(response.capabilities);
            }
        } catch (error) {
            console.error('Failed to load smart context capabilities:', error);
            document.getElementById('smartContextCapabilities').innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p class="mt-2 mb-0">Failed to load capabilities</p>
                </div>
            `;
        }
    }

    renderSmartContextCapabilities(capabilities) {
        const container = document.getElementById('smartContextCapabilities');
        
        const clusterInfo = capabilities.clusterInfo;
        const stats = capabilities.statistics;
        const features = capabilities.features;
        
        container.innerHTML = `
            <div class="mb-3">
                <h6 class="text-primary">${capabilities.collectionName}</h6>
                <small class="text-muted">${stats.document_count || 0} documents</small>
            </div>
            
            ${clusterInfo ? `
                <div class="mb-3 p-2 bg-light rounded">
                    <small class="fw-bold text-success">
                        <i class="fas fa-layer-group me-1"></i>
                        Cluster: ${clusterInfo.clusterName}
                    </small>
                    ${clusterInfo.clusterDescription ? `
                        <br><small class="text-muted">${clusterInfo.clusterDescription}</small>
                    ` : ''}
                    ${clusterInfo.relatedClustersCount > 0 ? `
                        <br><small class="text-info">+${clusterInfo.relatedClustersCount} related clusters</small>
                    ` : ''}
                </div>
            ` : `
                <div class="mb-3 p-2 bg-warning bg-opacity-10 rounded">
                    <small class="text-warning">
                        <i class="fas fa-info-circle me-1"></i>
                        No cluster assigned
                    </small>
                </div>
            `}
            
            <div class="mb-3">
                <h6>Features</h6>
                <div class="list-group list-group-flush">
                    <div class="list-group-item d-flex justify-content-between align-items-center p-1">
                        <small>Semantic Search</small>
                        <span class="badge bg-success rounded-pill">✓</span>
                    </div>
                    <div class="list-group-item d-flex justify-content-between align-items-center p-1">
                        <small>Cluster-Aware Scoring</small>
                        <span class="badge ${features.clusterAwareScoring ? 'bg-success' : 'bg-secondary'} rounded-pill">
                            ${features.clusterAwareScoring ? '✓' : '✗'}
                        </span>
                    </div>
                    <div class="list-group-item d-flex justify-content-between align-items-center p-1">
                        <small>Cross-Cluster Support</small>
                        <span class="badge ${features.crossClusterSupport ? 'bg-success' : 'bg-secondary'} rounded-pill">
                            ${features.crossClusterSupport ? '✓' : '✗'}
                        </span>
                    </div>
                    <div class="list-group-item d-flex justify-content-between align-items-center p-1">
                        <small>Diversity Optimization</small>
                        <span class="badge bg-success rounded-pill">✓</span>
                    </div>
                </div>
            </div>
            
            <div class="mb-3">
                <h6>Recommended Settings</h6>
                <small class="text-muted">
                    Context Size: ${capabilities.recommendedSettings.maxContextSize.toLocaleString()}<br>
                    Max Chunks: ${capabilities.recommendedSettings.maxChunks}<br>
                    Diversity: ${capabilities.recommendedSettings.diversityWeight}
                </small>
            </div>
        `;
    }

    async previewSmartContext() {
        if (!this.app.currentCollection) return;

        const query = document.getElementById('smartContextQuery').value.trim();
        if (!query) {
            this.app.showNotification('Please enter a search query first', 'warning');
            return;
        }

        const maxContextSize = parseInt(document.getElementById('smartContextMaxSize').value);
        const maxChunks = parseInt(document.getElementById('smartContextMaxChunks').value);

        try {
            document.getElementById('smartContextPreviewCard').style.display = 'block';
            document.getElementById('smartContextPreview').innerHTML = `
                <div class="text-center">
                    <div class="spinner-border spinner-border-sm" role="status"></div>
                    <p class="mt-2 mb-0 text-muted">Generating preview...</p>
                </div>
            `;

            const response = await this.app.api.previewSmartContext(this.app.currentCollection.id, {
                query,
                maxContextSize,
                maxChunks
            });

            if (response && response.success) {
                this.renderSmartContextPreview(response.preview);
            }
        } catch (error) {
            console.error('Preview failed:', error);
            document.getElementById('smartContextPreview').innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p class="mt-2 mb-0">Preview failed</p>
                </div>
            `;
        }
    }

    renderSmartContextPreview(preview) {
        document.getElementById('smartContextPreview').innerHTML = `
            <div class="mb-3">
                <h6 class="text-primary">Preview Results</h6>
                <small class="text-muted">Collection: ${preview.collectionName}</small>
            </div>
            
            ${preview.clusterInfo ? `
                <div class="mb-3 p-2 bg-light rounded">
                    <small class="fw-bold">Cluster: ${preview.clusterInfo.clusterName}</small>
                    ${preview.clusterInfo.hasRelatedClusters ? '<br><small class="text-info">Has related clusters</small>' : ''}
                </div>
            ` : ''}
            
            <div class="mb-3">
                <div class="row text-center">
                    <div class="col-6">
                        <div class="border rounded p-2">
                            <h6 class="text-primary mb-0">${preview.estimatedChunks}</h6>
                            <small class="text-muted">Chunks Found</small>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="border rounded p-2">
                            <h6 class="text-success mb-0">${preview.estimatedContextSize.toLocaleString()}</h6>
                            <small class="text-muted">Characters</small>
                        </div>
                    </div>
                </div>
            </div>
            
            ${preview.topResults && preview.topResults.length > 0 ? `
                <div>
                    <h6>Top Results</h6>
                    ${preview.topResults.map(result => `
                        <div class="border-start border-3 border-primary ps-2 mb-2">
                            <small class="fw-bold">${result.filename}</small>
                            <small class="text-success ms-2">${result.similarity}%</small>
                            <br><small class="text-muted">${result.preview}</small>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    }

    async generateSmartContext() {
        if (!this.app.currentCollection) return;

        const query = document.getElementById('smartContextQuery').value.trim();
        if (!query) {
            this.app.showNotification('Please enter a search query first', 'warning');
            return;
        }

        const options = {
            query,
            maxContextSize: parseInt(document.getElementById('smartContextMaxSize').value),
            maxChunks: parseInt(document.getElementById('smartContextMaxChunks').value),
            diversityWeight: parseFloat(document.getElementById('smartContextDiversity').value),
            clusterContextWeight: parseFloat(document.getElementById('smartContextClusterWeight').value),
            includeClusterMetadata: document.getElementById('smartContextIncludeMetadata').checked
        };

        try {
            // Show loading state
            document.getElementById('smartContextResultsPanel').style.display = 'block';
            document.getElementById('smartContextResult').innerHTML = 'Generating smart context...';
            document.getElementById('smartContextStats').innerHTML = '';

            const response = await this.app.api.createSmartContext(this.app.currentCollection.id, options);

            if (response && response.success) {
                this.renderSmartContextResult(response);
                document.getElementById('smartContextAnalysisPanel').style.display = 'block';
                this.renderSmartContextAnalysis(response.metadata);
            }
        } catch (error) {
            console.error('Smart context generation failed:', error);
            document.getElementById('smartContextResult').innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <p>Failed to generate smart context</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    renderSmartContextResult(response) {
        const { context, metadata } = response;
        const stats = metadata.stats;

        // Update stats
        document.getElementById('smartContextStats').innerHTML = `
            <div class="row text-center">
                <div class="col-3">
                    <div class="border rounded p-2">
                        <h6 class="text-primary mb-0">${stats.totalChunks}</h6>
                        <small class="text-muted">Chunks</small>
                    </div>
                </div>
                <div class="col-3">
                    <div class="border rounded p-2">
                        <h6 class="text-success mb-0">${stats.contextSize.toLocaleString()}</h6>
                        <small class="text-muted">Characters</small>
                    </div>
                </div>
                <div class="col-3">
                    <div class="border rounded p-2">
                        <h6 class="text-info mb-0">${stats.clustersRepresented.length}</h6>
                        <small class="text-muted">Clusters</small>
                    </div>
                </div>
                <div class="col-3">
                    <div class="border rounded p-2">
                        <h6 class="text-warning mb-0">${(stats.averageRelevance * 100).toFixed(1)}%</h6>
                        <small class="text-muted">Avg Relevance</small>
                    </div>
                </div>
            </div>
        `;

        // Update context display
        document.getElementById('smartContextResult').innerHTML = context;
    }

    renderSmartContextAnalysis(metadata) {
        const { chunks, stats } = metadata;

        document.getElementById('smartContextChunksAnalysis').innerHTML = `
            <div class="mb-3">
                <h6>Chunk Analysis</h6>
                <p class="text-muted">Diversity Score: ${(stats.diversityScore * 100).toFixed(1)}%</p>
            </div>
            
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Document</th>
                            <th>Cluster</th>
                            <th>Relevance</th>
                            <th>Cluster Score</th>
                            <th>Final Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${chunks.map(chunk => `
                            <tr>
                                <td>
                                    <small class="fw-bold">${chunk.filename || 'Unknown'}</small>
                                    <br><small class="text-muted">${chunk.preview}</small>
                                </td>
                                <td>
                                    ${chunk.clusterName ? `
                                        <span class="badge bg-secondary">${chunk.clusterName}</span>
                                    ` : '<small class="text-muted">No cluster</small>'}
                                </td>
                                <td>
                                    <div class="progress" style="height: 8px;">
                                        <div class="progress-bar bg-primary" style="width: ${chunk.similarity * 100}%"></div>
                                    </div>
                                    <small>${(chunk.similarity * 100).toFixed(1)}%</small>
                                </td>
                                <td>
                                    <div class="progress" style="height: 8px;">
                                        <div class="progress-bar bg-info" style="width: ${chunk.clusterScore * 100}%"></div>
                                    </div>
                                    <small>${(chunk.clusterScore * 100).toFixed(1)}%</small>
                                </td>
                                <td>
                                    <div class="progress" style="height: 8px;">
                                        <div class="progress-bar bg-success" style="width: ${chunk.finalScore * 100}%"></div>
                                    </div>
                                    <small>${(chunk.finalScore * 100).toFixed(1)}%</small>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async copyContextToClipboard() {
        const contextElement = document.getElementById('smartContextResult');
        const context = contextElement.textContent;

        try {
            await navigator.clipboard.writeText(context);
            this.app.showNotification('Context copied to clipboard!', 'success');
        } catch (error) {
            this.app.showNotification('Failed to copy context', 'error');
        }
    }

    downloadContext() {
        const contextElement = document.getElementById('smartContextResult');
        const context = contextElement.textContent;
        const query = document.getElementById('smartContextQuery').value.trim();
        
        const blob = new Blob([context], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-context-${query.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.app.showNotification('Context downloaded!', 'success');
    }
}
