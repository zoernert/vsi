const axios = require('axios');

/**
 * WebBrowserService - Provides web browsing and content extraction capabilities
 * Uses external browser automation API for web scraping and AI-powered content analysis
 */
class WebBrowserService {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled || false,
            apiBase: config.apiBase || 'https://browserless.corrently.cloud',
            timeout: config.timeout || 60000,
            maxCommands: config.maxCommands || 50,
            maxConcurrentSessions: config.maxConcurrentSessions || 3,
            retryAttempts: config.retryAttempts || 2,
            ...config
        };
        
        this.activeSessions = new Map();
        this.sessionQueue = [];
        this.currentSessions = 0;
    }

    /**
     * Check if service is enabled and available
     */
    isEnabled() {
        return this.config.enabled;
    }

    /**
     * Create a new browser session
     */
    async createSession(metadata = {}) {
        if (!this.isEnabled()) {
            throw new Error('WebBrowserService is disabled');
        }

        // Check session limits
        if (this.currentSessions >= this.config.maxConcurrentSessions) {
            throw new Error('Maximum concurrent sessions reached');
        }

        try {
            const sessionConfig = {
                metadata: {
                    browser: 'chrome',
                    purpose: 'content-analysis',
                    project: 'vsi-research',
                    ...metadata
                },
                options: {
                    timeout: this.config.timeout,
                    maxCommands: this.config.maxCommands
                }
            };

            console.log(`🌐 Creating browser session with config:`, sessionConfig);

            const response = await axios.post(`${this.config.apiBase}/api/sessions`, sessionConfig, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const sessionId = response.data.id;
            if (!sessionId) {
                throw new Error('No session ID returned from browser API');
            }

            // Track active session
            this.activeSessions.set(sessionId, {
                id: sessionId,
                createdAt: Date.now(),
                metadata,
                commandCount: 0
            });
            this.currentSessions++;

            console.log(`✅ Browser session created: ${sessionId}`);
            return sessionId;

        } catch (error) {
            console.error('Failed to create browser session:', error.response?.data || error.message);
            throw new Error(`Browser session creation failed: ${error.message}`);
        }
    }

    /**
     * Navigate to a URL in the browser session
     */
    async navigateToUrl(sessionId, url) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error('Invalid or expired session ID');
        }

        try {
            console.log(`🔗 Navigating to URL: ${url}`);

            const response = await axios.post(
                `${this.config.apiBase}/api/sessions/${sessionId}/commands`,
                {
                    type: 'navigate',
                    payload: {
                        url: url,
                        timeout: 30000
                    }
                },
                {
                    timeout: 35000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Update command count
            const session = this.activeSessions.get(sessionId);
            session.commandCount++;

            const success = response.data.success;
            if (success) {
                console.log(`✅ Successfully navigated to: ${url}`);
            } else {
                console.warn(`⚠️ Navigation may have failed for: ${url}`);
            }

            return success;

        } catch (error) {
            console.error(`Navigation failed for ${url}:`, error.response?.data || error.message);
            throw new Error(`Navigation failed: ${error.message}`);
        }
    }

    /**
     * Extract content using AI-powered natural language tasks
     */
    async extractContentWithAI(sessionId, analysisPrompt) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error('Invalid or expired session ID');
        }

        try {
            console.log(`🤖 Extracting content with AI prompt`);

            const response = await axios.post(
                `${this.config.apiBase}/api/sessions/${sessionId}/nl-tasks`,
                {
                    task: analysisPrompt
                },
                {
                    timeout: 45000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Update command count
            const session = this.activeSessions.get(sessionId);
            session.commandCount++;

            const result = response.data.task?.response || response.data.task?.description || null;
            
            if (result) {
                console.log(`✅ AI content extraction completed`);
            } else {
                console.warn(`⚠️ No content extracted from AI analysis`);
            }

            return result;

        } catch (error) {
            console.error('AI content extraction failed:', error.response?.data || error.message);
            throw new Error(`AI extraction failed: ${error.message}`);
        }
    }

    /**
     * Take a screenshot of the current page
     */
    async takeScreenshot(sessionId, options = {}) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error('Invalid or expired session ID');
        }

        try {
            console.log(`📸 Taking screenshot`);

            const response = await axios.post(
                `${this.config.apiBase}/api/sessions/${sessionId}/commands`,
                {
                    type: 'screenshot',
                    payload: {
                        fullPage: options.fullPage || false,
                        timeout: 15000
                    }
                },
                {
                    timeout: 20000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Update command count
            const session = this.activeSessions.get(sessionId);
            session.commandCount++;

            return response.data.status === 'success';

        } catch (error) {
            console.error('Screenshot failed:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Analyze web content - complete workflow
     */
    async analyzeWebContent(url, analysisType = 'general') {
        let sessionId = null;
        const startTime = Date.now();

        try {
            // Create session
            sessionId = await this.createSession({
                analysisType,
                targetUrl: url,
                timestamp: new Date().toISOString()
            });

            // Navigate to URL with retry logic
            let navigated = false;
            for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
                try {
                    navigated = await this.navigateToUrl(sessionId, url);
                    if (navigated) break;
                } catch (error) {
                    console.warn(`Navigation attempt ${attempt} failed:`, error.message);
                    if (attempt === this.config.retryAttempts) throw error;
                    await this.delay(2000); // Wait before retry
                }
            }

            if (!navigated) {
                throw new Error(`Failed to navigate to ${url} after ${this.config.retryAttempts} attempts`);
            }

            // Wait for page load
            await this.delay(3000);

            // Take screenshot for verification (optional)
            await this.takeScreenshot(sessionId);

            // Extract content based on analysis type
            const prompt = this.getAnalysisPrompt(analysisType, url);
            const analysisResult = await this.extractContentWithAI(sessionId, prompt);

            const duration = Date.now() - startTime;

            return {
                url,
                analysisType,
                content: analysisResult,
                timestamp: new Date().toISOString(),
                duration,
                success: true,
                metadata: {
                    sessionId,
                    navigationSuccess: navigated
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`Web content analysis failed for ${url}:`, error.message);
            
            return {
                url,
                analysisType,
                content: null,
                error: error.message,
                timestamp: new Date().toISOString(),
                duration,
                success: false,
                metadata: {
                    sessionId
                }
            };
        } finally {
            // Always clean up session
            if (sessionId) {
                await this.cleanupSession(sessionId);
            }
        }
    }

    /**
     * Search and analyze - combines Google search with content analysis
     */
    async searchAndAnalyze(query, analysisType = 'general', maxResults = 3) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        
        // First analyze the search results page
        const searchAnalysis = await this.analyzeWebContent(searchUrl, 'search_results');
        
        if (!searchAnalysis.success) {
            return searchAnalysis;
        }

        // Extract URLs from search results if possible
        // This is a simplified implementation - in practice, you'd want more sophisticated URL extraction
        const urls = this.extractUrlsFromSearchResults(searchAnalysis.content);
        const limitedUrls = urls.slice(0, maxResults);

        const results = [searchAnalysis];

        // Analyze top search results
        for (const url of limitedUrls) {
            try {
                const analysis = await this.analyzeWebContent(url, analysisType);
                results.push(analysis);
            } catch (error) {
                console.warn(`Failed to analyze ${url}:`, error.message);
            }
        }

        return {
            query,
            searchUrl,
            analysisType,
            results,
            totalResults: results.length,
            timestamp: new Date().toISOString(),
            success: true
        };
    }

    /**
     * Clean up browser session
     */
    async cleanupSession(sessionId) {
        try {
            if (this.activeSessions.has(sessionId)) {
                console.log(`🧹 Cleaning up session: ${sessionId}`);

                await axios.delete(`${this.config.apiBase}/api/sessions/${sessionId}`, {
                    timeout: 10000
                });

                this.activeSessions.delete(sessionId);
                this.currentSessions--;
                
                console.log(`✅ Session cleanup completed: ${sessionId}`);
            }
        } catch (error) {
            console.error(`Session cleanup failed for ${sessionId}:`, error.message);
            // Still remove from tracking even if API call failed
            this.activeSessions.delete(sessionId);
            this.currentSessions--;
        }
    }

    /**
     * Get analysis prompt based on analysis type
     */
    getAnalysisPrompt(analysisType, url) {
        const prompts = {
            general: `Analyze this webpage and provide comprehensive insights about its content, themes, sentiment, key entities, and main points. Focus on factual information and key concepts.`,
            
            themes: `What are the main themes, topics, and key concepts discussed on this webpage? Provide a structured analysis of the content themes and their relationships.`,
            
            sentiment: `Analyze the sentiment and emotional tone of this webpage content. Identify positive, negative, or neutral sentiment and provide specific examples from the text.`,
            
            entities: `Extract and list all important entities mentioned on this page including people, organizations, locations, dates, products, and key terms. Organize them by category.`,
            
            summary: `Provide a comprehensive summary of this webpage's content, highlighting the main points, key information, and conclusions. Include any important statistics or facts.`,
            
            search_results: `Look at this Google search results page and extract the main search results including titles, descriptions, and URLs. Focus on the organic search results.`
        };

        return prompts[analysisType] || prompts.general;
    }

    /**
     * Extract URLs from search results content (simplified implementation)
     */
    extractUrlsFromSearchResults(content) {
        if (!content) return [];
        
        // Simple regex to find URLs in search results
        // In practice, you'd want more sophisticated extraction
        const urlRegex = /https?:\/\/[^\s<>"']+/g;
        const urls = content.match(urlRegex) || [];
        
        // Filter out Google-specific URLs and clean up
        return urls
            .filter(url => !url.includes('google.com') && !url.includes('youtube.com'))
            .slice(0, 5) // Limit to top 5 URLs
            .map(url => url.replace(/[.,;)]+$/, '')); // Clean trailing punctuation
    }

    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            activeSessions: this.activeSessions.size,
            maxConcurrentSessions: this.config.maxConcurrentSessions,
            sessionDetails: Array.from(this.activeSessions.values()).map(session => ({
                id: session.id,
                age: Date.now() - session.createdAt,
                commandCount: session.commandCount
            }))
        };
    }

    /**
     * Cleanup all active sessions
     */
    async cleanupAllSessions() {
        console.log(`🧹 Cleaning up all ${this.activeSessions.size} active sessions`);
        
        const cleanupPromises = Array.from(this.activeSessions.keys()).map(sessionId => 
            this.cleanupSession(sessionId)
        );
        
        await Promise.allSettled(cleanupPromises);
        console.log(`✅ All sessions cleaned up`);
    }

    /**
     * Simple delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { WebBrowserService };
