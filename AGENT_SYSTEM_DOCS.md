# VSI Agent System Documentation

## Overview

The VSI Agent System is a comprehensive implementation of autonomous research agents that can discover sources, analyze content, and generate research artifacts using the existing VSI Vector Store infrastructure.

## Architecture

The system follows a modular, API-first design:

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent System Layer                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Orchestrator│  │ Specialized │  │   Memory    │       │
│  │   Agent     │  │   Agents    │  │  Manager    │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
├─────────────────────────────────────────────────────────────┤
│              Agent Communication Bus                        │
├─────────────────────────────────────────────────────────────┤
│                 Existing VSI API Layer                     │
│  Collections • Search • Smart Context • Clustering         │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. AgentService (`src/services/agentService.js`)
- Central coordinator for all agent operations
- Manages agent lifecycle (register, start, pause, stop)
- Handles sessions and inter-agent communication
- Provides progress tracking and artifact management

### 2. BaseAgent (`src/agents/BaseAgent.js`)
- Abstract base class for all agents
- Provides common functionality (memory, tasks, artifacts)
- Integrates with VSI API through AgentApiClient

### 3. Specialized Agents
- **OrchestratorAgent**: Coordinates research workflow
- **SourceDiscoveryAgent**: Finds and evaluates sources
- **ContentAnalysisAgent**: Analyzes content using various frameworks

### 4. AgentApiClient (`src/services/agentApiClient.js`)
- Provides authenticated access to VSI endpoints
- Handles retries, error recovery, and logging
- Abstracts VSI API complexity for agents

### 5. Database Schema
- 8 new tables for agent operations
- Complete session, memory, and artifact tracking
- Performance indexes and utility functions

## Quick Start

### 1. Using the CLI

```bash
# Create a new research session
node agent-cli.js create-session "AI in Healthcare" --sources 50 --frameworks thematic,sentiment

# Start agents for the session
node agent-cli.js start-agents <session-id> orchestrator,source_discovery,content_analysis

# Monitor progress
node agent-cli.js session-status <session-id>

# View generated artifacts
node agent-cli.js artifacts <session-id> --detailed
```

### 2. Using the API

```javascript
const { AgentService } = require('./src/services/agentService');

const agentService = new AgentService();

// Create session
const session = await agentService.createSession(
    'user-123',
    'Machine Learning in Drug Discovery',
    {
        maxSources: 75,
        analysisFrameworks: ['thematic', 'trend', 'comparative'],
        outputFormat: 'comprehensive_report'
    }
);

// Start agents
await agentService.startAgents(session.id, 'user-123', [
    'orchestrator',
    'source_discovery', 
    'content_analysis'
]);

// Monitor progress
const progress = await agentService.getSessionProgress(session.id);
console.log(`Overall progress: ${progress.overall}%`);
```

### 3. Using the Web Interface

1. Open `/agent-dashboard.html` in your browser
2. Click "New Research Session"
3. Fill in research topic and preferences
4. Click "Start Agents" to begin research
5. Monitor progress in real-time

## Agent Types

### Orchestrator Agent
**Purpose**: Coordinates the entire research workflow

**Capabilities**:
- Analyzes research scope and creates work plans
- Assigns tasks to specialized agents
- Monitors progress and adjusts strategy
- Synthesizes findings from multiple agents

**Configuration**:
```javascript
{
    researchTopic: "Your research topic",
    strategy: "comprehensive|focused|exploratory",
    maxAgents: 5,
    timeLimit: 3600000 // 1 hour in ms
}
```

### Source Discovery Agent
**Purpose**: Finds and evaluates relevant sources

**Capabilities**:
- Searches across multiple collections
- Evaluates source quality and relevance
- Ranks sources by importance
- Identifies gaps in coverage

**Configuration**:
```javascript
{
    maxSources: 50,
    qualityThreshold: 0.7,
    diversityWeight: 0.3,
    recencyWeight: 0.4
}
```

### Content Analysis Agent
**Purpose**: Analyzes content using multiple frameworks

