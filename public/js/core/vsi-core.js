/**
 * VSI Vector Store - Core Application Class
 * Main orchestrator for all application modules
 */
class VSIApp {
    constructor(config = {}) {
        this.config = {
            apiBaseUrl: '/api',
            storagePrefix: 'vsi_',
            ...config
        };
        
        // Core properties
        this.token = localStorage.getItem(`${this.config.storagePrefix}token`);
        this.user = null;
        this.currentView = 'dashboard';
        this.currentCollection = null;
        this.currentCollectionTab = 'documents';
        
        // Initialize modules with error handling
        try {
            this.api = new VSIApiService(this);
            this.auth = new VSIAuthModule(this);
            this.ui = new VSIUIModule(this);
            this.collections = new VSICollectionsModule(this);
            this.documents = new VSIDocumentsModule(this);
            this.search = new VSISearchModule(this);
            this.chat = new VSIChatModule(this);
            this.admin = new VSIAdminModule(this);
            this.usage = new VSIUsageModule(this);
            this.clusters = new VSIClustersModule(this);
        } catch (error) {
            console.error('Error initializing modules:', error);
            throw error;
        }
    }

    async init() {
        console.log('Initializing VSI App...');
        console.log('Token from localStorage:', this.token ? 'Present' : 'Missing');
        
        // Initialize UI
        this.ui.init();
        
        if (this.token) {
            await this.auth.loadUser();
        } else {
            this.auth.showLoginModal();
        }
    }

    // Utility methods
    showNotification(message, type = 'info') {
        this.ui.showNotification(message, type);
    }

    showView(viewName) {
        this.ui.showView(viewName);
        this.currentView = viewName;
    }

    formatBytes(bytes) {
        return VSIUtils.formatBytes(bytes);
    }
}

// Export for global access
window.VSIApp = VSIApp;
