const ExternalContentService = require('../../src/services/externalContentService');

describe('ExternalContentService', () => {
    let mockWebBrowserService;
    let mockWebSearchService;
    let externalContentService;

    beforeEach(() => {
        // Mock WebBrowserService
        mockWebBrowserService = {
            analyzeWebContent: jest.fn(),
            searchAndAnalyze: jest.fn(),
            createSession: jest.fn(),
            cleanupSession: jest.fn(),
            enabled: true
        };

        // Mock WebSearchService  
        mockWebSearchService = {
            search: jest.fn(),
            searchWithContent: jest.fn(),
            enabled: true
        };

        externalContentService = new ExternalContentService({
            webBrowserService: mockWebBrowserService,
            webSearchService: mockWebSearchService,
            enableWebSearch: true,
            enableWebBrowsing: true,
            maxExternalSources: 5
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('searchContent', () => {
        it('should search for content using web search service', async () => {
            const mockResults = [
                { url: 'https://example.com', title: 'Test', snippet: 'Test content' }
            ];
            mockWebSearchService.search.mockResolvedValue(mockResults);

            const results = await externalContentService.searchContent('test query');

            expect(mockWebSearchService.search).toHaveBeenCalledWith('test query', {
                maxResults: 5,
                extractContent: false,
                rankResults: true
            });
            expect(results).toEqual(mockResults);
        });

        it('should handle search service errors gracefully', async () => {
            mockWebSearchService.search.mockRejectedValue(new Error('Search failed'));

            const results = await externalContentService.searchContent('test query');

            expect(results).toEqual([]);
        });

        it('should return empty array when web search is disabled', async () => {
            externalContentService.config.enableWebSearch = false;

            const results = await externalContentService.searchContent('test query');

            expect(mockWebSearchService.search).not.toHaveBeenCalled();
            expect(results).toEqual([]);
        });
    });

    describe('analyzeContent', () => {
        it('should analyze content using web browser service', async () => {
            const mockAnalysis = {
                content: 'Analyzed content',
                metadata: { title: 'Test Page' },
                analysis: { themes: ['test'], sentiment: 'positive' }
            };
            mockWebBrowserService.analyzeWebContent.mockResolvedValue(mockAnalysis);

            const result = await externalContentService.analyzeContent('https://example.com');

            expect(mockWebBrowserService.analyzeWebContent).toHaveBeenCalledWith(
                'https://example.com',
                'general'
            );
            expect(result).toEqual(mockAnalysis);
        });

        it('should handle browser service errors gracefully', async () => {
            mockWebBrowserService.analyzeWebContent.mockRejectedValue(new Error('Analysis failed'));

            const result = await externalContentService.analyzeContent('https://example.com');

            expect(result).toBeNull();
        });

        it('should return null when web browsing is disabled', async () => {
            externalContentService.config.enableWebBrowsing = false;

            const result = await externalContentService.analyzeContent('https://example.com');

            expect(mockWebBrowserService.analyzeWebContent).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });
    });

    describe('searchAndAnalyzeContent', () => {
        it('should search and analyze content when both services are enabled', async () => {
            const mockSearchResults = [
                { url: 'https://example.com', title: 'Test', snippet: 'Test content' }
            ];
            const mockAnalysis = {
                content: 'Analyzed content',
                metadata: { title: 'Test Page' }
            };

            mockWebSearchService.search.mockResolvedValue(mockSearchResults);
            mockWebBrowserService.analyzeWebContent.mockResolvedValue(mockAnalysis);

            const results = await externalContentService.searchAndAnalyzeContent('test query');

            expect(mockWebSearchService.search).toHaveBeenCalled();
            expect(mockWebBrowserService.analyzeWebContent).toHaveBeenCalledWith(
                'https://example.com',
                'general'
            );
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                url: 'https://example.com',
                searchResult: mockSearchResults[0],
                analysis: mockAnalysis
            });
        });

        it('should only search when browsing is disabled', async () => {
            externalContentService.config.enableWebBrowsing = false;
            const mockSearchResults = [
                { url: 'https://example.com', title: 'Test', snippet: 'Test content' }
            ];

            mockWebSearchService.search.mockResolvedValue(mockSearchResults);

            const results = await externalContentService.searchAndAnalyzeContent('test query');

            expect(mockWebSearchService.search).toHaveBeenCalled();
            expect(mockWebBrowserService.analyzeWebContent).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                url: 'https://example.com',
                searchResult: mockSearchResults[0],
                analysis: null
            });
        });
    });

    describe('configuration', () => {
        it('should respect configuration settings', () => {
            expect(externalContentService.config.maxExternalSources).toBe(5);
            expect(externalContentService.config.enableWebSearch).toBe(true);
            expect(externalContentService.config.enableWebBrowsing).toBe(true);
        });

        it('should handle missing services gracefully', () => {
            const serviceWithoutBrowser = new ExternalContentService({
                webSearchService: mockWebSearchService,
                enableWebSearch: true,
                enableWebBrowsing: false
            });

            expect(serviceWithoutBrowser.webBrowserService).toBeNull();
            expect(serviceWithoutBrowser.webSearchService).toBe(mockWebSearchService);
        });
    });
});
