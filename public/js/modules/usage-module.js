/**
 * VSI Usage Module
 * Handles usage statistics and billing information
 */
class VSIUsageModule {
    constructor(app) {
        this.app = app;
    }

    async showUsage() {
        this.app.showView('usage');
        await this.loadUsage();
    }

    async loadUsage() {
        try {
            const response = await this.app.api.getUserUsage();
            this.renderUsage(response);
        } catch (error) {
            console.error('Usage load error:', error);
            this.app.showNotification('Failed to load usage statistics', 'error');
        }
    }

    renderUsage(usage) {
        const container = document.getElementById('usageStats');
        
        if (!usage) {
            container.innerHTML = '<p class="text-muted">No usage data available.</p>';
            return;
        }

        // Handle both wrapped and direct response
        let usageData = usage;
        if (usage.success && usage.data) {
            usageData = usage.data;
        }

        const {
            collections = { current: 0, limit: -1, percentage: 0 },
            documents = { current: 0, limit: -1, percentage: 0 },
            searches = { current: 0, limit: -1, percentage: 0 },
            uploads = { current: 0, limit: -1, percentage: 0 },
            tier = 'free',
            billingPeriod = null
        } = usageData;

        container.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5><i class="fas fa-user me-2"></i>Account Information</h5>
                        </div>
                        <div class="card-body">
                            <p><strong>Current Tier:</strong> <span class="badge bg-primary text-capitalize">${tier}</span></p>
                            ${billingPeriod ? `
                                <p><strong>Billing Period:</strong><br>
                                   <small class="text-muted">
                                       ${new Date(billingPeriod.start).toLocaleDateString()} - 
                                       ${new Date(billingPeriod.end).toLocaleDateString()}
                                   </small>
                                </p>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5><i class="fas fa-chart-bar me-2"></i>Usage Overview</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span><i class="fas fa-folder me-1"></i>Collections</span>
                                    <span>${collections.current}${collections.limit > 0 ? `/${collections.limit}` : ''}</span>
                                </div>
                                ${collections.limit > 0 ? `
                                    <div class="progress mb-2" style="height: 8px;">
                                        <div class="progress-bar ${collections.percentage > 80 ? 'bg-warning' : ''}" 
                                             style="width: ${collections.percentage}%"></div>
                                    </div>
                                ` : '<div class="text-muted small">Unlimited</div>'}
                            </div>
                            
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span><i class="fas fa-file me-1"></i>Documents</span>
                                    <span>${documents.current}${documents.limit > 0 ? `/${documents.limit}` : ''}</span>
                                </div>
                                ${documents.limit > 0 ? `
                                    <div class="progress mb-2" style="height: 8px;">
                                        <div class="progress-bar ${documents.percentage > 80 ? 'bg-warning' : ''}" 
                                             style="width: ${documents.percentage}%"></div>
                                    </div>
                                ` : '<div class="text-muted small">Unlimited</div>'}
                            </div>
                            
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span><i class="fas fa-search me-1"></i>Searches</span>
                                    <span>${searches.current}${searches.limit > 0 ? `/${searches.limit}` : ''}</span>
                                </div>
                                ${searches.limit > 0 ? `
                                    <div class="progress mb-2" style="height: 8px;">
                                        <div class="progress-bar ${searches.percentage > 80 ? 'bg-warning' : ''}" 
                                             style="width: ${searches.percentage}%"></div>
                                    </div>
                                ` : '<div class="text-muted small">Unlimited</div>'}
                            </div>
                            
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span><i class="fas fa-upload me-1"></i>Uploads</span>
                                    <span>${uploads.current}${uploads.limit > 0 ? `/${uploads.limit}` : ''}</span>
                                </div>
                                ${uploads.limit > 0 ? `
                                    <div class="progress mb-2" style="height: 8px;">
                                        <div class="progress-bar ${uploads.percentage > 80 ? 'bg-warning' : ''}" 
                                             style="width: ${uploads.percentage}%"></div>
                                    </div>
                                ` : '<div class="text-muted small">Unlimited</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-info-circle me-2"></i>Tier Limits</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6>Current Tier: ${tier.charAt(0).toUpperCase() + tier.slice(1)}</h6>
                            <ul class="list-unstyled">
                                <li><i class="fas fa-folder me-2"></i>Collections: ${collections.limit === -1 ? 'Unlimited' : collections.limit}</li>
                                <li><i class="fas fa-file me-2"></i>Documents: ${documents.limit === -1 ? 'Unlimited' : documents.limit}</li>
                                <li><i class="fas fa-search me-2"></i>Searches: ${searches.limit === -1 ? 'Unlimited' : searches.limit + ' per month'}</li>
                                <li><i class="fas fa-upload me-2"></i>Uploads: ${uploads.limit === -1 ? 'Unlimited' : uploads.limit + ' per month'}</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h6>Need More?</h6>
                            <p class="text-muted">Upgrade your tier to get higher limits and additional features.</p>
                            <button class="btn btn-primary btn-sm" disabled>
                                <i class="fas fa-arrow-up me-2"></i>Upgrade Plan
                                <small class="d-block">Coming Soon</small>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    formatBytes(bytes) {
        return VSIUtils.formatBytes(bytes);
    }
}

window.VSIUsageModule = VSIUsageModule;
