/**
 * VSI Initialization and Global Functions
 * Main entry point and global function wrappers
 */

// Global app instance
let app;

// Global cleanup function to fix interaction issues
function forceCleanupUI() {
    // Remove any stuck modal backdrops
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.remove();
    });
    
    // Remove modal-open class from body
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.body.style.pointerEvents = '';
    
    // Remove any loading states
    document.body.classList.remove('loading', 'disabled');
    
    // Ensure app is interactive
    const appElement = document.getElementById('app');
    if (appElement && !appElement.classList.contains('hidden')) {
        appElement.style.pointerEvents = 'auto';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM Content Loaded - Initializing VSI App');
    
    try {
        // Force cleanup any stuck UI states
        forceCleanupUI();
        
        // Create global app instance
        window.app = app = new VSIApp({
            apiBaseUrl: '/api',
            storagePrefix: 'vsi_'
        });
        
        // Initialize the application
        await app.init();
        
        console.log('VSI App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize VSI App:', error);
        
        // Show error message
        document.body.innerHTML = `
            <div class="container mt-5">
                <div class="alert alert-danger">
                    <h4>Application Error</h4>
                    <p>Failed to initialize the application. Please refresh the page and try again.</p>
                    <button class="btn btn-danger" onclick="location.reload()">Refresh Page</button>
                </div>
            </div>
        `;
    }
});

// Add emergency cleanup function accessible globally
window.forceCleanupUI = forceCleanupUI;

// Global functions for onclick handlers (maintaining backward compatibility)
function showLogin() {
    app.ui.hideModals();
    app.auth.showLoginModal();
}

function showRegister() {
    app.ui.hideModals();
    app.auth.showRegisterModal();
}

function showDashboard() {
    app.collections.loadDashboard();
}

function showCollections() {
    app.collections.showCollections();
}

function showSearch() {
    app.search.showSearch();
}

function showUsage() {
    app.usage.showUsage();
}

function showAdmin() {
    app.admin.showAdmin();
}

function logout() {
    app.auth.logout();
}

function performQuickSearch() {
    app.search.performQuickSearch();
}

function performGlobalSearch() {
    app.search.performGlobalSearch();
}

function showCreateCollection() {
    app.collections.showCreateCollection();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VSIApp };
}
