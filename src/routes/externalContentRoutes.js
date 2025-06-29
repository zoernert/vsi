const express = require('express');
const { auth } = require('../middleware');
const container = require('../config/container');

const router = express.Router();

// Get external content services from DI container
const getExternalContentService = () => {
    try {
        return container.get('externalContentService');
    } catch (error) {
        console.warn('External content service not available:', error.message);
        return null;
    }
};

const getWebSearchService = () => {
    try {
        return container.get('webSearchService');
    } catch (error) {
        console.warn('Web search service not available:', error.message);
        return null;
    }
};

const getWebBrowserService = () => {
    try {
        return container.get('webBrowserService');
    } catch (error) {
        console.warn('Web browser service not available:', error.message);
        return null;
    }
};

// Helper function to check if external content is enabled
const checkExternalContentEnabled = (req, res, next) => {
    const externalContentService = getExternalContentService();
    if (!externalContentService) {
        return res.status(503).json({
            error: 'External content service not available',
            message: 'External content features are not configured or enabled'
        });
    }
    req.externalContentService = externalContentService;
    next();
};

/**
 * @swagger
 * /api/external/search:
 *   post:
 *     summary: Perform web search
 *     description: Search the web for content using configured search providers
 *     tags: [External Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query
 *                 example: "artificial intelligence trends 2024"
 *               maxResults:
 *                 type: integer
 *                 description: Maximum number of results to return
 *                 default: 10
 *                 minimum: 1
 *                 maximum: 50
 *               provider:
 *                 type: string
 *                 description: Preferred search provider
 *                 enum: [google, bing, duckduckgo]
 *               includeContent:
 *                 type: boolean
 *                 description: Whether to extract and include page content
 *                 default: false
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SearchResult'
 *                 query:
 *                   type: string
 *                 provider:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: External content service not available
 */
