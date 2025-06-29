# VSI Agent System API Documentation Summary

## 🎯 Overview

The VSI Agent System API has been fully documented and integrated into the OpenAPI specification. The complete API documentation is now available in `/public/openapi.json` and includes comprehensive schemas and endpoints for all agent system functionality.

## 📋 New API Endpoints Added

### Session Management
- **POST /api/agents/sessions** - Create new research session
- **GET /api/agents/sessions** - List user's sessions with filtering
- **GET /api/agents/sessions/{sessionId}** - Get session details
- **PUT /api/agents/sessions/{sessionId}** - Update session preferences
- **DELETE /api/agents/sessions/{sessionId}** - Delete session and stop agents

### Agent Control
- **POST /api/agents/sessions/{sessionId}/agents/start** - Start agents for research
- **POST /api/agents/sessions/{sessionId}/agents/pause** - Pause all session agents
- **POST /api/agents/sessions/{sessionId}/agents/stop** - Stop all session agents

### Status & Progress
- **GET /api/agents/sessions/{sessionId}/status** - Get current session status
- **GET /api/agents/sessions/{sessionId}/progress** - Get detailed progress info
- **GET /api/agents/sessions/{sessionId}/events** - Real-time SSE updates

### Artifacts & Results
- **GET /api/agents/sessions/{sessionId}/artifacts** - List generated artifacts
- **GET /api/agents/artifacts/{artifactId}** - Get specific artifact
- **GET /api/agents/artifacts/{artifactId}/download** - Download artifact

### Feedback & Interaction
- **POST /api/agents/sessions/{sessionId}/feedback** - Provide user feedback

## 🔧 New Schema Definitions

### Core Schemas
- **AgentSession** - Research session with preferences and status
- **Agent** - Individual agent instances with configuration
- **AgentArtifact** - Generated research artifacts (reports, analyses, etc.)
- **AgentProgress** - Detailed progress tracking information
- **AgentFeedback** - User feedback system

### Request/Response Schemas
- **CreateSessionRequest** - Session creation parameters
- **StartAgentsRequest** - Agent startup configuration
- **AgentError** - Standardized error responses

## 📊 Key Features Documented

### 1. Research Session Lifecycle
```json
{
  "researchTopic": "AI in Healthcare",
  "preferences": {
    "maxSources": 75,
    "analysisFrameworks": ["thematic", "sentiment", "trend"],
    "outputFormat": "comprehensive_report",
    "priority": "balanced"
  }
}
```

### 2. Agent Types
- **orchestrator** - Coordinates research workflow
- **source_discovery** - Finds and evaluates sources
- **content_analysis** - Analyzes content using multiple frameworks
- **synthesis** - Synthesizes findings (future)
- **fact_checking** - Verifies information (future)

### 3. Artifact Types
- **research_report** - Comprehensive research reports
- **executive_summary** - High-level summaries
- **source_list** - Curated source collections
- **analysis_results** - Detailed analysis data
- **visualization** - Charts and graphs
- **bibliography** - Formatted citations

### 4. Real-time Updates
Server-sent events provide live updates for:
- Agent status changes
- Progress updates
- New artifact generation
- Error notifications

## 🔍 API Features

### Authentication & Authorization
- Bearer token authentication
- Session-based access control
- User isolation (users can only access their own sessions)

### Query Parameters & Filtering
- **Status filtering** - Filter sessions by status
- **Pagination** - Limit/offset for large result sets
- **Type filtering** - Filter artifacts by type or agent
- **Content inclusion** - Optional full content retrieval

### Error Handling
- Standardized error responses
- Detailed error messages
- HTTP status codes following REST conventions
- Validation error details

### Content Types
- **JSON** - Primary API format
- **Server-sent events** - Real-time updates
- **Multiple download formats** - PDF, DOCX, CSV, HTML for artifacts

## 🚀 Usage Examples

### Create and Start Research Session
```bash
# Create session
curl -X POST "/api/agents/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "researchTopic": "Climate Change Mitigation",
    "preferences": {
      "maxSources": 50,
      "analysisFrameworks": ["thematic", "comparative"],
      "outputFormat": "literature_review"
    }
  }'

# Start agents
curl -X POST "/api/agents/sessions/{sessionId}/agents/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentTypes": ["orchestrator", "source_discovery", "content_analysis"]
  }'
```

### Monitor Progress
```bash
# Get progress
curl "/api/agents/sessions/{sessionId}/progress" \
  -H "Authorization: Bearer $TOKEN"

# Real-time updates
curl "/api/agents/sessions/{sessionId}/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream"
```

### Retrieve Results
```bash
# List artifacts
curl "/api/agents/sessions/{sessionId}/artifacts" \
  -H "Authorization: Bearer $TOKEN"

# Download specific artifact as PDF
curl "/api/agents/artifacts/{artifactId}/download?format=pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o "research_report.pdf"
```

## 📈 Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "running",
    "research_topic": "AI in Healthcare",
    "progress": {
      "overall": 45,
      "agents": [...]
    }
  }
}
```

### Error Response
```json
{
  "error": "ValidationError",
  "message": "Invalid research topic",
  "details": {
    "field": "researchTopic",
    "constraint": "minLength"
  },
  "timestamp": "2025-06-28T18:30:00Z"
}
```

## 🔗 OpenAPI Integration

### Swagger UI Access
The complete API documentation is available via Swagger UI at:
- `/api/docs` - Interactive API documentation
- `/openapi.json` - Raw OpenAPI specification

### IDE Integration
The OpenAPI specification supports:
- **Auto-completion** in IDEs
- **Code generation** for clients
- **API testing** tools
- **Mock servers** for development

### Validation
All endpoints include:
- **Request validation** with detailed error messages
- **Response schemas** for type safety
- **Parameter constraints** (min/max values, enum options)
- **Authentication requirements** clearly specified

## 🛠️ Development Tools

### Testing
```bash
# Validate OpenAPI spec
npx swagger-parser validate public/openapi.json

# Generate client SDK
npx openapi-generator-cli generate -i public/openapi.json -g javascript -o ./sdk

# Run API tests
npm run test:api
```

### Documentation Generation
```bash
# Generate HTML docs
npx redoc-cli build public/openapi.json --output docs/api.html

# Generate Markdown docs
npx swagger-codegen generate -i public/openapi.json -l html2 -o ./docs
```

## 🔐 Security Considerations

### Access Control
- All endpoints require authentication except health check
- Session-based isolation prevents cross-user data access
- Optional rate limiting on resource-intensive operations

### Data Privacy
- User data encrypted in transit and at rest
- Session data can be completely deleted
- Configurable data retention policies

### Input Validation
- All inputs validated against OpenAPI schemas
- SQL injection prevention
- XSS protection on content fields

## 📊 Monitoring & Analytics

### Health Checks
- `/health` endpoint for system status
- Database connectivity monitoring
- Agent system status indicators

### Metrics Collection
- API usage statistics
- Agent performance metrics
- User session analytics
- Error rate monitoring

## 🚀 Future Enhancements

### Planned API Extensions
- **Batch operations** - Multiple session management
- **Webhooks** - External system notifications
- **API versioning** - Backward compatibility
- **GraphQL endpoint** - Flexible data querying

### Additional Agent Types
- **Synthesis agents** - Cross-source synthesis
- **Fact-checking agents** - Information verification
- **Translation agents** - Multi-language support
- **Visualization agents** - Advanced chart generation

---

The VSI Agent System API is now fully documented and ready for production use. The comprehensive OpenAPI specification ensures that developers can easily integrate with the system and understand all available functionality.
