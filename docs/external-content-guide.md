# External Content Integration Guide

## Overview

The VSI Vector Store includes comprehensive external content integration capabilities that extend research and analysis beyond local collections. This system provides web search, web browsing, and intelligent content extraction to enhance AI agent research capabilities.

## Key Features

### ✅ **Multi-Provider Web Search**
- DuckDuckGo integration (primary)
- Google search support (when configured)
- Bing search support (when configured)
- Intelligent result ranking and filtering

### ✅ **Automated Web Browsing**
- Browser session management via browserless.io
- AI-powered content extraction and analysis
- JavaScript rendering and dynamic content handling
- Configurable timeouts and resource management

### ✅ **Intelligent Content Processing**
- Content deduplication and aggregation
- Quality scoring and relevance ranking
- Automatic content cleaning and formatting
- Metadata extraction and enrichment

### ✅ **Agent System Integration**
- Seamless integration with AI agents
- Configuration-driven feature enablement
- Graceful fallbacks when services unavailable
- Progress tracking and statistics

## Architecture

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 External Content Layer                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Web       │  │   Web       │  │  External   │       │
│  │  Search     │  │  Browser    │  │  Content    │       │
│  │  Service    │  │  Service    │  │  Service    │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
├─────────────────────────────────────────────────────────────┤
│              Agent Integration Layer                        │
│  ┌─────────────┐  ┌─────────────┐                         │
│  │   Source    │  │  Content    │                         │
│  │ Discovery   │  │ Analysis    │                         │
│  │   Agent     │  │   Agent     │                         │
│  └─────────────┘  └─────────────┘                         │
├─────────────────────────────────────────────────────────────┤
│                 VSI Core Services                          │
│  Collections • Search • Smart Context • Clustering         │
└─────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. WebSearchService

**Location**: `src/services/webSearchService.js`

**Purpose**: Provides unified interface for multiple web search providers

**Key Features**:
- Multi-provider search support (DuckDuckGo, Google, Bing)
- Search result ranking and filtering
- Configurable result limits and quality thresholds
- Graceful handling of disabled state
- Error handling and retry mechanisms

**Configuration**:
```javascript
{
  webSearch: {
    enabled: true,
    providers: ['duckduckgo', 'google', 'bing'],
    defaultProvider: 'duckduckgo',
    maxResults: 10,
    qualityThreshold: 0.6,
    timeout: 30000
  }
}
```

**Key Methods**:
- `searchWeb(query, options)`: Perform web search across providers
- `rankResults(results)`: Apply quality scoring and ranking
- `filterResults(results, criteria)`: Filter results by quality/relevance
- `getProviderStatus()`: Check provider availability

### 2. WebBrowserService

**Location**: `src/services/webBrowserService.js`

**Purpose**: Automated web browsing and content extraction

**Key Features**:
- Browser session management with browserless.io API
- AI-powered content extraction and analysis
- JavaScript rendering for dynamic content
- Configurable timeouts and resource cleanup
- Screenshot and PDF generation capabilities

**Configuration**:
```javascript
{
  webBrowser: {
    enabled: true,
    browserlessUrl: 'https://chrome.browserless.io',
    timeout: 30000,
    maxPages: 5,
    extractionStrategy: 'ai-powered',
    screenshotsEnabled: false
  }
}
```

**Key Methods**:
- `navigateToUrl(url, options)`: Navigate to URL and extract content
- `extractContent(html)`: AI-powered content extraction
- `captureScreenshot(url)`: Generate page screenshots
- `generatePdf(url)`: Generate PDF from web page
- `cleanupSession()`: Cleanup browser resources

### 3. ExternalContentService

**Location**: `src/services/externalContentService.js`

**Purpose**: Orchestrates web search and browsing services

**Key Features**:
- Unified interface for external content operations
- Content aggregation and deduplication
- Progress tracking and statistics
- Comprehensive research workflows
- Quality control and filtering

**Key Methods**:
- `searchAndExtract(query, options)`: Combined search and content extraction
- `aggregateContent(sources)`: Deduplication and aggregation
- `analyzeContent(content, framework)`: Apply analysis frameworks
- `generateReport(analysis)`: Create structured reports
- `getStatistics()`: Service usage statistics

## Agent Integration

### Enhanced Source Discovery Agent

The `SourceDiscoveryAgent` (`src/agents/SourceDiscoveryAgent.js`) is enhanced with external content capabilities:

**New Methods**:
- `discoverExternalSources()`: Web search for external sources
- `evaluateExternalQuality()`: Quality scoring for external sources
- `combineSourceAnalysis()`: Merge internal and external source analysis

