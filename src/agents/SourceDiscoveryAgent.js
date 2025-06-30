const { BaseAgent } = require('./BaseAgent');

class SourceDiscoveryAgent extends BaseAgent {
    constructor(agentId, sessionId, config, apiClient, databaseService) {
        super(agentId, sessionId, config, apiClient, databaseService);
        this.discoveredSources = [];
        this.qualityThreshold = config.qualityThreshold || 0.6;
        this.maxSources = config.maxSources || 50;
        
        // External content service injection (optional)
        if (config.useExternalSources) {
            const WebSearchService = require('../services/webSearchService');
            this.webSearchService = new WebSearchService(config.externalContent?.search || {});
            console.log('🌐 External source discovery enabled');
        }
    }

    async performWork() {
        console.log(`🔍 Starting source discovery for query: ${this.config.query || 'Unknown'}`);
        
        this.updateProgress(10, 'Discovering relevant sources');
        await this.discoverRelevantSources();
        
        // External source discovery (if enabled)
        if (this.webSearchService) {
            this.updateProgress(30, 'Discovering external sources');
            await this.discoverExternalSources();
        }
        
        this.updateProgress(40, 'Evaluating source quality');
        await this.evaluateSourceQuality();
        
        this.updateProgress(70, 'Creating source bibliography');
        await this.createSourceBibliography();
        
        this.updateProgress(90, 'Analyzing source distribution');
        await this.analyzeSourceDistribution();
        
        this.updateProgress(100, 'Source discovery completed');
        
        // Store completion signal for dependent agents
        await this.storeSharedMemory('source_discovery_completed', {
            status: 'completed',
            timestamp: new Date(),
            sourceCount: this.discoveredSources.length,
            externalSourcesFound: this.discoveredSources.filter(s => s.type === 'external').length
        });
    }

    async discoverRelevantSources() {
        try {
            console.log(`🔎 Discovering sources across collections`);
            
            const query = this.config.query || this.config.inputs?.query;
            if (!query) {
                throw new Error('No search query provided');
            }
            
            // Get all available collections or use specified collections
            let collections = this.config.inputs?.collections;
            if (!collections) {
                const collectionsResponse = await this.httpClient.get('/api/collections');
                // The collections API returns a raw array, not a wrapped response
                collections = Array.isArray(collectionsResponse.data) ? collectionsResponse.data : [];
                console.log(`🗂️ Retrieved ${collections.length} collections from API`);
                console.log(`📋 Collections:`, collections.map(c => ({ id: c.id, name: c.name })));
            }
            
            console.log(`📚 Searching across ${collections.length} collections`);
            
            const searchResults = [];
            for (const collection of collections) {
                try {
                    console.log(`🔍 Search request for collection ${collection.id}`);
                    console.log(`🔍 Searching collection: ${collection.name || collection.id}`);
                    
                    const searchResponse = await this.httpClient.post(
                        `/api/collections/${collection.id}/search`,
                        {
                            query: query,
                            limit: Math.ceil(this.maxSources / collections.length),
                            includeMetadata: true
                        }
                    );
                    
                    if (searchResponse.data && searchResponse.data.data && searchResponse.data.data.results) {
                        const results = searchResponse.data.data.results;
                        
                        // Ensure results is an array before mapping
                        if (Array.isArray(results)) {
                            searchResults.push({
                                collection: {
                                    id: collection.id,
                                    name: collection.name || `Collection ${collection.id}`,
                                    relevanceScore: collection.relevanceScore || 1.0
                                },
                                results: results.map(result => ({
                                    ...result,
                                    collectionId: collection.id,
                                    collectionName: collection.name || `Collection ${collection.id}`,
                                    discoveredAt: new Date()
                                }))
                            });
                            
                            console.log(`✅ Found ${results.length} results in ${collection.name || collection.id}`);
                        } else {
                            console.warn(`⚠️ Search results for collection ${collection.id} is not an array:`, typeof results, results);
                        }
                    } else {
                        console.warn(`⚠️ Search response for collection ${collection.id} missing data.data.results:`, searchResponse.data);
                        console.log(`🔍 Expected: { data: { results: [...] } }, Got:`, searchResponse.data);
                    }
                } catch (error) {
                    console.warn(`⚠️ Search failed for collection ${collection.id}:`, error.message);
                    // Continue with other collections
                }
            }
            
            // Flatten and deduplicate results
            const allResults = searchResults.flatMap(sr => sr.results);
            const deduplicatedResults = this.deduplicateSources(allResults);
            
            console.log(`📊 Discovered ${allResults.length} sources, ${deduplicatedResults.length} after deduplication`);
            
            // Store discovery results
            await this.storeMemory('source_discovery', {
                searchResults,
                allSources: deduplicatedResults,
                query,
                discoveredAt: new Date(),
                stats: {
                    totalCollections: collections.length,
                    collectionsWithResults: searchResults.length,
                    totalSources: allResults.length,
                    uniqueSources: deduplicatedResults.length
                }
            });
            
            this.discoveredSources = deduplicatedResults;
            return deduplicatedResults;
        } catch (error) {
            console.error(`❌ Error discovering sources:`, error);
            throw error;
        }
    }

