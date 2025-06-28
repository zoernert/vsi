/**
 * VSI Search Module
 * Handles global search, collection search, and similarity operations
 */
class VSISearchModule {
    constructor(app) {
        this.app = app;
        this.bindEvents();
    }

    bindEvents() {
        // Collection search
        document.getElementById('collectionSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performCollectionSearch();
            }
        });
    }

    showSearch() {
        this.app.showView('search');
    }

    async performQuickSearch() {
        const query = document.getElementById('quickSearch').value.trim();
        if (!query) return;

        this.showSearch();
        document.getElementById('globalSearchInput').value = query;
        await this.performGlobalSearch();
    }

    async performGlobalSearch() {
        const query = document.getElementById('globalSearchInput').value.trim();
        if (!query) return;

        try {
            const response = await this.app.api.globalSearch(query, 20);
            if (response && response.success) {
                this.renderSearchResults(response.data);
            }
        } catch (error) {
            this.app.showNotification('Search failed', 'error');
        }
    }

    renderSearchResults(results) {
        const container = document.getElementById('searchResults');
        
        // Handle the response structure according to OpenAPI spec
        let searchResults = [];
        if (results && results.success && results.data && results.data.results) {
            searchResults = results.data.results;
        } else if (results && results.results) {
            searchResults = results.results;
        } else if (Array.isArray(results)) {
            searchResults = results;
        }
        
        if (!searchResults || searchResults.length === 0) {
            container.innerHTML = this.app.ui.createEmptyState(
                'search',
                'No Results Found',
                'Try different keywords or check your spelling.'
            );
            return;
        }

        container.innerHTML = `
            <h5>Search Results (${searchResults.length})</h5>
            ${searchResults.map(result => `
                <div class="card mb-3">
                    <div class="card-body">
                        <h6 class="card-title">${result.filename || 'Document'}</h6>
                        <p class="card-text">${result.contentPreview?.substring(0, 200) || 'No preview'}...</p>
                        <div class="d-flex justify-content-between">
                            <small class="text-muted">Score: ${(result.similarity * 100).toFixed(1)}%</small>
                            <small class="text-muted">${result.collectionName || 'Unknown collection'}</small>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    }

    async performCollectionSearch() {
        const query = document.getElementById('collectionSearchInput').value.trim();
        if (!query || !this.app.currentCollection) return;
        
        const limit = document.getElementById('searchLimit').value;
        const threshold = document.getElementById('searchThreshold').value;
        
        try {
            const response = await this.app.api.searchCollection(
                this.app.currentCollection.id, 
                query, 
                { limit: parseInt(limit), threshold: parseFloat(threshold) }
            );
            
            if (response && response.success) {
                this.renderCollectionSearchResults(response.data);
            }
        } catch (error) {
            this.app.showNotification('Search failed', 'error');
        }
    }

    renderCollectionSearchResults(results) {
        const container = document.getElementById('collectionSearchResults');
        
        if (!results || !results.results || results.results.length === 0) {
            container.innerHTML = this.app.ui.createEmptyState(
                'search',
                'No Results Found',
                'Try different keywords or lower the similarity threshold.'
            );
            return;
        }

        container.innerHTML = `
            <h5>Search Results (${results.results.length})</h5>
            ${results.results.map(result => `
                <div class="card mb-3">
                    <div class="card-body">
                        <h6 class="card-title">${result.filename || 'Document'}</h6>
                        <p class="card-text">${result.contentPreview || result.content?.substring(0, 200) || 'No preview'}...</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">Similarity: ${(result.similarity * 100).toFixed(1)}%</small>
                            <div>
                                <button class="btn btn-sm btn-outline-primary" onclick="app.documents.viewDocument('${result.id}')">
                                    View
                                </button>
                                <button class="btn btn-sm btn-outline-info" onclick="app.search.findSimilarDocuments('${result.id}')">
                                    Similar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    }

    async findSimilarDocuments(docId) {
        try {
            const response = await this.app.api.call(`${this.app.api.baseUrl}/search/documents/${docId}/similar`);
            if (response && response.success) {
                const results = response.data.similarDocuments;
                this.renderSimilarDocuments(results, response.data.sourceDocument);
            }
        } catch (error) {
            this.app.showNotification('Failed to find similar documents', 'error');
        }
    }

    renderSimilarDocuments(results, sourceDoc) {
        const container = document.getElementById('collectionSearchResults');
        
        container.innerHTML = `
            <h5>Documents Similar to "${sourceDoc.filename}"</h5>
            ${results.length === 0 ? 
                '<p class="text-muted">No similar documents found.</p>' :
                results.map(result => `
                    <div class="card mb-3">
                        <div class="card-body">
                            <h6 class="card-title">${result.filename}</h6>
                            <p class="card-text">${result.contentPreview?.substring(0, 200)}...</p>
                            <small class="text-muted">Similarity: ${(result.similarity * 100).toFixed(1)}%</small>
                        </div>
                    </div>
                `).join('')
            }
        `;
    }
}

window.VSISearchModule = VSISearchModule;