**Integration Example**:
```javascript
class SourceDiscoveryAgent extends BaseAgent {
  constructor(agentId, sessionId, config, apiClient, webSearchService) {
    super(agentId, sessionId, config, apiClient);
    this.webSearch = webSearchService;
  }

  async discoverExternalSources() {
    if (!this.config.enableExternalSources || !this.webSearch) {
      return { sources: [], message: 'External sources disabled' };
    }

    const query = this.config.researchQuery;
    const searchResults = await this.webSearch.searchWeb(query, {
      maxResults: this.config.externalSourceLimit || 10,
      providers: this.config.searchProviders || ['duckduckgo']
    });

    const qualityScored = this.evaluateExternalQuality(searchResults);
    
    return {
      sources: qualityScored,
      searchProvider: this.webSearch.getActiveProvider(),
      totalResults: searchResults.length,
      qualityFiltered: qualityScored.length
    };
  }
}
```

### Enhanced Content Analysis Agent

The `ContentAnalysisAgent` (`src/agents/ContentAnalysisAgent.js`) includes external content analysis:

**New Methods**:
- `analyzeExternalContent()`: Analyze web-sourced content
- `combineAnalysis()`: Merge internal and external analysis
- `extractWebInsights()`: Extract insights from web content

**Integration Example**:
```javascript
class ContentAnalysisAgent extends BaseAgent {
  constructor(agentId, sessionId, config, apiClient, externalContentService) {
    super(agentId, sessionId, config, apiClient);
    this.externalContent = externalContentService;
  }

  async analyzeExternalContent() {
    if (!this.config.enableExternalContent || !this.externalContent) {
      return { analysis: [], message: 'External content analysis disabled' };
    }

    const externalSources = await this.getSharedMemory('external_sources');
    const analysisResults = [];

    for (const source of externalSources.sources) {
      if (source.qualityScore > 0.7) {
        const content = await this.externalContent.extractContent(source.url);
        const analysis = await this.analyzeContent(content, this.config.frameworks);
        
        analysisResults.push({
          source: source.url,
          title: source.title,
          analysis: analysis,
          extractionSuccess: true
        });
      }
    }

    return {
      analysis: analysisResults,
      successRate: analysisResults.length / externalSources.sources.length,
      processingTime: Date.now() - this.startTime
    };
  }
}
```

## Configuration Management

### Master Configuration

External content features are controlled through comprehensive configuration:

```javascript
{
  externalContent: {
    // Master switches
    enabled: true,
    enableWebSearch: true,
    enableWebBrowsing: true,
    
    // Limits and thresholds
    maxExternalSources: 10,
    qualityThreshold: 0.6,
    contentExtractionTimeout: 30000,
    
    // Provider configuration
    webSearch: {
      providers: ['duckduckgo', 'google'],
      defaultProvider: 'duckduckgo',
      apiKeys: {
        google: process.env.GOOGLE_SEARCH_API_KEY,
        bing: process.env.BING_SEARCH_API_KEY
      }
    },
    
    webBrowser: {
      browserlessUrl: process.env.BROWSERLESS_URL,
      apiKey: process.env.BROWSERLESS_API_KEY,
      timeout: 30000,
      maxConcurrent: 3
    },
    
    // Content processing
    contentProcessing: {
      deduplicationThreshold: 0.8,
      maxContentLength: 50000,
      enableAIExtraction: true,
      extractionModel: 'gpt-3.5-turbo'
    }
  }
}
```

### Per-Session Configuration

Research sessions can override global settings:

```javascript
{
  sessionId: "session-123",
  researchTopic: "artificial intelligence trends",
  preferences: {
    enableExternalSources: true,
    maxExternalSources: 15,
    searchProviders: ['duckduckgo', 'google'],
    contentQuality: 'high', // high, medium, low
    extractionDepth: 'detailed' // summary, detailed, comprehensive
  }
}
```

## Quality Control

### Source Quality Scoring

External sources are scored based on multiple factors:

```javascript
calculateSourceQuality(source) {
  let score = 0.5; // Base score
  
  // Domain authority (if available)
  if (source.domain && this.trustedDomains.includes(source.domain)) {
    score += 0.2;
  }
  
  // Content length and structure
  if (source.content && source.content.length > 500) {
    score += 0.1;
  }
  
  // Recency (for time-sensitive topics)
  if (source.publishDate && this.isRecent(source.publishDate)) {
    score += 0.1;
  }
  
  // Search ranking
  if (source.searchRank <= 3) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}
```

### Content Deduplication

Prevents duplicate content from affecting analysis:

```javascript
deduplicateContent(sources) {
  const deduplicated = [];
  const seenContent = new Set();
  
  for (const source of sources) {
    const contentHash = this.generateContentHash(source.content);
    const similarity = this.calculateMaxSimilarity(source.content, deduplicated);
    
    if (!seenContent.has(contentHash) && similarity < 0.8) {
      deduplicated.push(source);
      seenContent.add(contentHash);
    }
  }
  
  return deduplicated;
}
```

