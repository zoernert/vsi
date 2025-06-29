# Model Context Protocol (MCP) Integration Guide

## Overview

The VSI Vector Store provides comprehensive Model Context Protocol (MCP) integration, enabling AI assistants and other MCP-compatible clients to interact with your vector store using standardized tools. This integration maintains full user authentication and isolation while providing access to all VSI capabilities.

## Key Features

### User-Based Security
- ✅ **User Isolation**: All operations are scoped to authenticated users
- ✅ **Collection Privacy**: Collections are isolated per user
- ✅ **JWT Authentication**: Secure token-based authentication required
- ✅ **Role-Based Access**: Respects user permissions and role restrictions

### Complete API Integration
- ✅ **Unified Business Logic**: MCP tools use the same services as REST endpoints
- ✅ **Consistent Behavior**: Identical functionality between MCP and HTTP interfaces
- ✅ **Shared Database**: Same data access patterns and validation
- ✅ **Error Handling**: Consistent error responses across interfaces

## MCP Tool Set

The VSI MCP server provides **18 comprehensive tools**:

### Core Collection Operations
| Tool | Description | Authentication |
|------|-------------|----------------|
| `list_collections` | List user's collections with metadata | Required |
| `create_collection` | Create new collections | Required |
| `delete_collection` | Delete user's collections | Required |
| `get_collection_info` | Get detailed collection metadata | Required |

### Document Operations
| Tool | Description | Authentication |
|------|-------------|----------------|
| `add_document` | Add text documents to collections | Required |
| `upload_file` | Upload and process files (PDF, DOCX, TXT) | Required |
| `search_documents` | Semantic search across documents | Required |
| `get_document` | Retrieve specific documents | Required |
| `delete_document` | Delete documents from collections | Required |
| `list_documents` | List documents in collections | Required |

### Advanced AI Features
| Tool | Description | Authentication |
|------|-------------|----------------|
| `ask_question` | LLM-powered Q&A with smart context | Required |
| `generate_smart_context` | Generate contextual summaries | Required |

### Analytics and Clustering
| Tool | Description | Authentication |
|------|-------------|----------------|
| `list_clusters` | List user's document clusters | Required |
| `create_cluster` | Create new semantic clusters | Required |
| `delete_cluster` | Delete clusters | Required |
| `get_collection_analytics` | Collection usage and statistics | Required |
| `get_user_analytics` | User-level analytics | Required |

## Integration Interfaces

### 1. HTTP MCP Interface (Standard)

The standard HTTP interface for MCP clients that support headers:

```bash
# Get available tools
GET http://localhost:3000/api/mcp/
GET http://localhost:3000/api/mcp/tools

# Call MCP tools
POST http://localhost:3000/api/mcp/call-tool
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "list_collections",
    "arguments": {}
  }'
```

### 2. HTTP MCP Interface (Token-in-Path)

For MCP clients that cannot send HTTP headers (common limitation):

```bash
# Get available tools  
GET http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/
GET http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/tools

# Call MCP tools
POST http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/call-tool
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/mcp/token/your-jwt-token/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_documents", 
    "arguments": {
      "collectionId": "collection-123",
      "query": "machine learning",
      "limit": 5
    }
  }'
```

### 3. Stdio MCP Interface

For direct MCP client connections via stdio:

```bash
# With environment variable
export MCP_AUTH_TOKEN="your-jwt-token"
node src/mcp-server.js

# With command line argument
node src/mcp-server.js --token=your-jwt-token
```

## Authentication Methods

### 1. JWT Token Acquisition

Obtain a JWT token through the REST API:

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'

