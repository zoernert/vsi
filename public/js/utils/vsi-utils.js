/**
 * VSI Utilities
 * Common utility functions used across the application
 */
class VSIUtils {
    static formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    static formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    static formatDateTime(dateString) {
        return new Date(dateString).toLocaleString();
    }

    static truncateText(text, maxLength = 100) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static sanitizeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    static createProgress(current, total, label = '') {
        const percentage = total > 0 ? Math.min((current / total * 100), 100) : 0;
        const isNearLimit = percentage > 80;
        
        return `
            <div class="mb-2">
                ${label ? `<div class="d-flex justify-content-between mb-1">
                    <span>${label}</span>
                    <span>${current.toLocaleString()} / ${total === -1 ? 'Unlimited' : total.toLocaleString()}</span>
                </div>` : ''}
                <div class="progress">
                    <div class="progress-bar ${isNearLimit ? 'bg-warning' : ''}" 
                         style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }

    static handleApiResponse(response, envelope = true) {
        if (!response) return null;
        
        if (envelope && response.success && response.data) {
            return response.data;
        } else if (envelope && !response.success) {
            return null;
        }
        
        return response;
    }

    static extractArrayFromResponse(response) {
        if (Array.isArray(response)) {
            return response;
        } else if (response && response.success && Array.isArray(response.data)) {
            return response.data;
        } else if (response && Array.isArray(response.data)) {
            return response.data;
        }
        return [];
    }
}

window.VSIUtils = VSIUtils;