router.post('/search', auth, checkExternalContentEnabled, async (req, res) => {
    try {
        const { query, maxResults = 10, provider, includeContent = false } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid query',
                message: 'Query must be a non-empty string'
            });
        }

        if (maxResults < 1 || maxResults > 50) {
            return res.status(400).json({
                error: 'Invalid maxResults',
                message: 'maxResults must be between 1 and 50'
            });
        }

        const webSearchService = getWebSearchService();
        if (!webSearchService) {
            return res.status(503).json({
                error: 'Web search service not available'
            });
        }

        const searchOptions = {
            maxResults,
            includeContent
        };

        if (provider) {
            searchOptions.provider = provider;
        }

        const results = await webSearchService.search(query, searchOptions);

        res.json({
            results,
            query: query.trim(),
            provider: results.length > 0 ? results[0].provider : provider || 'default',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in web search:', error);
        res.status(500).json({
            error: 'Search failed',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/external/browse:
 *   post:
 *     summary: Browse and extract content from a URL
 *     description: Load a webpage and extract its content using AI-powered analysis
 *     tags: [External Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL to browse and extract content from
 *                 example: "https://example.com/article"
 *               extractionType:
 *                 type: string
 *                 description: Type of content extraction to perform
 *                 enum: [summary, full, structured, facts]
 *                 default: summary
 *               includeMetadata:
 *                 type: boolean
 *                 description: Whether to include page metadata
 *                 default: true
 *               waitForJs:
 *                 type: boolean
 *                 description: Whether to wait for JavaScript execution
 *                 default: false
 *     responses:
 *       200:
 *         description: Extracted content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                 title:
 *                   type: string
 *                 content:
 *                   type: string
 *                 extractedAt:
 *                   type: string
 *                   format: date-time
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     keywords:
 *                       type: array
 *                       items:
 *                         type: string
 *                     author:
 *                       type: string
 *                     publishDate:
 *                       type: string
 *                 extractionType:
 *                   type: string
 *       400:
 *         description: Invalid URL or parameters
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: External content service not available
 */
router.post('/browse', auth, checkExternalContentEnabled, async (req, res) => {
    try {
        const { url, extractionType = 'summary', includeMetadata = true, waitForJs = false } = req.body;

        if (!url || typeof url !== 'string') {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'URL must be a valid string'
            });
        }

        // Basic URL validation
        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL format',
                message: 'Please provide a valid URL'
            });
        }

        const webBrowserService = getWebBrowserService();
        if (!webBrowserService) {
            return res.status(503).json({
                error: 'Web browser service not available'
            });
        }

        const result = await webBrowserService.browseAndExtract(url, {
            extractionType,
            includeMetadata,
            waitForJs
        });

        res.json({
            url,
            title: result.title,
            content: result.content,
            extractedAt: new Date().toISOString(),
            metadata: includeMetadata ? result.metadata : undefined,
            extractionType
        });

    } catch (error) {
        console.error('Error in web browsing:', error);
        res.status(500).json({
            error: 'Browsing failed',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/external/analyze:
 *   post:
 *     summary: Analyze external content
 *     description: Perform comprehensive analysis on external web content
 *     tags: [External Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sources
 *             properties:
 *               sources:
 *                 type: array
 *                 description: List of URLs or search queries to analyze
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                       format: uri
 *                       description: Direct URL to analyze
 *                     - type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                           enum: [url, search]
 *                         value:
 *                           type: string
 *                 example: 
 *                   - "https://example.com/article1"
 *                   - { "type": "search", "value": "machine learning 2024" }
 *               analysisType:
 *                 type: string
 *                 description: Type of analysis to perform
 *                 enum: [summary, comparison, trends, facts]
 *                 default: summary
 *               maxSources:
 *                 type: integer
 *                 description: Maximum number of sources to analyze
 *                 default: 5
 *                 minimum: 1
 *                 maximum: 20
 *     responses:
 *       200:
 *         description: Analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysis:
 *                   type: string
 *                   description: Main analysis content
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                       title:
 *                         type: string
 *                       summary:
 *                         type: string
 *                 analysisType:
 *                   type: string
 *                 analyzedAt:
 *                   type: string
 *                   format: date-time
 *                 metadata:
 *                   type: object
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: External content service not available
 */
router.post('/analyze', auth, checkExternalContentEnabled, async (req, res) => {
    try {
        const { sources, analysisType = 'summary', maxSources = 5 } = req.body;

        if (!sources || !Array.isArray(sources) || sources.length === 0) {
            return res.status(400).json({
                error: 'Invalid sources',
                message: 'Sources must be a non-empty array'
            });
        }

        if (maxSources < 1 || maxSources > 20) {
            return res.status(400).json({
                error: 'Invalid maxSources',
                message: 'maxSources must be between 1 and 20'
            });
        }

        const externalContentService = req.externalContentService;

        const result = await externalContentService.analyzeExternalSources(sources.slice(0, maxSources), {
            analysisType,
            includeMetadata: true
        });

        res.json({
            analysis: result.analysis,
            sources: result.sources,
            analysisType,
            analyzedAt: new Date().toISOString(),
            metadata: result.metadata
        });

    } catch (error) {
        console.error('Error in external content analysis:', error);
        res.status(500).json({
            error: 'Analysis failed',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/external/config:
 *   get:
 *     summary: Get external content configuration
 *     description: Retrieve current external content service configuration and status
 *     tags: [External Content]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 services:
 *                   type: object
 *                   properties:
 *                     webSearch:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         providers:
 *                           type: array
 *                           items:
 *                             type: string
 *                     webBrowser:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         headless:
 *                           type: boolean
 *                 limits:
 *                   type: object
 *                   properties:
 *                     maxSearchResults:
 *                       type: integer
 *                     maxAnalysisSources:
 *                       type: integer
 *                     requestTimeout:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/config', auth, async (req, res) => {
    try {
        const externalContentService = getExternalContentService();
        const webSearchService = getWebSearchService();
        const webBrowserService = getWebBrowserService();

        const config = {
            enabled: !!externalContentService,
            services: {
                webSearch: {
                    enabled: !!webSearchService,
                    providers: webSearchService ? ['google', 'bing', 'duckduckgo'] : []
                },
                webBrowser: {
                    enabled: !!webBrowserService,
                    headless: true
                }
            },
            limits: {
                maxSearchResults: 50,
                maxAnalysisSources: 20,
                requestTimeout: 30000
            }
        };

        res.json(config);

    } catch (error) {
        console.error('Error getting external content config:', error);
        res.status(500).json({
            error: 'Failed to get configuration',
            message: error.message
        });
    }
});

module.exports = router;
