// This file is now deprecated - functionality moved to modular structure
// Keep this file for backward compatibility but redirect to new modules

console.warn('app.js is deprecated. Using new modular structure from js/ directory.');

// Global functions maintained for backward compatibility
window.showLogin = () => window.app?.auth?.showLoginModal();
window.showRegister = () => window.app?.auth?.showRegisterModal();
window.showDashboard = () => window.app?.collections?.loadDashboard();
window.showCollections = () => window.app?.collections?.showCollections();
window.showClusters = () => window.app?.clusters?.showClusters();
window.showSearch = () => window.app?.search?.showSearch();
window.showUsage = () => window.app?.usage?.showUsage();
window.showAdmin = () => window.app?.admin?.showAdmin();
window.logout = () => window.app?.auth?.logout();
window.performQuickSearch = () => window.app?.search?.performQuickSearch();
window.performGlobalSearch = () => window.app?.search?.performGlobalSearch();
window.showCreateCollection = () => window.app?.collections?.showCreateCollection();
window.hideAllViews = () => window.app?.ui?.hideAllViews();
window.toggleAdvancedSettings = (type) => {
    document.getElementById('shardedSettings').style.display = type === 'sharded' ? 'block' : 'none';
    document.getElementById('replicatedSettings').style.display = type === 'replicated' ? 'block' : 'none';
};