# Response includes JWT token
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "email": "user@example.com" }
}
```

### 2. Token Validation

All MCP operations validate the JWT token and extract user context:

```javascript
// Internal token validation
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const userId = decoded.userId;
// All operations are scoped to this user
```

### 3. Error Handling

Invalid or missing tokens return appropriate MCP error responses:

```json
{
  "error": {
    "code": -32000,
    "message": "Authentication required"
  }
}
```

## MCP Tool Examples

### Document Search

```json
{
  "name": "search_documents",
  "arguments": {
    "collectionId": "collection-123",
    "query": "artificial intelligence trends",
    "limit": 10,
    "threshold": 0.7
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "doc-456",
      "title": "AI Trends 2024",
      "content": "Recent developments in artificial intelligence...",
      "similarity": 0.92,
      "metadata": {
        "author": "John Doe",
        "date": "2024-01-15"
      }
    }
  ],
  "total": 1,
  "processingTime": 150
}
```

### Smart Context Generation

```json
{
  "name": "generate_smart_context",
  "arguments": {
    "collectionId": "collection-123", 
    "query": "machine learning applications",
    "maxContextSize": 4000,
    "strategy": "relevance"
  }
}
```

**Response:**
```json
{
  "context": "Machine learning has diverse applications across industries...",
  "sources": [
    {
      "documentId": "doc-789",
      "title": "ML Applications in Healthcare",
      "relevanceScore": 0.89
    }
  ],
  "metadata": {
    "tokensUsed": 3847,
    "strategy": "relevance",
    "processingTime": 250
  }
}
```

### Q&A with Context

```json
{
  "name": "ask_question",
  "arguments": {
    "collectionId": "collection-123",
    "question": "What are the main challenges in implementing AI?",
    "maxContextSize": 3000
  }
}
```

**Response:**
```json
{
  "answer": "Based on the documents in your collection, the main challenges...",
  "confidence": 0.85,
  "sources": [
    {
      "documentId": "doc-101",
      "title": "AI Implementation Challenges",
      "relevantExcerpt": "Data quality and model interpretability..."
    }
  ],
  "context": "The provided context includes information about...",
  "metadata": {
    "model": "gpt-4",
    "tokensUsed": 2847,
    "processingTime": 1200
  }
}
```

## Configuration

### Server Configuration

MCP server configuration in `src/mcp-server.js`:

```javascript
const config = {
  // Server identification
  name: "vsi-vector-store-mcp",
  version: "1.0.0",
  
  // Authentication settings
  requireAuth: true,
  jwtSecret: process.env.JWT_SECRET,
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // requests per window
  },
  
  // Tool configuration
  tools: {
    enabled: true,
    maxDocuments: 100,
    maxContextSize: 8000
  }
};
```

### Client Configuration

Example MCP client configuration:

```json
{
  "name": "VSI Vector Store",
  "serverUrl": "http://localhost:3000/api/mcp/",
  "authentication": {
    "type": "bearer",
    "token": "your-jwt-token"
  },
  "capabilities": {
    "tools": true,
    "resources": false,
    "prompts": false
  }
}
```

## Error Handling

### Common Error Responses

| Error Code | Message | Description |
|------------|---------|-------------|
| -32000 | Authentication required | Missing or invalid JWT token |
| -32001 | Collection not found | Collection doesn't exist or no access |
| -32002 | Document not found | Document doesn't exist in collection |
| -32003 | Invalid parameters | Missing or invalid tool arguments |
| -32004 | Rate limit exceeded | Too many requests in time window |
| -32005 | Service unavailable | Temporary service issues |

### Error Response Format

```json
{
  "error": {
    "code": -32001,
    "message": "Collection not found",
    "data": {
      "collectionId": "invalid-collection-id",
      "userId": 123
    }
  }
}
```

## Integration Patterns

### AI Assistant Integration

```javascript
// Example Claude/ChatGPT integration
const mcpClient = new MCPClient({
  serverUrl: "http://localhost:3000/api/mcp/",
  auth: { token: userJwtToken }
});

// Search for relevant information
const searchResults = await mcpClient.callTool("search_documents", {
  collectionId: userCollectionId,
  query: userQuestion,
  limit: 5
});

// Generate answer with context
const answer = await mcpClient.callTool("ask_question", {
  collectionId: userCollectionId,
  question: userQuestion,
  maxContextSize: 3000
});
```

### Batch Operations

```javascript
// Process multiple collections
const collections = await mcpClient.callTool("list_collections", {});

const results = await Promise.all(
  collections.map(collection => 
    mcpClient.callTool("search_documents", {
      collectionId: collection.id,
      query: "research topic",
      limit: 3
    })
  )
);
```

## Performance Considerations

### Optimization Strategies

1. **Connection Pooling**: Reuse HTTP connections for multiple tool calls
2. **Batch Requests**: Combine related operations when possible
3. **Caching**: Cache collection metadata and frequently accessed documents
4. **Rate Limiting**: Respect server rate limits to avoid throttling
5. **Timeout Handling**: Set appropriate timeouts for long-running operations

### Monitoring and Logging

The MCP server provides detailed logging:

```javascript
// Request logging
{
  timestamp: "2024-01-15T10:30:00Z",
  userId: 123,
  tool: "search_documents",
  collectionId: "collection-123", 
  processingTime: 250,
  success: true
}

// Error logging
{
  timestamp: "2024-01-15T10:31:00Z",
  userId: 123,
  tool: "invalid_tool",
  error: "Tool not found",
  errorCode: -32601
}
```

## Security Best Practices

### Token Security

1. **Secure Storage**: Store JWT tokens securely in client applications
2. **Token Rotation**: Regularly refresh JWT tokens
3. **Scope Limitation**: Use tokens with appropriate scope/permissions
4. **Secure Transport**: Always use HTTPS in production

### Access Control

1. **User Isolation**: Each user can only access their own collections
2. **Permission Checks**: All operations validate user permissions
3. **Input Validation**: All tool arguments are validated and sanitized
4. **Rate Limiting**: Prevent abuse through rate limiting

## Troubleshooting

### Common Issues

1. **Authentication Failures**: Verify JWT token validity and format
2. **Collection Access**: Ensure user has access to requested collections
3. **Tool Not Found**: Check tool name spelling and availability
4. **Rate Limiting**: Implement exponential backoff for rate-limited requests
5. **Network Issues**: Handle connection timeouts and retries

### Debugging Tools

```bash
# Test MCP server availability
curl http://localhost:3000/api/mcp/

# Validate JWT token
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{"name": "list_collections", "arguments": {}}'

# Check server logs
tail -f logs/combined.log | grep MCP
```

## See Also

- [API User Guide](api-user-guide.md) - REST API documentation
- [Agent System Guide](agent-system-guide.md) - AI agent integration
- [Admin Guide](admin-guide.md) - Server configuration and management
- [Feature Overview](feature-overview.md) - Complete system capabilities
