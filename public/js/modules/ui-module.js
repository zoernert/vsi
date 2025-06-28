/**
 * VSI UI Module
 * Handles common UI operations, notifications, and view management
 */
class VSIUIModule {
    constructor(app) {
        this.app = app;
    }

    init() {
        this.bindGlobalEvents();
    }

    bindGlobalEvents() {
        // Quick search
        document.getElementById('quickSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.app.search.performQuickSearch();
            }
        });

        // Global search
        document.getElementById('globalSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.app.search.performGlobalSearch();
            }
        });
    }

    showView(viewName) {
        // Ensure body is interactive
        document.body.style.pointerEvents = '';
        document.body.classList.remove('modal-open');
        
        // Hide all views
        this.hideAllViews();
        
        // Show selected view
        const targetView = document.getElementById(viewName + 'View');
        if (targetView) {
            targetView.classList.remove('hidden');
        }
        
        // Update navigation active states
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Set active nav link based on view
        const navSelectors = {
            'dashboard': 'a[onclick="showDashboard()"]',
            'collections': 'a[onclick="showCollections()"]',
            'clusters': 'a[onclick="showClusters()"]',
            'search': 'a[onclick="showSearch()"]',
            'usage': 'a[onclick="showUsage()"]',
            'admin': 'a[onclick="showAdmin()"]'
        };
        
        const activeNavLink = document.querySelector(navSelectors[viewName]);
        if (activeNavLink) {
            activeNavLink.classList.add('active');
        }
        
        // Update page title
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            const titles = {
                'dashboard': 'Dashboard',
                'collections': 'Collections',
                'clusters': 'Clusters',
                'search': 'Search',
                'usage': 'Usage Statistics',
                'admin': 'Admin Dashboard',
                'collectionDetail': 'Collection Details'
            };
            pageTitle.textContent = titles[viewName] || viewName.charAt(0).toUpperCase() + viewName.slice(1);
        }
    }

    hideAllViews() {
        document.querySelectorAll('[id$="View"]').forEach(view => {
            view.classList.add('hidden');
        });
    }

    hideModals() {
        // Hide all Bootstrap modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
            }
        });
        
        // Force cleanup of modal artifacts
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                backdrop.remove();
            });
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            document.body.style.pointerEvents = '';
        }, 200);
    }

    showNotification(message, type = 'info') {
        console.log('Notification:', type, message);
        
        const toast = document.createElement('div');
        toast.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    showLoadingState(element, loading = true) {
        if (loading) {
            element.classList.add('loading');
        } else {
            element.classList.remove('loading');
        }
    }

    createCard(title, content, actions = '') {
        return `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">${title}</h6>
                    <div class="card-text">${content}</div>
                    ${actions ? `<div class="card-actions mt-2">${actions}</div>` : ''}
                </div>
            </div>
        `;
    }

    createStatsCard(icon, value, label, color = 'primary') {
        return `
            <div class="card stats-card bg-${color}">
                <div class="card-body text-center text-white">
                    <i class="fas fa-${icon} fa-2x mb-2"></i>
                    <h3>${value}</h3>
                    <p class="mb-0">${label}</p>
                </div>
            </div>
        `;
    }

    createEmptyState(icon, title, description, actionButton = '') {
        return `
            <div class="text-center py-5">
                <i class="fas fa-${icon} fa-3x text-muted mb-3"></i>
                <h4>${title}</h4>
                <p class="text-muted">${description}</p>
                ${actionButton}
            </div>
        `;
    }
}

window.VSIUIModule = VSIUIModule;
