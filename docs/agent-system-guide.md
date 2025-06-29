# Agent System Guide

## Overview

The VSI Vector Store features a sophisticated multi-agent system designed for autonomous research and analysis. This system leverages the existing robust API infrastructure, smart context capabilities, clustering, and search functionality to provide intelligent, self-organizing research capabilities.

## Architecture

### Core Design Principles

1. **Isolation**: Agent system is completely isolated from existing code
2. **API-First**: All agent operations use existing internal API routes  
3. **Non-Invasive**: No modifications to existing core functionality
4. **Modular**: Each agent type is independently implementable
5. **Extensible**: New agent types can be added without affecting existing agents

### System Architecture

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

### Agent Service Foundation

The `AgentService` (`src/services/agentService.js`) provides:

- **Agent Lifecycle Management**: Registration, starting, stopping, pausing agents
- **Session Management**: Creating and managing research sessions 
- **Inter-Agent Communication**: Message passing and event coordination
- **Task Orchestration**: Delegating and coordinating complex research tasks

### Base Agent Class

All agents extend `BaseAgent` (`src/agents/BaseAgent.js`) which provides:

- **Core Methods**: Initialize, execute, pause, resume, cleanup
- **Memory Management**: Store, retrieve, and search agent memory
- **Task Management**: Add, complete, and delegate tasks
- **Artifact Creation**: Generate research outputs and reports
- **API Integration**: Helpers for VSI API operations

### Agent Memory System

The `AgentMemoryService` (`src/services/agentMemoryService.js`) handles:

- **Session-Based Memory**: Context specific to research sessions
- **Cross-Session Knowledge**: Persistent user knowledge base
- **Working Memory**: Temporary agent state with TTL

## Specialized Agent Types

### 1. Research Orchestrator Agent

**Purpose**: Coordinates multi-agent research projects

**Capabilities**:
- Analyzes research scope using smart context
- Creates structured research plans
- Assigns specialized agents to subtasks
- Monitors progress and coordinates handoffs

**Key Methods**:
- `analyzeResearchScope()`: Maps topic breadth across collections
- `createResearchPlan()`: Generates structured task breakdown
- `assignSpecializedAgents()`: Delegates work to specialist agents

### 2. Source Discovery Agent

**Purpose**: Finds and evaluates relevant information sources

**Capabilities**:
- Searches across all accessible collections
- Uses clustering to identify source patterns
- Evaluates source quality and relevance
- Creates curated source bibliographies

**Key Methods**:
- `discoverRelevantSources()`: Cross-collection search and clustering
- `evaluateSourceQuality()`: Quality scoring and curation
- `discoverExternalSources()`: Web search integration (when enabled)

### 3. Content Analysis Agent

**Purpose**: Performs deep content analysis and theme extraction

**Capabilities**:
- Uses smart context for detailed content analysis
- Identifies key themes across sources
- Extracts insights using configurable frameworks
- Combines internal and external content analysis

**Key Methods**:
- `performDeepContentAnalysis()`: Smart context-powered analysis
- `identifyKeyThemes()`: Cross-analysis theme identification
- `analyzeExternalContent()`: Web content integration

### 4. Synthesis Agent

**Purpose**: Synthesizes findings into coherent narratives

**Capabilities**:
- Waits for dependency completion
- Performs cross-cluster bridge analysis
- Identifies convergent and divergent viewpoints
- Creates structured research reports

**Key Methods**:
- `synthesizeFindings()`: Cross-cluster connection analysis
- `createCoherentNarrative()`: Template-based report generation
- `generateRecommendations()`: Actionable insights

### 5. Fact-Checking Agent

**Purpose**: Verifies claims and assigns confidence scores

**Capabilities**:
- Identifies checkable statements in research
- Cross-references claims across collections
- Assigns confidence scores based on evidence
- Flags potential conflicts or uncertainties

**Key Methods**:
- `identifyCheckableStatements()`: Extract verifiable claims
- `verifyStatements()`: Cross-reference verification
- `assignConfidenceScores()`: Evidence-based scoring