**Capabilities**:
- Thematic analysis (topics, themes, patterns)
- Sentiment analysis (opinions, attitudes)
- Trend analysis (changes over time)
- Comparative analysis (differences, similarities)

**Configuration**:
```javascript
{
    frameworks: ['thematic', 'sentiment', 'trend'],
    depth: 'surface|medium|deep',
    maxContextSize: 4000
}
```

## Database Schema

### Core Tables

```sql
-- Research sessions
agent_sessions (id, user_id, research_topic, preferences, status, created_at, updated_at)

-- Individual agents
agents (id, session_id, agent_type, agent_id, config, status, started_at, completed_at)

-- Agent memory (working, session, persistent)
agent_memory (id, agent_id, session_id, memory_key, memory_value, metadata, expires_at)

-- Generated artifacts
agent_artifacts (id, session_id, agent_id, artifact_type, content, metadata, version, status)

-- Agent tasks
agent_tasks (id, session_id, agent_id, task_type, task_data, dependencies, status, result)

-- Inter-agent messages
agent_messages (id, session_id, from_agent, to_agent, message_type, message_data, status)

-- User feedback
agent_feedback (id, session_id, user_id, agent_id, feedback_data, priority, status)

-- Cross-session knowledge
agent_knowledge (id, user_id, knowledge_key, knowledge_value, metadata)
```

## API Endpoints

### Session Management
- `POST /api/agents/sessions` - Create new session
- `GET /api/agents/sessions/:id` - Get session details
- `PUT /api/agents/sessions/:id` - Update session
- `DELETE /api/agents/sessions/:id` - Delete session
- `GET /api/agents/sessions` - List user sessions

### Agent Control
- `POST /api/agents/sessions/:id/agents/start` - Start agents
- `POST /api/agents/sessions/:id/agents/pause` - Pause session
- `POST /api/agents/sessions/:id/agents/stop` - Stop session
- `GET /api/agents/sessions/:id/status` - Get status
- `GET /api/agents/sessions/:id/progress` - Get progress

### Artifacts & Results
- `GET /api/agents/sessions/:id/artifacts` - List artifacts
- `GET /api/agents/artifacts/:id` - Get specific artifact
- `POST /api/agents/sessions/:id/feedback` - Provide feedback

### Real-time Updates
- `GET /api/agents/sessions/:id/events` - Server-sent events for real-time updates

## Configuration

### Environment Variables
```bash
# API Configuration
API_BASE_URL=http://localhost:3000
AGENT_TIMEOUT=30000
AGENT_MAX_RETRIES=3

# Database (uses existing VSI database)
DATABASE_URL=postgresql://user:pass@localhost:5432/vsi_db

# Agent System Specific
AGENT_LOG_LEVEL=info
AGENT_MAX_CONCURRENT=10
AGENT_MEMORY_TTL=3600
```

### Agent Preferences
```javascript
{
    // Source Discovery
    maxSources: 50,                    // Maximum sources to find
    qualityThreshold: 0.7,             // Minimum quality score
    diversityWeight: 0.3,              // Importance of diversity
    
    // Content Analysis
    analysisFrameworks: [               // Which frameworks to use
        'thematic',                     // Topic and theme extraction
        'sentiment',                    // Opinion and attitude analysis
        'trend',                        // Temporal pattern analysis
        'comparative'                   // Cross-source comparison
    ],
    maxContextSize: 4000,              // Max context window
    
    // Output Generation
    outputFormat: 'comprehensive_report', // Report type
    citationStyle: 'apa',              // Citation format
    includeCharts: true,               // Generate visualizations
    
    // Performance
    timeout: 3600000,                  // 1 hour timeout
    priority: 'balanced'               // speed|balanced|thorough
}
```

## Usage Examples

### 1. Medical Research Session
```javascript
const session = await agentService.createSession(
    'researcher-001',
    'COVID-19 Vaccine Effectiveness Studies',
    {
        maxSources: 100,
        analysisFrameworks: ['thematic', 'comparative', 'trend'],
        outputFormat: 'literature_review',
        priority: 'thorough'
    }
);
```

