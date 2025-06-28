/**
 * VSI API Service - Centralized API communication
 */
class VSIApiService {
    constructor(app) {
        this.app = app;
        this.baseUrl = app.config.apiBaseUrl;
    }

    async call(url, options = {}) {
        try {
            console.log('API Call:', url, 'with token:', this.app.token ? 'Present' : 'Missing');
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.app.token && { 'Authorization': `Bearer ${this.app.token}` }),
                    ...options.headers
                }
            });

            console.log('API Response status:', response.status);

            if (response.status === 401 || response.status === 403) {
                console.log('Authentication failed, logging out');
                this.app.auth.logout();
                return null;
            }

            const data = await response.json();
            console.log('API Response data:', data);
            
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Authentication endpoints
    async login(username, password) {
        return this.call(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    async register(username, password) {
        return this.call(`${this.baseUrl}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    // User endpoints
    async getUserProfile() {
        return this.call(`${this.baseUrl}/users/profile`);
    }

    async updateUserProfile(data) {
        return this.call(`${this.baseUrl}/users/profile`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async changePassword(currentPassword, newPassword) {
        return this.call(`${this.baseUrl}/users/change-password`, {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    }

    async getUserUsage() {
        const response = await this.call(`${this.baseUrl}/users/usage`);
        // Handle the nested response structure - the data is under response.data
        if (response && response.success && response.data) {
            return response.data;
        }
        return response;
    }

    // Collections endpoints (now support UUID identifiers)
    async getCollections(includeStats = false) {
        // According to OpenAPI spec, collections are returned as a direct array
        const response = await this.call(`${this.baseUrl}/collections${includeStats ? '?include_stats=true' : ''}`);
        return response; // Return as-is since spec shows direct array response
    }

    async getCollection(id) {
        // According to OpenAPI spec, this returns wrapped response
        // @param {string} id - Collection UUID (preferred) or legacy integer ID
        return this.call(`${this.baseUrl}/collections/${id}`);
    }

    async createCollection(data) {
        return this.call(`${this.baseUrl}/collections`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async deleteCollection(id) {
        // @param {string} id - Collection UUID (preferred) or legacy integer ID
        return this.call(`${this.baseUrl}/collections/${id}`, {
            method: 'DELETE'
        });
    }

    // Cluster endpoints
    async getClusters(options = {}) {
        const params = new URLSearchParams(options);
        return this.call(`${this.baseUrl}/clusters?${params}`);
    }

    async getCluster(id) {
        return this.call(`${this.baseUrl}/clusters/${id}`);
    }

    async createCluster(data) {
        return this.call(`${this.baseUrl}/clusters`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateCluster(id, data) {
        return this.call(`${this.baseUrl}/clusters/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteCluster(id) {
        return this.call(`${this.baseUrl}/clusters/${id}`, {
            method: 'DELETE'
        });
    }

    async addCollectionToCluster(clusterId, collectionId) {
        return this.call(`${this.baseUrl}/clusters/${clusterId}/collections/${collectionId}`, {
            method: 'POST'
        });
    }

    async removeCollectionFromCluster(collectionId) {
        return this.call(`${this.baseUrl}/clusters/collections/${collectionId}/cluster`, {
            method: 'DELETE'
        });
    }

    async getClusterStats(id) {
        return this.call(`${this.baseUrl}/clusters/${id}/stats`);
    }

    async autoGenerateClusterForCollection(collectionId) {
        return this.call(`${this.baseUrl}/clusters/auto-generate/${collectionId}`, {
            method: 'POST'
        });
    }

    async getOrCreateCollectionCluster(collectionId) {
        return this.call(`${this.baseUrl}/clusters/for-collection/${collectionId}`);
    }

    async getContentBasedClusters(collectionId, options = {}) {
        const params = new URLSearchParams(options);
        return this.call(`${this.baseUrl}/clusters/content-analysis/${collectionId}?${params}`);
    }

    // Documents endpoints (collection parameters now support UUIDs)
    async getCollectionDocuments(collectionId, filters = {}) {
        // @param {string} collectionId - Collection UUID (preferred) or legacy integer ID
        const params = new URLSearchParams(filters);
        return this.call(`${this.baseUrl}/collections/${collectionId}/documents?${params}`);
    }

    async deleteDocument(collectionId, docId) {
        // @param {string} collectionId - Collection UUID (preferred) or legacy integer ID
        return this.call(`${this.baseUrl}/collections/${collectionId}/documents/${docId}`, {
            method: 'DELETE'
        });
    }

    async uploadFiles(collectionId, formData) {
        // Use the correct endpoint from uploadRoutes.js
        return fetch(`${this.baseUrl}/upload/${collectionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.app.token}`
                // Don't set Content-Type - let browser handle FormData boundary
            },
            body: formData
        });
    }

    // Enhanced upload method for progress tracking
    async uploadFilesWithProgress(collectionId, files, onProgress) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                const result = await this.uploadSingleFileWithProgress(collectionId, file, (progressData) => {
                    onProgress({
                        ...progressData,
                        currentFile: i + 1,
                        totalFiles: files.length,
                        filename: file.name
                    });
                });
                
                results.push({ file: file.name, success: true, data: result });
            } catch (error) {
                results.push({ file: file.name, success: false, error: error.message });
            }
        }
        
        return results;
    }

    async uploadSingleFileWithProgress(collectionId, file, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            console.log(`📤 API Service uploading: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
            console.log(`📤 FormData entries:`, Array.from(formData.entries()));
            
            // Use the correct endpoint from uploadRoutes.js
            fetch(`${this.baseUrl}/upload/${collectionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.app.token}`
                    // Don't set Content-Type - browser handles FormData automatically
                },
                body: formData
            }).then(async response => {
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorData.error || errorMessage;
                        console.error('Upload error details:', errorData);
                    } catch (e) {
                        console.warn('Could not parse error response');
                    }
                    throw new Error(errorMessage);
                }
                return response.json();
            }).then(data => {
                if (onProgress) {
                    onProgress({
                        type: 'complete',
                        progress: 100,
                        stage: 'complete',
                        message: 'Upload completed'
                    });
                }
                resolve(data);
            }).catch(error => {
                console.error('API upload error:', error);
                if (onProgress) {
                    onProgress({
                        type: 'error',
                        message: error.message
                    });
                }
                reject(error);
            });
        });
    }

    // Search endpoints
    async searchCollection(collectionId, query, options = {}) {
        return this.call(`${this.baseUrl}/collections/${collectionId}/search`, {
            method: 'POST',
            body: JSON.stringify({ query, ...options })
        });
    }

    async globalSearch(query, limit = 20) {
        return this.call(`${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    }

    // Chat endpoints
    async askQuestion(collectionId, question, options = {}) {
        return this.call(`${this.baseUrl}/collections/${collectionId}/ask`, {
            method: 'POST',
            body: JSON.stringify({ question, ...options })
        });
    }

    // Add new endpoint for snippet preview
    async getSnippetContent(collectionId, chunkId) {
        return this.call(`${this.baseUrl}/collections/${collectionId}/snippets/${chunkId}`);
    }

    // Admin endpoints
    async getAdminDashboard() {
        // According to OpenAPI spec, this returns unwrapped response
        return this.call(`${this.baseUrl}/admin/dashboard`);
    }

    async getAdminUsers() {
        // According to OpenAPI spec, this returns wrapped response
        return this.call(`${this.baseUrl}/admin/users`);
    }

    async getSystemHealth() {
        // According to OpenAPI spec, this returns wrapped response
        return this.call(`${this.baseUrl}/admin/system/health`);
    }

    async createUser(userData) {
        return this.call(`${this.baseUrl}/admin/users`, {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async updateUser(username, updates) {
        return this.call(`${this.baseUrl}/admin/users/${username}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async deleteUser(username) {
        return this.call(`${this.baseUrl}/admin/users/${username}`, {
            method: 'DELETE'
        });
    }

    // HTTP convenience methods
    async get(url) {
        return this.call(url);
    }

    async post(url, data) {
        return this.call(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(url, data) {
        return this.call(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(url) {
        return this.call(url, {
            method: 'DELETE'
        });
    }
}

window.VSIApiService = VSIApiService;
