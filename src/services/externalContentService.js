const { WebBrowserService } = require('./webBrowserService');
const { WebSearchService } = require('./webSearchService');

/**
 * ExternalContentService - Orchestrates web search and browsing services
 * Provides unified external content interface for agents
 */
class ExternalContentService {
    constructor(config = {}) {
        this.config = {
            enableWebSearch: config.enableWebSearch || false,
            enableWebBrowsing: config.enableWebBrowsing || false,
            maxExternalSources: config.maxExternalSources || 5,
            contentAnalysisPrompts: {
                themes: "What are the main themes, topics, and key concepts discussed on this webpage? Provide a structured analysis of the content themes and their relationships.",
                sentiment: "Analyze the sentiment and emotional tone of this webpage content. Identify positive, negative, or neutral sentiment and provide specific examples from the text.",
                entities: "Extract and list all important entities mentioned on this page including people, organizations, locations, dates, products, and key terms. Organize them by category.",
                summary: "Provide a comprehensive summary of this webpage's content, highlighting the main points, key information, and conclusions. Include any important statistics or facts.",
                general: "Analyze this webpage and provide comprehensive insights about its content, themes, sentiment, key entities, and main points. Focus on factual information and key concepts.",
                ...config.contentAnalysisPrompts
            },
            ...config
        };

        // Initialize services based on configuration
        this.webBrowserService = null;
        this.webSearchService = null;

        if (this.config.enableWebBrowsing) {
            this.webBrowserService = config.webBrowserService || new WebBrowserService(config.browser || {});
        }

        if (this.config.enableWebSearch) {
            this.webSearchService = config.webSearchService || new WebSearchService(config.search || {});
        }

        // Statistics tracking
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            lastActivity: null
        };
    }

    /**
     * Check if external content services are available
     */
    isEnabled() {
        return this.config.enableWebSearch || this.config.enableWebBrowsing;
    }

    /**
     * Enhanced source discovery with external sources
     */
    async enhanceSourceDiscovery(internalSources, query, options = {}) {
        if (!this.isEnabled()) {
            console.log('🔒 External content services disabled');
            return {
                internal: internalSources,
                external: [],
                combined: internalSources,
                metadata: { externalSourcesEnabled: false }
            };
        }

        const startTime = Date.now();
        console.log(`🌐 Enhancing source discovery with external sources for query: "${query}"`);

        try {
            const externalSources = [];
            const errors = [];

            // Web search for additional sources
            if (this.webSearchService) {
                try {
                    console.log(`🔍 Searching for external sources`);
                    const searchResult = await this.webSearchService.search(query, {
                        maxResults: Math.min(this.config.maxExternalSources, 10),
                        ...options.searchOptions
                    });

                    if (searchResult.success && searchResult.results.length > 0) {
                        const searchSources = searchResult.results.map(result => ({
                            id: `external_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            title: result.title,
                            url: result.url,
                            description: result.description,
                            source: 'web_search',
                            provider: searchResult.provider,
                            relevanceScore: result.finalRelevanceScore || result.relevanceScore || 0.5,
                            type: 'external',
                            discoveredAt: new Date().toISOString(),
                            metadata: {
                                searchQuery: query,
                                searchProvider: searchResult.provider
                            }
                        }));

                        externalSources.push(...searchSources);
                        console.log(`✅ Found ${searchSources.length} external sources via web search`);
                    }
                } catch (error) {
                    console.error(`❌ Web search failed:`, error.message);
                    errors.push({ service: 'web_search', error: error.message });
                }
            }

            // Add specific URLs if provided
            if (options.externalUrls && Array.isArray(options.externalUrls)) {
                const urlSources = options.externalUrls.map(url => ({
                    id: `external_url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: this.extractTitleFromUrl(url),
                    url: url,
                    description: `User-specified external source: ${url}`,
                    source: 'user_provided',
                    relevanceScore: 0.8, // High relevance for user-provided URLs
                    type: 'external',
                    discoveredAt: new Date().toISOString(),
                    metadata: {
                        userProvided: true
                    }
                }));

                externalSources.push(...urlSources);
                console.log(`✅ Added ${urlSources.length} user-provided external sources`);
            }

            // Limit total external sources
            const limitedExternalSources = externalSources.slice(0, this.config.maxExternalSources);

            const duration = Date.now() - startTime;
            this.updateStats(true, duration);

            return {
                internal: internalSources,
                external: limitedExternalSources,
                combined: [...internalSources, ...limitedExternalSources],
                metadata: {
                    externalSourcesEnabled: true,
                    searchPerformed: !!this.webSearchService,
                    userUrlsAdded: options.externalUrls?.length || 0,
                    totalExternalSources: limitedExternalSources.length,
                    discoveryDuration: duration,
                    errors: errors.length > 0 ? errors : undefined,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error(`❌ External source discovery failed:`, error.message);
            const duration = Date.now() - startTime;
            this.updateStats(false, duration);

            return {
                internal: internalSources,
                external: [],
                combined: internalSources,
                metadata: {
                    externalSourcesEnabled: true,
                    error: error.message,
                    duration,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Analyze external content from URLs
     */
    async analyzeExternalContent(urls, analysisType = 'general', options = {}) {
        if (!this.webBrowserService) {
            throw new Error('Web browsing service not available');
        }

        if (!Array.isArray(urls) || urls.length === 0) {
            return {
                type: 'external_analysis',
                sources: [],
                summary: { totalAnalyzed: 0, successful: 0, failed: 0 }
            };
        }

        const startTime = Date.now();
        console.log(`🔬 Analyzing ${urls.length} external sources with ${analysisType} analysis`);

        const results = [];
        const maxUrls = Math.min(urls.length, this.config.maxExternalSources);

        // Process URLs with controlled concurrency
        const concurrency = Math.min(3, maxUrls); // Max 3 concurrent analyses
        const chunks = this.chunkArray(urls.slice(0, maxUrls), concurrency);

        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (url) => {
                try {
                    console.log(`🌐 Analyzing external content: ${url}`);
                    const analysis = await this.webBrowserService.analyzeWebContent(url, analysisType);

                    if (analysis.success && analysis.content) {
                        return {
                            source: url,
                            analysis: this.parseWebAnalysis(analysis.content, analysisType),
                            type: 'external_web',
                            timestamp: analysis.timestamp,
                            duration: analysis.duration,
                            success: true,
                            metadata: analysis.metadata
                        };
                    } else {
                        return {
                            source: url,
                            analysis: null,
                            type: 'external_web',
                            timestamp: analysis.timestamp,
                            duration: analysis.duration,
                            success: false,
                            error: analysis.error || 'No content extracted',
                            metadata: analysis.metadata
                        };
                    }
                } catch (error) {
                    console.error(`❌ Failed to analyze ${url}:`, error.message);
                    return {
                        source: url,
                        analysis: null,
                        type: 'external_web',
                        timestamp: new Date().toISOString(),
                        success: false,
                        error: error.message
                    };
                }
            });

            const chunkResults = await Promise.allSettled(chunkPromises);
            results.push(...chunkResults.map(result => 
                result.status === 'fulfilled' ? result.value : {
                    source: 'unknown',
                    analysis: null,
                    type: 'external_web',
                    success: false,
                    error: result.reason.message || 'Analysis failed'
                }
            ));

            // Small delay between chunks to be respectful to external services
            if (chunks.length > 1) {
                await this.delay(2000);
            }
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        const duration = Date.now() - startTime;
        this.updateStats(successful.length > 0, duration);

        return {
            type: 'external_analysis',
            sources: results,
            summary: {
                totalAnalyzed: results.length,
                successful: successful.length,
                failed: failed.length,
                analysisType,
                duration,
                themes: this.extractCombinedThemes(successful),
                entities: this.extractCombinedEntities(successful),
                avgRelevance: this.calculateAverageRelevance(successful)
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Search and analyze external content in one operation
     */
    async searchAndAnalyze(query, analysisType = 'general', options = {}) {
        if (!this.webSearchService || !this.webBrowserService) {
            throw new Error('Both web search and browsing services required for search and analyze');
        }

        console.log(`🔍🔬 Searching and analyzing external content for: "${query}"`);

        try {
            // First, search for relevant content
            const searchResult = await this.webSearchService.search(query, {
                maxResults: this.config.maxExternalSources,
                ...options.searchOptions
            });

            if (!searchResult.success || searchResult.results.length === 0) {
                return {
                    query,
                    searchResult,
                    analysis: {
                        type: 'external_analysis',
                        sources: [],
                        summary: { totalAnalyzed: 0, successful: 0, failed: 0 }
                    },
                    success: false,
                    error: 'No search results found'
                };
            }

            // Extract URLs from search results
            const urls = searchResult.results.map(result => result.url);

            // Analyze the content from found URLs
            const analysis = await this.analyzeExternalContent(urls, analysisType, options);

            return {
                query,
                searchResult,
                analysis,
                success: true,
                metadata: {
                    searchProvider: searchResult.provider,
                    searchDuration: searchResult.metadata?.duration,
                    analysisDuration: analysis.duration,
                    totalDuration: (searchResult.metadata?.duration || 0) + analysis.duration
                }
            };

        } catch (error) {
            console.error(`❌ Search and analyze failed for "${query}":`, error.message);
            return {
                query,
                searchResult: null,
                analysis: null,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Perform comprehensive research combining web search and content analysis
     * @param {string} query - Research query
     * @param {Object} options - Research options
     * @returns {Object} Comprehensive research results
     */
    async performComprehensiveResearch(query, options = {}) {
        if (!this.isEnabled()) {
            console.log('🚫 External content services disabled, returning empty results');
            return {
                query: query,
                enabled: false,
                searchResults: [],
                contentAnalysis: [],
                summary: 'External content services are disabled.',
                statistics: this.getStatistics()
            };
        }

        const startTime = Date.now();
        this.stats.totalRequests++;

        try {
            console.log(`🔍 Starting comprehensive research for: "${query}"`);
            
            const results = {
                query: query,
                enabled: true,
                searchResults: [],
                contentAnalysis: [],
                summary: '',
                statistics: {}
            };

            // Phase 1: Web search (if enabled)
            if (this.config.enableWebSearch && this.webSearchService) {
                console.log('🌐 Performing web search...');
                try {
                    const searchResults = await this.webSearchService.search(query, {
                        maxResults: this.config.maxExternalSources
                    });
                    results.searchResults = searchResults || [];
                    console.log(`✅ Found ${results.searchResults.length} search results`);
                } catch (searchError) {
                    console.warn('⚠️ Web search failed:', searchError.message);
                }
            }

            // Phase 2: Content analysis (if enabled and we have URLs)
            if (this.config.enableWebBrowsing && this.webBrowserService && results.searchResults.length > 0) {
                console.log('📖 Analyzing content from search results...');
                const analysisPromises = results.searchResults.slice(0, 3).map(async (result) => {
                    try {
                        const analysis = await this.webBrowserService.analyzeWebContent(
                            result.url,
                            options.analysisType || 'general'
                        );
                        return {
                            url: result.url,
                            title: result.title,
                            analysis: analysis
                        };
                    } catch (analysisError) {
                        console.warn(`⚠️ Content analysis failed for ${result.url}:`, analysisError.message);
                        return null;
                    }
                });

                const analysisResults = await Promise.all(analysisPromises);
                results.contentAnalysis = analysisResults.filter(Boolean);
                console.log(`✅ Analyzed ${results.contentAnalysis.length} web pages`);
            }

            // Phase 3: Generate summary
            if (results.searchResults.length > 0 || results.contentAnalysis.length > 0) {
                results.summary = `Research found ${results.searchResults.length} relevant sources${results.contentAnalysis.length > 0 ? ` with detailed analysis of ${results.contentAnalysis.length} pages` : ''}.`;
            } else {
                results.summary = 'No external sources found or analysis could not be performed.';
            }

            const duration = Date.now() - startTime;
            this.stats.successfulRequests++;
            this.updateAverageResponseTime(duration);
            this.stats.lastActivity = new Date();

            results.statistics = {
                duration: duration,
                searchResultsCount: results.searchResults.length,
                analyzedPagesCount: results.contentAnalysis.length,
                ...this.getStatistics()
            };

            console.log(`✅ Comprehensive research completed in ${duration}ms`);
            return results;

        } catch (error) {
            this.stats.failedRequests++;
            console.error('❌ Comprehensive research failed:', error);
            throw error;
        }
    }

    /**
     * Parse web analysis results into structured data
     */
    parseWebAnalysis(rawContent, analysisType) {
        if (!rawContent) return null;

        const analysis = {
            rawContent: rawContent,
            analysisType,
            themes: this.extractThemes(rawContent),
            sentiment: this.extractSentiment(rawContent),
            entities: this.extractEntities(rawContent),
            keyPoints: this.extractKeyPoints(rawContent),
            summary: this.extractSummary(rawContent)
        };

        return analysis;
    }

    /**
     * Extract themes from content (simplified NLP)
     */
    extractThemes(content) {
        if (!content) return [];

        const themes = [];
        const commonThemes = [
            'technology', 'business', 'science', 'politics', 'health', 'education',
            'environment', 'innovation', 'research', 'development', 'analysis',
            'market', 'strategy', 'data', 'artificial intelligence', 'machine learning'
        ];

        commonThemes.forEach(theme => {
            const regex = new RegExp(`\\b${theme}\\b`, 'gi');
            const matches = content.match(regex);
            if (matches && matches.length > 0) {
                themes.push({
                    theme: theme,
                    frequency: matches.length,
                    confidence: Math.min(1.0, matches.length / 10)
                });
            }
        });

        return themes.sort((a, b) => b.frequency - a.frequency).slice(0, 5);
    }

    /**
     * Extract sentiment (simplified)
     */
    extractSentiment(content) {
        if (!content) return null;

        const positiveWords = ['good', 'great', 'excellent', 'positive', 'beneficial', 'successful', 'innovative'];
        const negativeWords = ['bad', 'poor', 'negative', 'problem', 'issue', 'failure', 'difficult'];

        const words = content.toLowerCase().split(/\W+/);
        const positiveCount = words.filter(word => positiveWords.includes(word)).length;
        const negativeCount = words.filter(word => negativeWords.includes(word)).length;

        const total = positiveCount + negativeCount;
        if (total === 0) return { overall: 'neutral', confidence: 0.5 };

        const sentiment = positiveCount > negativeCount ? 'positive' : 
                         negativeCount > positiveCount ? 'negative' : 'neutral';

        return {
            overall: sentiment,
            confidence: Math.abs(positiveCount - negativeCount) / total,
            positiveCount,
            negativeCount
        };
    }

    /**
     * Extract entities (simplified)
     */
    extractEntities(content) {
        if (!content) return [];

        const entities = [];
        
        // Extract capitalized words (potential proper nouns)
        const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g) || [];
        const entityCounts = {};
        
        capitalizedWords.forEach(word => {
            if (word.length > 2) {
                entityCounts[word] = (entityCounts[word] || 0) + 1;
            }
        });

        Object.entries(entityCounts)
            .filter(([word, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([entity, frequency]) => {
                entities.push({
                    entity,
                    frequency,
                    type: 'named_entity' // Simplified classification
                });
            });

        return entities;
    }

    /**
     * Extract key points (simplified)
     */
    extractKeyPoints(content) {
        if (!content) return [];

        // Extract sentences that might be key points
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        return sentences
            .slice(0, 5) // Take first 5 sentences as key points
            .map((sentence, index) => ({
                point: sentence.trim(),
                position: index + 1,
                importance: 1.0 - (index * 0.1) // Decreasing importance
            }));
    }

    /**
     * Extract summary (simplified)
     */
    extractSummary(content) {
        if (!content) return '';

        // Simple summary: first 200 characters + last 100 characters
        if (content.length <= 300) return content;

        const start = content.substring(0, 200);
        const end = content.substring(content.length - 100);
        
        return `${start}...${end}`;
    }

    /**
     * Helper methods
     */
    extractTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            const path = urlObj.pathname.replace(/\/$/, '');
            return path ? `${domain}${path}` : domain;
        } catch {
            return url;
        }
    }

    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    extractCombinedThemes(results) {
        const allThemes = results
            .filter(r => r.analysis?.themes)
            .flatMap(r => r.analysis.themes);
        
        const themeMap = {};
        allThemes.forEach(theme => {
            const key = theme.theme || theme.category;
            if (key) {
                themeMap[key] = (themeMap[key] || 0) + (theme.frequency || 1);
            }
        });

        return Object.entries(themeMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([theme, frequency]) => ({ theme, frequency }));
    }

    extractCombinedEntities(results) {
        const allEntities = results
            .filter(r => r.analysis?.entities)
            .flatMap(r => r.analysis.entities);
        
        const entityMap = {};
        allEntities.forEach(entity => {
            const key = entity.entity || entity.name;
            if (key) {
                entityMap[key] = (entityMap[key] || 0) + (entity.frequency || 1);
            }
        });

        return Object.entries(entityMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([entity, frequency]) => ({ entity, frequency }));
    }

    calculateAverageRelevance(results) {
        if (results.length === 0) return 0;
        
        const relevanceScores = results
            .map(r => r.analysis?.relevance || 0.5)
            .filter(score => score > 0);
        
        return relevanceScores.length > 0 ? 
            relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length : 0.5;
    }

    updateStats(success, duration) {
        this.stats.totalRequests++;
        if (success) {
            this.stats.successfulRequests++;
        } else {
            this.stats.failedRequests++;
        }
        
        // Update average response time
        this.stats.averageResponseTime = 
            (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + duration) / 
            this.stats.totalRequests;
        
        this.stats.lastActivity = new Date().toISOString();
    }

    /**
     * Get service statistics
     */
    getStatistics() {
        return {
            totalRequests: this.stats.totalRequests,
            successfulRequests: this.stats.successfulRequests,
            failedRequests: this.stats.failedRequests,
            successRate: this.stats.totalRequests > 0 ? 
                (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%',
            averageResponseTime: Math.round(this.stats.averageResponseTime),
            lastActivity: this.stats.lastActivity,
            servicesEnabled: {
                webSearch: !!this.webSearchService,
                webBrowsing: !!this.webBrowserService
            }
        };
    }

    /**
     * Update average response time
     */
    updateAverageResponseTime(newTime) {
        if (this.stats.totalRequests === 1) {
            this.stats.averageResponseTime = newTime;
        } else {
            // Calculate running average
            this.stats.averageResponseTime = 
                (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + newTime) / 
                this.stats.totalRequests;
        }
    }

    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            enabled: this.isEnabled(),
            services: {
                webSearch: {
                    enabled: this.config.enableWebSearch,
                    available: !!this.webSearchService,
                    status: this.webSearchService?.getStatus()
                },
                webBrowsing: {
                    enabled: this.config.enableWebBrowsing,
                    available: !!this.webBrowserService,
                    status: this.webBrowserService?.getStatus()
                }
            },
            configuration: {
                maxExternalSources: this.config.maxExternalSources,
                analysisTypes: Object.keys(this.config.contentAnalysisPrompts)
            },
            statistics: this.stats
        };
    }

    /**
     * Cleanup all active sessions and resources
     */
    async cleanup() {
        console.log('🧹 Cleaning up ExternalContentService');
        
        if (this.webBrowserService) {
            await this.webBrowserService.cleanupAllSessions();
        }
        
        if (this.webSearchService) {
            this.webSearchService.clearCache();
        }
        
        console.log('✅ ExternalContentService cleanup completed');
    }
}

module.exports = { ExternalContentService };