### 2. Business Intelligence Session
```javascript
const session = await agentService.createSession(
    'analyst-001',
    'Digital Transformation in Retail Industry',
    {
        maxSources: 75,
        analysisFrameworks: ['thematic', 'sentiment', 'trend'],
        outputFormat: 'executive_summary',
        priority: 'balanced'
    }
);
```

### 3. Academic Research Session
```javascript
const session = await agentService.createSession(
    'student-001',
    'Climate Change Mitigation Strategies',
    {
        maxSources: 60,
        analysisFrameworks: ['thematic', 'comparative'],
        outputFormat: 'comprehensive_report',
        priority: 'thorough'
    }
);
```

## Generated Artifacts

### Research Reports
- **Executive Summary**: Key findings and recommendations
- **Literature Review**: Comprehensive analysis of sources
- **Data Analysis**: Statistical analysis and trends
- **Comparative Study**: Side-by-side analysis

### Visualizations
- **Topic Networks**: Visual representation of themes
- **Trend Charts**: Temporal analysis graphs
- **Source Maps**: Relationship between sources
- **Quality Metrics**: Source credibility scores

### Data Exports
- **CSV**: Structured data for further analysis
- **JSON**: Machine-readable results
- **Bibliography**: Formatted citations
- **Metadata**: Source details and metrics

## Performance & Scaling

### Optimization Features
- **Parallel Processing**: Multiple agents work simultaneously
- **Incremental Results**: Partial results available immediately
- **Smart Caching**: Avoid redundant API calls
- **Quality Filtering**: Focus on high-quality sources

### Monitoring
- **Real-time Progress**: Live updates via WebSocket
- **Performance Metrics**: Agent execution times
- **Error Tracking**: Detailed error logs
- **Resource Usage**: Memory and API utilization

## Troubleshooting

### Common Issues

**Agents not starting**
- Check database connection
- Verify agent tables exist
- Check API endpoints are accessible

**Poor quality results**
- Adjust quality threshold
- Increase source diversity
- Review analysis frameworks

**Slow performance**
- Reduce number of sources
- Use focused instead of comprehensive analysis
- Check network connectivity to API

### Debug Mode
```bash
# Enable detailed logging
export AGENT_LOG_LEVEL=debug
node agent-cli.js create-session "Debug Test" --verbose
```

### Health Checks
```bash
# Check system status
curl http://localhost:3000/api/health

# Verify agent tables
node -e "
const { AgentService } = require('./src/services/agentService');
const service = new AgentService();
console.log('Agent service initialized successfully');
"
```

## Extension Points

### Adding New Agent Types
1. Create new agent class extending `BaseAgent`
2. Implement required methods (`initialize`, `execute`, etc.)
3. Add to `AgentService.getAgentClass()`
4. Update configuration handling

### Custom Analysis Frameworks
1. Implement analysis logic in `ContentAnalysisAgent`
2. Add framework configuration options
3. Update API client if new endpoints needed

### Integration with External APIs
1. Add new methods to `AgentApiClient`
2. Handle authentication and rate limiting
3. Add error recovery for external services

## Security Considerations

### Access Control
- Session-based access (users can only access their sessions)
- API key authentication for external integrations
- Rate limiting on agent operations

### Data Privacy
- User data isolated by session
- Configurable data retention policies
- Option to delete all session data

### Resource Limits
- Maximum concurrent agents per user
- Timeout limits on long-running operations
- Memory usage monitoring and limits

## Support

### Documentation
- API Reference: `/api/docs`
- Interactive Examples: `/examples`
- Video Tutorials: `/tutorials`

### Community
- GitHub Issues: Report bugs and feature requests
- Discussion Forum: Ask questions and share experiences
- Slack Channel: Real-time community support

### Professional Support
- Email: support@vsi-agents.com
- Enterprise Support: Available for commercial users
- Custom Development: Agent customization services