    deduplicateSources(sources) {
        const seen = new Set();
        const deduplicated = [];
        
        for (const source of sources) {
            // Create a deduplication key based on content or metadata
            let dedupeKey = '';
            
            if (source.metadata?.filename) {
                dedupeKey = source.metadata.filename;
            } else if (source.content) {
                // Use first 100 characters as deduplication key
                dedupeKey = source.content.substring(0, 100).trim();
            } else if (source.id) {
                dedupeKey = source.id;
            } else {
                dedupeKey = JSON.stringify(source).substring(0, 100);
            }
            
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                deduplicated.push({
                    ...source,
                    dedupeKey
                });
            }
        }
        
        return deduplicated;
    }

    async evaluateSourceQuality() {
        try {
            console.log(`📊 Evaluating quality of ${this.discoveredSources.length} sources`);
            
            const evaluatedSources = [];
            for (const source of this.discoveredSources) {
                const qualityScore = this.calculateSourceQuality(source);
                console.log(`📊 Source quality: ${qualityScore.toFixed(3)} (threshold: ${this.qualityThreshold}) for "${source.filename || source.id}"`);
                evaluatedSources.push({
                    ...source,
                    qualityScore,
                    qualityFactors: this.getQualityFactors(source, qualityScore)
                });
            }
            
            // Sort by quality score (highest first)
            evaluatedSources.sort((a, b) => b.qualityScore - a.qualityScore);
            
            // Filter by quality threshold
            const curatedSources = evaluatedSources.filter(s => s.qualityScore >= this.qualityThreshold);
            
            // Limit to max sources if specified
            const finalSources = curatedSources.slice(0, this.maxSources);
            
            console.log(`✅ Quality evaluation completed: ${finalSources.length}/${this.discoveredSources.length} sources meet quality threshold`);
            
            // Create quality evaluation artifact
            await this.createArtifact('source_evaluation', {
                totalSources: this.discoveredSources.length,
                evaluatedSources: evaluatedSources.length,
                curatedSources: curatedSources.length,
                finalSources: finalSources.length,
                qualityThreshold: this.qualityThreshold,
                averageQuality: evaluatedSources.reduce((sum, s) => sum + s.qualityScore, 0) / evaluatedSources.length,
                qualityDistribution: this.getQualityDistribution(evaluatedSources),
                sources: finalSources.map(source => ({
                    id: source.id,
                    collectionId: source.collectionId,
                    collectionName: source.collectionName,
                    qualityScore: source.qualityScore,
                    qualityFactors: source.qualityFactors,
                    score: source.score,
                    content: source.content?.substring(0, 500) + (source.content?.length > 500 ? '...' : ''),
                    metadata: source.metadata
                }))
            });
            
            // Store curated sources for other agents
            await this.storeSharedMemory('curated_sources', finalSources);
            
            return finalSources;
        } catch (error) {
            console.error(`❌ Error evaluating source quality:`, error);
            throw error;
        }
    }

    calculateSourceQuality(source) {
        let qualityScore = 0.0;
        const factors = [];
        
        // Factor 1: Search relevance score (40% weight)
        const relevanceScore = source.similarity || source.score || 0.5;
        qualityScore += relevanceScore * 0.4;
        factors.push({ name: 'relevance', score: relevanceScore, weight: 0.4 });
        
        // Factor 2: Content completeness (20% weight)
        const contentLength = source.content ? source.content.length : 0;
        const completenessScore = Math.min(1.0, contentLength / 1000); // Normalized to 1000 chars
        qualityScore += completenessScore * 0.2;
        factors.push({ name: 'completeness', score: completenessScore, weight: 0.2 });
        
        // Factor 3: Metadata richness (15% weight)
        const metadataScore = this.calculateMetadataRichness(source.metadata);
        qualityScore += metadataScore * 0.15;
        factors.push({ name: 'metadata', score: metadataScore, weight: 0.15 });
        
        // Factor 4: Collection relevance (15% weight)
        const collectionScore = source.collectionRelevanceScore || 0.8; // Default if not provided
        qualityScore += collectionScore * 0.15;
        factors.push({ name: 'collection', score: collectionScore, weight: 0.15 });
        
        // Factor 5: Recency (10% weight) - if available
        const recencyScore = this.calculateRecencyScore(source.metadata);
        qualityScore += recencyScore * 0.1;
        factors.push({ name: 'recency', score: recencyScore, weight: 0.1 });
        
        return Math.min(1.0, Math.max(0.0, qualityScore));
    }

    calculateMetadataRichness(metadata) {
        if (!metadata) return 0.2;
        
        const fields = ['filename', 'title', 'author', 'date', 'type', 'tags', 'summary'];
        const presentFields = fields.filter(field => metadata[field] && metadata[field] !== '');
        
        return presentFields.length / fields.length;
    }

    calculateRecencyScore(metadata) {
        if (!metadata || !metadata.date) return 0.5; // Default for unknown dates
        
        try {
            const sourceDate = new Date(metadata.date);
            const now = new Date();
            const daysDiff = (now - sourceDate) / (1000 * 60 * 60 * 24);
            
            // Recent sources (< 30 days) get higher scores
            if (daysDiff < 30) return 1.0;
            if (daysDiff < 90) return 0.8;
            if (daysDiff < 365) return 0.6;
            if (daysDiff < 1095) return 0.4; // 3 years
            return 0.2; // Older than 3 years
        } catch (error) {
            return 0.5; // Default for invalid dates
        }
    }

    getQualityFactors(source, qualityScore) {
        return {
            overall: qualityScore,
            relevance: source.score || 0.5,
            completeness: Math.min(1.0, (source.content?.length || 0) / 1000),
            metadata: this.calculateMetadataRichness(source.metadata),
            recency: this.calculateRecencyScore(source.metadata),
            collection: source.collectionRelevanceScore || 0.8
        };
    }

    getQualityDistribution(sources) {
        const distribution = {
            excellent: 0, // 0.9+
            good: 0,      // 0.7-0.89
            fair: 0,      // 0.5-0.69
            poor: 0       // <0.5
        };
        
        for (const source of sources) {
            if (source.qualityScore >= 0.9) distribution.excellent++;
            else if (source.qualityScore >= 0.7) distribution.good++;
            else if (source.qualityScore >= 0.5) distribution.fair++;
            else distribution.poor++;
        }
        
        return distribution;
    }

    async createSourceBibliography() {
        try {
            console.log(`📚 Creating source bibliography`);
            
            const curatedSources = await this.getSharedMemory('curated_sources');
            console.log(`🔍 Retrieved curated sources from memory:`, curatedSources);
            
            if (!curatedSources) {
                throw new Error('Curated sources not found - no memory entry');
            }
            
            if (!curatedSources.value) {
                console.log(`🔍 Curated sources structure:`, Object.keys(curatedSources));
                throw new Error('Curated sources not found - no value property');
            }
            
            const sources = curatedSources.value;
            console.log(`📋 Processing ${sources.length} curated sources for bibliography`);
            
            // Group sources by collection
            const sourcesByCollection = {};
            for (const source of sources) {
                const collectionName = source.collectionName || 'Unknown Collection';
                if (!sourcesByCollection[collectionName]) {
                    sourcesByCollection[collectionName] = [];
                }
                sourcesByCollection[collectionName].push(source);
            }
            
            // Create bibliography entries
            const bibliography = {
                totalSources: sources.length,
                collections: Object.keys(sourcesByCollection).length,
                entries: [],
                statistics: {
                    averageQuality: sources.reduce((sum, s) => sum + s.qualityScore, 0) / sources.length,
                    qualityRange: {
                        min: Math.min(...sources.map(s => s.qualityScore)),
                        max: Math.max(...sources.map(s => s.qualityScore))
                    },
                    contentLength: {
                        total: sources.reduce((sum, s) => sum + (s.content?.length || 0), 0),
                        average: sources.reduce((sum, s) => sum + (s.content?.length || 0), 0) / sources.length
                    }
                },
                createdAt: new Date()
            };
            
            // Create formatted bibliography entries
            for (const [collectionName, collectionSources] of Object.entries(sourcesByCollection)) {
                const collectionEntry = {
                    collection: collectionName,
                    sourceCount: collectionSources.length,
                    averageQuality: collectionSources.reduce((sum, s) => sum + s.qualityScore, 0) / collectionSources.length,
                    sources: collectionSources.map((source, index) => ({
                        id: source.id,
                        index: index + 1,
                        citation: this.formatCitation(source),
                        qualityScore: source.qualityScore,
                        excerpt: this.createExcerpt(source.content),
                        metadata: source.metadata
                    }))
                };
                
                bibliography.entries.push(collectionEntry);
            }
            
            // Create bibliography artifact
            await this.createArtifact('source_bibliography', bibliography);
            
            console.log(`✅ Bibliography created with ${bibliography.totalSources} sources across ${bibliography.collections} collections`);
            return bibliography;
        } catch (error) {
            console.error(`❌ Error creating source bibliography:`, error);
            throw error;
        }
    }

    formatCitation(source) {
        // Create a simple citation format
        const metadata = source.metadata || {};
        const parts = [];
        
        // Author
        if (metadata.author) {
            parts.push(metadata.author);
        }
        
        // Title
        if (metadata.title) {
            parts.push(`"${metadata.title}"`);
        } else if (metadata.filename) {
            parts.push(`"${metadata.filename}"`);
        }
        
        // Collection
        if (source.collectionName) {
            parts.push(`in ${source.collectionName}`);
        }
        
        // Date
        if (metadata.date) {
            parts.push(`(${metadata.date})`);
        }
        
        // Quality indicator
        parts.push(`[Quality: ${(source.qualityScore * 100).toFixed(0)}%]`);
        
        return parts.length > 0 ? parts.join(', ') : `Source ${source.id}`;
    }

    createExcerpt(content, maxLength = 200) {
        if (!content) return 'No content available';
        
        if (content.length <= maxLength) {
            return content;
        }
        
        // Find a good breaking point (end of sentence)
        const truncated = content.substring(0, maxLength);
        const lastSentence = truncated.lastIndexOf('.');
        
        if (lastSentence > maxLength * 0.7) { // If we have a good sentence break
            return truncated.substring(0, lastSentence + 1) + '...';
        } else {
            return truncated + '...';
        }
    }

    async analyzeSourceDistribution() {
        try {
            console.log(`📈 Analyzing source distribution patterns`);
            
            const discoveryData = await this.retrieveMemory('source_discovery');
            const curatedSources = await this.getSharedMemory('curated_sources');
            
            if (!discoveryData || !curatedSources) {
                throw new Error('Required data for distribution analysis not found');
            }
            
            const sources = curatedSources.value;
            
            if (!Array.isArray(sources)) {
                throw new Error('Curated sources is not an array');
            }
            
            console.log(`📊 Analyzing distribution for ${sources.length} sources`);
            
            // Analyze distribution across collections
            const collectionDistribution = this.analyzeCollectionDistribution(sources);
            
            // Analyze quality distribution
            const qualityDistribution = this.analyzeQualityDistribution(sources);
            
            // Analyze content patterns
            const contentPatterns = this.analyzeContentPatterns(sources);
            
            // Try to get cluster information if available
            let clusterAnalysis = null;
            try {
                const clustersResponse = await this.getClusters();
                if (clustersResponse.success) {
                    clusterAnalysis = await this.analyzeSourceClusters(sources, clustersResponse.data);
                }
            } catch (error) {
                console.warn(`⚠️ Cluster analysis not available:`, error.message);
            }
            
            const distributionAnalysis = {
                summary: {
                    totalSources: sources.length,
                    uniqueCollections: Object.keys(collectionDistribution).length,
                    averageQuality: sources.reduce((sum, s) => sum + s.qualityScore, 0) / sources.length,
                    analysisTimestamp: new Date()
                },
                collectionDistribution,
                qualityDistribution,
                contentPatterns,
                clusterAnalysis,
                recommendations: this.generateSourceRecommendations(sources, collectionDistribution, qualityDistribution)
            };
            
            // Create distribution analysis artifact
            await this.createArtifact('source_distribution_analysis', distributionAnalysis);
            
            console.log(`✅ Source distribution analysis completed`);
            return distributionAnalysis;
        } catch (error) {
            console.error(`❌ Error analyzing source distribution:`, error);
            throw error;
        }
    }

    analyzeCollectionDistribution(sources) {
        const distribution = {};
        
        for (const source of sources) {
            const collectionName = source.collectionName || 'Unknown';
            if (!distribution[collectionName]) {
                distribution[collectionName] = {
                    count: 0,
                    totalQuality: 0,
                    avgQuality: 0,
                    sources: []
                };
            }
            
            distribution[collectionName].count++;
            distribution[collectionName].totalQuality += source.qualityScore;
            distribution[collectionName].sources.push(source.id);
        }
        
        // Calculate averages
        for (const collection of Object.values(distribution)) {
            collection.avgQuality = collection.totalQuality / collection.count;
        }
        
        return distribution;
    }

    analyzeQualityDistribution(sources) {
        const distribution = {
            ranges: {
                '0.9-1.0': 0,
                '0.8-0.9': 0,
                '0.7-0.8': 0,
                '0.6-0.7': 0,
                '0.5-0.6': 0,
                '0.0-0.5': 0
            },
            statistics: {
                mean: 0,
                median: 0,
                stdDev: 0,
                min: 1,
                max: 0
            }
        };
        
        // Count ranges
        for (const source of sources) {
            const score = source.qualityScore;
            if (score >= 0.9) distribution.ranges['0.9-1.0']++;
            else if (score >= 0.8) distribution.ranges['0.8-0.9']++;
            else if (score >= 0.7) distribution.ranges['0.7-0.8']++;
            else if (score >= 0.6) distribution.ranges['0.6-0.7']++;
            else if (score >= 0.5) distribution.ranges['0.5-0.6']++;
            else distribution.ranges['0.0-0.5']++;
        }
        
        // Calculate statistics
        const scores = sources.map(s => s.qualityScore);
        distribution.statistics.mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        distribution.statistics.min = Math.min(...scores);
        distribution.statistics.max = Math.max(...scores);
        
        // Median
        const sortedScores = [...scores].sort((a, b) => a - b);
        const mid = Math.floor(sortedScores.length / 2);
        distribution.statistics.median = sortedScores.length % 2 === 0 
            ? (sortedScores[mid - 1] + sortedScores[mid]) / 2 
            : sortedScores[mid];
        
        // Standard deviation
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - distribution.statistics.mean, 2), 0) / scores.length;
        distribution.statistics.stdDev = Math.sqrt(variance);
        
        return distribution;
    }

    analyzeContentPatterns(sources) {
        const patterns = {
            contentTypes: {},
            averageLength: 0,
            lengthDistribution: {
                short: 0,    // < 500 chars
                medium: 0,   // 500-2000 chars
                long: 0,     // 2000-5000 chars
                veryLong: 0  // > 5000 chars
            },
            commonTerms: this.extractCommonTerms(sources)
        };
        
        let totalLength = 0;
        
        for (const source of sources) {
            const contentLength = source.content ? source.content.length : 0;
            totalLength += contentLength;
            
            // Content type from metadata
            const contentType = source.metadata?.type || 'unknown';
            patterns.contentTypes[contentType] = (patterns.contentTypes[contentType] || 0) + 1;
            
            // Length distribution
            if (contentLength < 500) patterns.lengthDistribution.short++;
            else if (contentLength < 2000) patterns.lengthDistribution.medium++;
            else if (contentLength < 5000) patterns.lengthDistribution.long++;
            else patterns.lengthDistribution.veryLong++;
        }
        
        patterns.averageLength = totalLength / sources.length;
        
        return patterns;
    }

    extractCommonTerms(sources, topN = 10) {
        const termFreq = {};
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those']);
        
        for (const source of sources) {
            if (!source.content) continue;
            
            const words = source.content
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.has(word));
            
            for (const word of words) {
                termFreq[word] = (termFreq[word] || 0) + 1;
            }
        }
        
        return Object.entries(termFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, topN)
            .map(([term, freq]) => ({ term, frequency: freq }));
    }

    async analyzeSourceClusters(sources, clusters) {
        // Analyze how sources distribute across existing clusters
        const clusterAnalysis = {
            clusterDistribution: {},
            bridgeAnalysis: {},
            clusterQuality: {}
        };
        
        // This is a simplified cluster analysis
        // In a real implementation, this would use the actual clustering service
        
        return clusterAnalysis;
    }

    generateSourceRecommendations(sources, collectionDist, qualityDist) {
        const recommendations = [];
        
        // Quality recommendations
        const lowQualityCount = qualityDist.ranges['0.0-0.5'] + qualityDist.ranges['0.5-0.6'];
        const totalSources = sources.length;
        
        if (lowQualityCount / totalSources > 0.3) {
            recommendations.push({
                type: 'quality',
                priority: 'high',
                message: `${Math.round((lowQualityCount / totalSources) * 100)}% of sources have low quality scores. Consider refining search criteria or expanding to additional collections.`
            });
        }
        
        // Coverage recommendations
        const collectionCount = Object.keys(collectionDist).length;
        if (collectionCount < 3) {
            recommendations.push({
                type: 'coverage',
                priority: 'medium',
                message: `Sources found in only ${collectionCount} collections. Consider expanding search to improve coverage.`
            });
        }
        
        // Diversity recommendations
        const maxCollectionSources = Math.max(...Object.values(collectionDist).map(c => c.count));
        if (maxCollectionSources / totalSources > 0.7) {
            recommendations.push({
                type: 'diversity',
                priority: 'medium',
                message: 'Sources are heavily concentrated in one collection. Consider balancing sources across collections for better perspective.'
            });
        }
        
        // Success indicators
        if (qualityDist.statistics.mean > 0.7) {
            recommendations.push({
                type: 'success',
                priority: 'info',
                message: `Good source quality achieved with average score of ${(qualityDist.statistics.mean * 100).toFixed(0)}%.`
            });
        }
        
        return recommendations;
    }

    async storeSharedMemory(key, value) {
        // Store memory that can be accessed by other agents
        // This would integrate with the AgentMemoryService
        console.log(`💾 Storing shared memory: ${key}`);
        return await this.storeMemory(`shared_${key}`, value, { scope: 'shared' });
    }

    async getSharedMemory(key) {
        // Retrieve memory stored by other agents
        return await this.retrieveMemory(`shared_${key}`);
    }

    async discoverExternalSources() {
        if (!this.webSearchService) {
            return;
        }

        try {
            console.log('🌐 Discovering external sources');
            
            const query = this.config.query || this.config.inputs?.query;
            if (!query) {
                console.warn('⚠️ No query available for external source discovery');
                return;
            }

            const maxExternalSources = this.config.externalContent?.maxExternalSources || 5;
            
            // Perform web search
            const searchResults = await this.webSearchService.search(query, {
                maxResults: maxExternalSources,
                rankResults: true
            });

            if (searchResults && searchResults.length > 0) {
                console.log(`🔍 Found ${searchResults.length} external sources`);
                
                // Convert web search results to source format
                for (const result of searchResults) {
                    const externalSource = {
                        id: `external_${result.url.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        filename: result.title || 'External Source',
                        content: result.snippet || result.description || '',
                        metadata: {
                            url: result.url,
                            title: result.title,
                            snippet: result.snippet,
                            domain: new URL(result.url).hostname,
                            source: result.source || 'web_search',
                            type: 'external',
                            discoveredAt: new Date(),
                            relevanceScore: result.score || 0.5
                        },
                        type: 'external',
                        source: 'web_search',
                        collectionId: 'external',
                        collectionName: 'External Web Sources'
                    };

                    this.discoveredSources.push(externalSource);
                }
                
                console.log(`✅ Added ${searchResults.length} external sources to discovery results`);
            } else {
                console.log('📭 No external sources found');
            }
            
        } catch (error) {
            console.warn(`⚠️ External source discovery failed:`, error.message);
            // Don't throw - continue with internal sources only
        }
    }
}

module.exports = { SourceDiscoveryAgent };