## Error Handling and Resilience

### Graceful Degradation

The system handles service unavailability gracefully:

```javascript
async searchWeb(query, options = {}) {
  if (!this.config.enabled) {
    return {
      results: [],
      message: 'Web search is disabled',
      fallback: true
    };
  }
  
  try {
    const results = await this.performSearch(query, options);
    return {
      results: results,
      provider: this.activeProvider,
      success: true
    };
  } catch (error) {
    this.logger.warn('Web search failed, continuing without external sources', error);
    return {
      results: [],
      error: error.message,
      fallback: true
    };
  }
}
```

### Retry Mechanisms

Implements exponential backoff for failed requests:

```javascript
async retryWithBackoff(operation, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await this.sleep(delay);
      }
    }
  }
  
  throw lastError;
}
```

### Resource Management

Prevents resource leaks and manages API quotas:

```javascript
class WebBrowserService {
  constructor() {
    this.activeSessions = new Map();
    this.sessionCount = 0;
    this.maxConcurrentSessions = 5;
  }
  
  async createSession() {
    if (this.sessionCount >= this.maxConcurrentSessions) {
      throw new Error('Maximum concurrent sessions reached');
    }
    
    const sessionId = this.generateSessionId();
    const session = await this.browserless.createSession();
    
    this.activeSessions.set(sessionId, {
      session: session,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    
    this.sessionCount++;
    return sessionId;
  }
  
  async cleanupInactiveSessions() {
    const now = Date.now();
    const maxInactivity = 5 * 60 * 1000; // 5 minutes
    
    for (const [sessionId, sessionData] of this.activeSessions) {
      if (now - sessionData.lastActivity > maxInactivity) {
        await this.closeSession(sessionId);
      }
    }
  }
}
```

## Monitoring and Analytics

### Usage Statistics

The system tracks comprehensive usage statistics:

```javascript
{
  externalContent: {
    totalRequests: 1234,
    successfulRequests: 1187,
    failedRequests: 47,
    averageResponseTime: 2500,
    
    webSearch: {
      totalSearches: 567,
      providerUsage: {
        duckduckgo: 423,
        google: 144
      },
      averageResults: 8.3
    },
    
    webBrowser: {
      totalExtractions: 334,
      successRate: 0.89,
      averagePageLoadTime: 3200,
      contentSize: {
        average: 15000,
        max: 87000,
        min: 1200
      }
    }
  }
}
```

### Performance Monitoring

Tracks service performance and availability:

```javascript
{
  timestamp: "2024-01-15T10:30:00Z",
  service: "webSearch",
  operation: "search",
  provider: "duckduckgo",
  query: "artificial intelligence",
  responseTime: 1250,
  resultCount: 9,
  qualityScore: 0.82,
  success: true
}
```

## Testing and Validation

### Integration Testing

Comprehensive test suite validates external content integration:

```bash
# Run external content tests
npm run test:external

# Test specific services
npm run test:web-search
npm run test:web-browser
npm run test:external-integration
```

### Test Configuration

Tests use mock services for reliability:

```javascript
// test-external-content.js
const mockWebSearchService = {
  searchWeb: jest.fn().mockResolvedValue({
    results: [
      {
        title: "Test Article",
        url: "https://example.com/test",
        snippet: "Test content snippet",
        rank: 1
      }
    ],
    provider: "mock",
    success: true
  })
};
```

## Best Practices

### Performance Optimization

1. **Parallel Processing**: Process multiple external sources concurrently
2. **Caching**: Cache search results and extracted content
3. **Rate Limiting**: Respect external service rate limits
4. **Resource Pooling**: Reuse browser sessions when possible
5. **Content Compression**: Compress large content for storage

### Security Considerations

1. **URL Validation**: Validate and sanitize URLs before processing
2. **Content Sanitization**: Clean extracted content of malicious elements
3. **API Key Security**: Secure storage and rotation of API keys
4. **Request Filtering**: Filter requests to prevent abuse
5. **Privacy Protection**: Respect user privacy and data protection

### Error Recovery

1. **Graceful Fallbacks**: Continue processing when external services fail
2. **Partial Results**: Return partial results rather than complete failure
3. **User Notification**: Inform users when external content is unavailable
4. **Retry Logic**: Implement intelligent retry mechanisms
5. **Circuit Breakers**: Prevent cascading failures

## See Also

- [Agent System Guide](agent-system-guide.md) - AI agent integration details
- [API User Guide](api-user-guide.md) - REST API integration
- [Feature Overview](feature-overview.md) - Complete system capabilities
- [Admin Guide](admin-guide.md) - Configuration and management
