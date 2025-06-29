/**
 * VSI External Content Service
 * Frontend service for interacting with external content APIs
 */
class ExternalContentService {
    constructor(apiBaseUrl = '/api/external') {
        this.apiBaseUrl = apiBaseUrl;
    }

    /**
     * Get external content configuration and status
     */
    async getConfig() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/config`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get external content config:', error);
            throw error;
        }
    }

    /**
     * Perform web search
     */
    async search(query, options = {}) {
        try {
            const requestBody = {
                query,
                maxResults: options.maxResults || 10,
                includeContent: options.includeContent || false
            };

            if (options.provider) {
                requestBody.provider = options.provider;
            }

            const response = await fetch(`${this.apiBaseUrl}/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to perform web search:', error);
            throw error;
        }
    }

    /**
     * Browse and extract content from URL
     */
    async browse(url, options = {}) {
        try {
            const requestBody = {
                url,
                extractionType: options.extractionType || 'summary',
                includeMetadata: options.includeMetadata !== false,
                waitForJs: options.waitForJs || false
            };

            const response = await fetch(`${this.apiBaseUrl}/browse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to browse URL:', error);
            throw error;
        }
    }

    /**
     * Analyze multiple external sources
     */
    async analyze(sources, options = {}) {
        try {
            const requestBody = {
                sources,
                analysisType: options.analysisType || 'summary',
                maxSources: options.maxSources || 5
            };

            const response = await fetch(`${this.apiBaseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to analyze external sources:', error);
            throw error;
        }
    }

    /**
     * Test external content service availability
     */
    async testConnection() {
        try {
            const config = await this.getConfig();
            return {
                available: config.enabled,
                services: config.services,
                message: config.enabled ? 'External content services are available' : 'External content services are disabled'
            };
        } catch (error) {
            return {
                available: false,
                services: {},
                message: `External content services unavailable: ${error.message}`
            };
        }
    }

    /**
     * Validate URL format
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Parse URLs from text input
     */
    parseUrls(text) {
        if (!text || typeof text !== 'string') return [];
        
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && this.isValidUrl(line));
    }

    /**
     * Format external source for analysis
     */
    formatSource(input) {
        if (typeof input === 'string') {
            // Check if it's a URL or search query
            if (this.isValidUrl(input)) {
                return input; // Direct URL
            } else {
                // Search query
                return {
                    type: 'search',
                    value: input
                };
            }
        }
        return input; // Assume it's already formatted
    }

    /**
     * Get user-friendly error message
     */
    getErrorMessage(error) {
        if (error.message.includes('401')) {
            return 'Authentication required. Please log in.';
        } else if (error.message.includes('503')) {
            return 'External content services are currently unavailable.';
        } else if (error.message.includes('400')) {
            return 'Invalid request. Please check your input.';
        } else {
            return `External content error: ${error.message}`;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExternalContentService;
}

// Make available globally for browser use
if (typeof window !== 'undefined') {
    window.ExternalContentService = ExternalContentService;
}
