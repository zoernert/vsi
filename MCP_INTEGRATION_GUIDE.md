# MCP (Model Context Protocol) Integration Guide

## Overview

The VSI Vector Store now provides a comprehensive MCP (Model Context Protocol) server that integrates with the existing REST API architecture. This allows AI assistants and other MCP clients to interact with your vector store using standardized tools with full user authentication and isolation.

## Key Features

### ✅ **User-Based Isolation**
- All operations are scoped to authenticated users
- Collections are isolated per user
- JWT token authentication required for all operations

### ✅ **Complete REST API Integration**
- MCP tools now forward to the same business logic as REST endpoints
- Consistent behavior between MCP and HTTP interfaces
- Shared services and database operations

### ✅ **Enhanced Tool Set**
The MCP server now provides **18 tools** (up from 11):

#### Core Collection Operations
- `list_collections` - List user's collections
- `create_collection` - Create new collections
- `delete_collection` - Delete collections
- `get_collection_info` - Get collection metadata

#### Document Operations
- `add_document` - Add text documents
- `upload_file` - Upload and process files
- `search_documents` - Semantic search
- `get_document` - Retrieve specific documents
- `delete_document` - Delete documents
- `list_documents` - List collection documents

#### Advanced Features
- `ask_question` - LLM-powered Q&A
- `generate_smart_context` - Smart context generation
- `list_clusters` - List user's clusters
- `create_cluster` - Create new clusters
- `delete_cluster` - Delete clusters
- `get_collection_analytics` - Collection analytics
- `get_user_analytics` - User analytics

## Integration URLs

### HTTP MCP Interface (Standard)
```
POST http://localhost:3000/api/mcp/call-tool
GET  http://localhost:3000/api/mcp/
GET  http://localhost:3000/api/mcp/tools
```

### HTTP MCP Interface (Token-in-Path for Limited Clients)
For MCP clients that cannot send HTTP headers (common limitation):
```
GET  http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/
GET  http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/tools
POST http://localhost:3000/api/mcp/token/YOUR_JWT_TOKEN/call-tool
```

### Stdio MCP Interface
```bash
node src/mcp-server.js --token=YOUR_JWT_TOKEN
```

## Authentication

### JWT Token Requirements
All MCP operations require a valid JWT token. You can provide it in multiple ways:

#### 1. HTTP Authorization Header (Standard)
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer your-jwt-token-here" \
  -H "Content-Type: application/json" \
  -d '{"name": "list_collections", "arguments": {}}'
```

#### 2. Token in URL Path (For Limited Clients)
```bash
curl -X POST http://localhost:3000/api/mcp/token/your-jwt-token-here/call-tool \
  -H "Content-Type: application/json" \
  -d '{"name": "list_collections", "arguments": {}}'
```

#### 3. Environment Variable (Stdio)
```bash
export MCP_AUTH_TOKEN="your-jwt-token-here"
node src/mcp-server.js
```

#### 4. Command Line Argument (Stdio)
```bash
node src/mcp-server.js --token=your-jwt-token-here
```

### Getting a JWT Token
Obtain a JWT token by logging in through the REST API:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your-username", "password": "your-password"}'
```

## Configuration for AI Assistants

### Claude Desktop (MCP Configuration)
Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vsi-vector-store": {
      "command": "node",
      "args": ["src/mcp-server.js", "--token=YOUR_JWT_TOKEN_HERE"],
      "cwd": "/path/to/vsi",
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "GOOGLE_AI_API_KEY": "your-google-ai-key",
        "JWT_SECRET": "your-jwt-secret",
        "MCP_AUTH_TOKEN": "YOUR_JWT_TOKEN_HERE"
      }
    }
  }
}
```

### VS Code Extension (MCP Server)
```json
{
  "name": "VSI Vector Store",
  "transport": {
    "type": "stdio",
    "command": "node",
    "args": ["src/mcp-server.js"],
    "env": {
      "MCP_AUTH_TOKEN": "YOUR_JWT_TOKEN_HERE"
    }
  }
}
```

## Usage Examples

### HTTP Interface Examples

#### List Collections
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "list_collections", "arguments": {}}'
```

#### Create Collection
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "create_collection",
    "arguments": {
      "name": "my-documents",
      "description": "My personal document collection"
    }
  }'
```

#### Search Documents
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_documents",
    "arguments": {
      "collection": "my-documents",
      "query": "machine learning concepts",
      "limit": 5
    }
  }'
```

#### Generate Smart Context
```bash
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "generate_smart_context",
    "arguments": {
      "collection": "my-documents",
      "query": "What are the key machine learning algorithms?",
      "max_tokens": 4000
    }
  }'
```

## Architecture Changes

### Service Layer Integration
The MCP server now uses the same service layer as the REST API:

```
MCP Server → McpService → {
  VectorService,
  SmartContextService,
  ClusterService,
  AnalyticsService,
  UserService
} → Database/Qdrant
```

### User Isolation
- Collections are prefixed with user IDs in the database
- Qdrant collections use UUIDs for proper isolation
- All operations validate user ownership

### Error Handling
- Consistent error messages between MCP and REST interfaces
- Proper HTTP status codes in HTTP interface
- Structured error responses in MCP format

## Migration Notes

### Breaking Changes
1. **Authentication Required**: All MCP operations now require JWT tokens
2. **User Isolation**: Collections are no longer global but user-specific
3. **Collection Naming**: No more `mcp_` prefix - uses actual collection names

### Backward Compatibility
- Existing REST API endpoints unchanged
- Database schema compatible
- Qdrant collections preserved

## Development

### Adding New MCP Tools

1. **Add to McpService**:
```javascript
async newTool(token, ...args) {
  const user = await this.authenticateUser(token);
  // Implementation
}
```

2. **Add to MCP Routes**:
```javascript
case 'new_tool':
  result = await mcpService.newTool(token, ...args);
  break;
```

3. **Add to Standalone MCP Server**:
```javascript
case 'new_tool':
  const result = await mcpService.newTool(token, ...args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

### Testing

```bash
# Test HTTP interface
npm test

# Test MCP server
export MCP_AUTH_TOKEN="your-test-token"
node src/mcp-server.js

# Test specific tool
curl -X POST http://localhost:3000/api/mcp/call-tool \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"name": "list_collections", "arguments": {}}'
```

## Security Considerations

1. **JWT Token Security**: Store tokens securely, rotate regularly
2. **User Isolation**: All operations are scoped to authenticated users
3. **Input Validation**: All inputs are validated before processing
4. **Error Messages**: No sensitive information leaked in error messages

## Performance

- **Shared Services**: No performance overhead from MCP integration
- **Connection Pooling**: Database connections shared across interfaces
- **Caching**: Same caching strategies apply to both REST and MCP
- **Async Operations**: All MCP tools are properly async

## Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Verify JWT token is valid and not expired
   - Check JWT_SECRET environment variable
   - Ensure token is provided via correct method

2. **Collection Not Found**:
   - Verify collection exists for the authenticated user
   - Check collection name spelling
   - Ensure user has access to the collection

3. **Connection Issues**:
   - Verify Qdrant is running on correct port
   - Check database connection settings
   - Verify all environment variables are set

### Debug Mode
```bash
DEBUG=vsi:* node src/mcp-server.js --token=your-token
```

## Future Enhancements

- [ ] Real-time collaboration tools
- [ ] Batch operations
- [ ] Advanced clustering operations
- [ ] Stream processing tools
- [ ] Multi-collection search
- [ ] Advanced analytics tools

This MCP integration provides a robust, secure, and feature-complete interface for AI assistants to interact with your vector store while maintaining full compatibility with existing REST API functionality.
