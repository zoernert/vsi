const ContentAnalysisAgent = require('../../src/agents/ContentAnalysisAgent');
const ExternalContentService = require('../../src/services/externalContentService');

describe('ContentAnalysisAgent External Content Integration', () => {
    let agent;
    let mockExternalContentService;
    let mockApiClient;

    beforeEach(() => {
        // Mock API client
        mockApiClient = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            delete: jest.fn()
        };

        // Mock external content service
        mockExternalContentService = {
            searchContent: jest.fn(),
            analyzeContent: jest.fn(),
            searchAndAnalyzeContent: jest.fn()
        };

        // Create agent with external content enabled
        const config = {
            sessionId: 'test-session',
            query: 'artificial intelligence trends',
            frameworks: ['thematic', 'sentiment'],
            useExternalSources: true,
            externalContent: {
                enableWebSearch: true,
                enableWebBrowsing: true,
                maxExternalSources: 3
            }
        };

        agent = new ContentAnalysisAgent('test-agent', 'test-session', config, mockApiClient);
        
        // Inject mock external content service
        agent.externalContentService = mockExternalContentService;
        
        // Mock inherited methods
        agent.updateProgress = jest.fn();
        agent.waitForDependencies = jest.fn().mockResolvedValue();
        agent.getSharedMemory = jest.fn();
        agent.storeSharedMemory = jest.fn();
        agent.httpClient = mockApiClient;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('analyzeExternalContent', () => {
        it('should analyze external URLs successfully', async () => {
            const mockUrls = ['https://example.com/ai-trends', 'https://another-site.com/ai-research'];
            const mockAnalysis = {
                content: 'AI trends are rapidly evolving...',
                metadata: { title: 'AI Trends 2024', domain: 'example.com' }
            };

            mockExternalContentService.analyzeContent.mockResolvedValue(mockAnalysis);
            
            // Mock the analyzeContent method to return analysis results
            agent.analyzeContent = jest.fn().mockResolvedValue({
                themes: [{ theme: 'artificial intelligence', frequency: 5 }],
                insights: [{ text: 'AI is growing rapidly', confidence: 0.8 }]
            });

            const results = await agent.analyzeExternalContent(mockUrls, 'thematic');

            expect(mockExternalContentService.analyzeContent).toHaveBeenCalledTimes(2);
            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({
                url: mockUrls[0],
                source: 'external',
                extractedContent: mockAnalysis.content
            });
        });

        it('should handle URL analysis failures gracefully', async () => {
            const mockUrls = ['https://valid-site.com', 'https://invalid-site.com'];
            
            mockExternalContentService.analyzeContent
                .mockResolvedValueOnce({ content: 'Valid content' })
                .mockRejectedValueOnce(new Error('Network error'));

            agent.analyzeContent = jest.fn().mockResolvedValue({
                themes: [],
                insights: []
            });

            const results = await agent.analyzeExternalContent(mockUrls);

            expect(results).toHaveLength(1); // Only successful URL
            expect(results[0].url).toBe('https://valid-site.com');
        });

        it('should return null when external content service is not available', async () => {
            agent.externalContentService = null;

            const results = await agent.analyzeExternalContent(['https://example.com']);

            expect(results).toBeNull();
        });
    });

    describe('discoverExternalSources', () => {
        it('should discover external sources using search', async () => {
            const mockSearchResults = [
                { url: 'https://ai-news.com/trends', title: 'AI Trends' },
                { url: 'https://tech-blog.com/ai', title: 'AI Technology' }
            ];

            mockExternalContentService.searchContent.mockResolvedValue(mockSearchResults);

            const urls = await agent.discoverExternalSources('artificial intelligence', 2);

            expect(mockExternalContentService.searchContent).toHaveBeenCalledWith(
                'artificial intelligence',
                {
                    maxResults: 2,
                    extractContent: false,
                    rankResults: true
                }
            );
            expect(urls).toEqual([
                'https://ai-news.com/trends',
                'https://tech-blog.com/ai'
            ]);
        });

        it('should return empty array when search fails', async () => {
            mockExternalContentService.searchContent.mockRejectedValue(new Error('Search failed'));

            const urls = await agent.discoverExternalSources('test query');

            expect(urls).toEqual([]);
        });
    });

    describe('combineAnalysis', () => {
        beforeEach(() => {
            // Set up agent with some internal analysis data
            agent.themes = new Map([
                ['ai', { theme: 'ai', frequency: 3, sources: ['internal:doc1'], contexts: ['AI context'] }]
            ]);
            agent.insights = [
                { text: 'Internal insight', confidence: 0.7, source: 'internal' }
            ];
            agent.analyzedContent = [
                { source: { type: 'document' }, content: 'Internal content' }
            ];
        });

        it('should combine internal and external analysis results', async () => {
            const internalAnalysis = {
                themes: Array.from(agent.themes.values()),
                insights: agent.insights,
                sources: 1
            };

            const externalAnalysis = [
                {
                    url: 'https://example.com',
                    analysis: {
                        themes: [{ theme: 'machine learning', frequency: 2, contexts: ['ML context'] }],
                        insights: [{ text: 'External insight', confidence: 0.6 }]
                    },
                    extractedContent: 'External content',
                    metadata: { title: 'External Source' }
                }
            ];

            const combined = agent.combineAnalysis(internalAnalysis, externalAnalysis);

            expect(combined.themes).toHaveLength(2); // ai + machine learning
            expect(combined.insights).toHaveLength(2); // internal + external
            expect(combined.sources.internal).toBe(1);
            expect(combined.sources.external).toBe(1);
            expect(combined.sources.total).toBe(2);
        });

        it('should merge themes with same names', async () => {
            const internalAnalysis = {
                themes: [{ theme: 'ai', frequency: 3, sources: ['internal'] }],
                insights: [],
                sources: 1
            };

            const externalAnalysis = [
                {
                    url: 'https://example.com',
                    analysis: {
                        themes: [{ theme: 'ai', frequency: 2, contexts: ['External AI context'] }],
                        insights: []
                    }
                }
            ];

            agent.themes = new Map([
                ['ai', { theme: 'ai', frequency: 3, sources: ['internal'], contexts: ['Internal AI context'] }]
            ]);

            const combined = agent.combineAnalysis(internalAnalysis, externalAnalysis);

            expect(combined.themes).toHaveLength(1);
            expect(combined.themes[0].frequency).toBe(5); // 3 + 2
            expect(combined.themes[0].sources).toContain('external:https://example.com');
        });

        it('should handle empty external analysis', async () => {
            const internalAnalysis = {
                themes: Array.from(agent.themes.values()),
                insights: agent.insights,
                sources: 1
            };

            const combined = agent.combineAnalysis(internalAnalysis, []);

            expect(combined).toBe(internalAnalysis);
        });
    });

    describe('integration with performWork', () => {
        it('should include external content in main workflow when enabled', async () => {
            // Mock dependencies
            agent.performDeepContentAnalysis = jest.fn();
            agent.identifyKeyThemes = jest.fn();
            agent.extractInsights = jest.fn();
            agent.createAnalysisReport = jest.fn();
            
            agent.getSharedMemory.mockResolvedValue({
                query: 'test query',
                analysisType: 'thematic',
                externalUrls: ['https://example.com']
            });

            // Mock external analysis
            agent.analyzeExternalContent = jest.fn().mockResolvedValue([
                { url: 'https://example.com', analysis: { themes: [], insights: [] } }
            ]);
            agent.combineAnalysis = jest.fn().mockReturnValue({
                themes: [], insights: [], sources: { internal: 1, external: 1, total: 2 }
            });

            await agent.performWork();

            expect(agent.analyzeExternalContent).toHaveBeenCalledWith(
                ['https://example.com'],
                'thematic'
            );
            expect(agent.combineAnalysis).toHaveBeenCalled();
        });

        it('should discover external sources when none provided', async () => {
            // Mock dependencies
            agent.performDeepContentAnalysis = jest.fn();
            agent.identifyKeyThemes = jest.fn();
            agent.extractInsights = jest.fn();
            agent.createAnalysisReport = jest.fn();
            
            agent.getSharedMemory.mockResolvedValue({
                query: 'test query',
                analysisType: 'general',
                externalUrls: [] // No URLs provided
            });

            agent.discoverExternalSources = jest.fn().mockResolvedValue(['https://discovered.com']);
            agent.analyzeExternalContent = jest.fn().mockResolvedValue([]);

            await agent.performWork();

            expect(agent.discoverExternalSources).toHaveBeenCalledWith('test query', 3);
            expect(agent.analyzeExternalContent).toHaveBeenCalledWith(['https://discovered.com'], 'general');
        });

        it('should continue normally when external analysis fails', async () => {
            // Mock dependencies
            agent.performDeepContentAnalysis = jest.fn();
            agent.identifyKeyThemes = jest.fn();
            agent.extractInsights = jest.fn();
            agent.createAnalysisReport = jest.fn();
            
            agent.getSharedMemory.mockResolvedValue({ query: 'test query' });
            agent.discoverExternalSources = jest.fn().mockRejectedValue(new Error('External failed'));

            await agent.performWork();

            // Should complete normally despite external failure
            expect(agent.createAnalysisReport).toHaveBeenCalled();
            expect(agent.storeSharedMemory).toHaveBeenCalledWith(
                'content_analysis_completed',
                expect.objectContaining({
                    status: 'completed',
                    externalSourcesAnalyzed: 0
                })
            );
        });
    });
});