## External Content Integration

### Web Search Integration

The agent system integrates with external content sources through:

- **WebSearchService**: Multi-provider search (DuckDuckGo, Google, Bing)
- **WebBrowserService**: Browser automation for content extraction
- **ExternalContentService**: Orchestrates web search and browsing

### Configuration Options

External content features are configuration-driven:

```javascript
{
  enableExternalSources: true,
  enableWebSearch: true, 
  enableWebBrowsing: true,
  webSearchLimit: 10,
  contentExtractionTimeout: 30000
}
```

### Quality Controls

- Source ranking and filtering
- Content deduplication and aggregation  
- Timeout management and retry mechanisms
- Graceful fallbacks when external services unavailable

## Agent Workflows

### Research Session Lifecycle

1. **Session Creation**: User creates research session with topic and preferences
2. **Orchestrator Analysis**: Orchestrator agent analyzes scope and creates plan
3. **Agent Deployment**: Specialized agents are assigned specific tasks
4. **Parallel Execution**: Agents work in parallel with dependency management
5. **Synthesis**: Results are synthesized into coherent research output
6. **Quality Assurance**: Fact-checking agent verifies claims and assigns confidence
7. **Artifact Generation**: Final research artifacts are created and stored

### Inter-Agent Communication

Agents communicate through:

- **Message Passing**: Direct agent-to-agent communication
- **Shared Memory**: Session and cross-session knowledge sharing
- **Artifact Exchange**: Structured data and report sharing
- **Event Coordination**: Dependency management and workflow control

### Task Dependencies

The system manages complex task dependencies:

```javascript
const tasks = [
  { type: 'source_discovery', priority: 'high' },
  { type: 'content_analysis', priority: 'high' },
  { type: 'synthesis', dependencies: ['source_discovery', 'content_analysis'] },
  { type: 'fact_checking', dependencies: ['synthesis'] }
];
```

## Configuration and Setup

### Agent System Configuration

The agent system is configured through:

- **Service Registration**: Dependency injection container setup
- **Agent Templates**: Pre-configured agent types and workflows
- **User Preferences**: Per-user agent behavior customization
- **Resource Limits**: Memory, execution time, and API call limits

### Development and Testing

The system includes comprehensive testing:

- **Unit Tests**: Individual agent component testing
- **Integration Tests**: Multi-agent workflow validation
- **External Content Tests**: Web service integration testing
- **Performance Tests**: Resource usage and scalability testing

## Best Practices

### Agent Development

1. **Extend BaseAgent**: Always inherit from the base agent class
2. **Use API Helpers**: Leverage existing VSI API integration methods
3. **Implement Dependencies**: Clearly define task dependencies
4. **Handle Errors**: Implement robust error handling and fallbacks
5. **Store Artifacts**: Create persistent research outputs

### Performance Optimization

1. **Parallel Execution**: Run independent tasks in parallel
2. **Memory Management**: Use appropriate memory scopes and TTL
3. **API Efficiency**: Batch API calls where possible
4. **Resource Cleanup**: Properly clean up agent resources

### Security Considerations

1. **User Isolation**: Ensure agent operations respect user boundaries
2. **API Authentication**: All agent API calls are properly authenticated
3. **External Content**: Validate and sanitize external content
4. **Rate Limiting**: Respect API and external service rate limits

## Future Enhancements

### Planned Agent Types

- **Comparative Analysis Agent**: Side-by-side comparison workflows
- **Trend Analysis Agent**: Temporal pattern identification
- **Citation Agent**: Academic citation and reference management
- **Export Agent**: Multi-format research output generation

### Advanced Features

- **Agent Learning**: Continuous improvement through feedback
- **Custom Agent Creation**: User-defined agent types and workflows
- **Real-time Collaboration**: Multi-user research sessions
- **Advanced Analytics**: Research quality and impact metrics

## See Also

- [API User Guide](api-user-guide.md) - VSI API integration details
- [Feature Overview](feature-overview.md) - Complete system capabilities
- [Admin Guide](admin-guide.md) - System administration and configuration
