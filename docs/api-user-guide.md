# Tydids - API User Guide

*Complete REST API reference and integration guide*

## 🚀 Getting Started

### Base URL
```
https://your-tydids-instance.com/api
```

### Authentication
All API endpoints require JWT token authentication:

```bash
# Login to get token
curl -X POST https://your-instance.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'

# Response
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "your_username",
      "email": "user@example.com",
      "tier": "pro",
      "isAdmin": false
    }
  }
}
```

### Using the Token
Include the JWT token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://your-instance.com/api/collections
```

## 📚 Core API Endpoints

### Authentication Endpoints

#### POST /api/auth/login
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_string",
    "user": {
      "id": 1,
      "username": "user",
      "email": "user@example.com",
      "tier": "pro",
      "isAdmin": false
    }
  }
}
```

#### POST /api/auth/register
Register new user (if self-registration is enabled).

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string"
}
```

### User Management Endpoints

#### GET /api/users/profile
Get current user profile information.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "user",
    "email": "user@example.com",
    "tier": "pro",
    "isAdmin": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### PUT /api/users/profile
Update user profile information.

**Request Body:**
```json
{
  "email": "new_email@example.com"
}
```

#### POST /api/users/change-password
Change user password.

**Request Body:**
```json
{
  "currentPassword": "current_password",
  "newPassword": "new_password"
}
```

#### GET /api/users/usage
Get current user's usage statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "tier": "pro",
    "limits": {
      "collections": 25,
      "documents_per_collection": 1000,
      "searches_per_month": 10000,
      "uploads_per_month": 500,
      "storage_bytes": 10737418240
    },
    "usage": {
      "collections": 5,
      "documents": 150,
      "searches": 1250,
      "uploads": 45,
      "storage_bytes": 2147483648
    }
  }
}
```

### Collection Management

#### GET /api/collections
List all user collections.

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Items per page (default: 50)
- `search` (optional): Search collections by name

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Research Papers",
      "description": "Academic research collection",
      "document_count": 25,
      "total_size_bytes": 52428800,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "pages": 1
  }
}
```

#### POST /api/collections
Create a new collection.

**Request Body:**
```json
{
  "name": "My New Collection",
  "description": "Optional description"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "My New Collection",
    "description": "Optional description",
    "document_count": 0,
    "total_size_bytes": 0,
    "created_at": "2024-01-20T12:00:00.000Z",
    "updated_at": "2024-01-20T12:00:00.000Z"
  }
}
```

#### GET /api/collections/{id}
Get specific collection details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Research Papers",
    "description": "Academic research collection",
    "document_count": 25,
    "total_size_bytes": 52428800,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z",
    "qdrant_collection_name": "user_1_collection_1"
  }
}
```

#### PUT /api/collections/{id}
Update collection information.

**Request Body:**
```json
{
  "name": "Updated Collection Name",
  "description": "Updated description"
}
```

#### DELETE /api/collections/{id}
Delete a collection and all its documents.

**Response:**
```json
{
  "success": true,
  "message": "Collection deleted successfully"
}
```

#### GET /api/collections/{id}/documents
List documents in a collection.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `search` (optional): Search documents by filename

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "research_paper.pdf",
      "content_type": "application/pdf",
      "size_bytes": 2097152,
      "chunk_count": 15,
      "created_at": "2024-01-10T14:30:00.000Z",
      "processing_status": "completed"
    }
  ]
}
```

#### GET /api/collections/{id}/stats
Get collection statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "document_count": 25,
    "total_size_bytes": 52428800,
    "chunk_count": 847,
    "avg_chunk_size": 512,
    "processing_status": {
      "completed": 23,
      "processing": 1,
      "failed": 1
    },
    "file_types": {
      "pdf": 15,
      "docx": 8,
      "txt": 2
    }
  }
}
```

### Document Management

#### POST /api/collections/{id}/documents/upload
Upload files to a collection.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `files`: File(s) to upload (multiple files supported)

**Example using curl:**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@document1.pdf" \
  -F "files=@document2.docx" \
  https://your-instance.com/api/collections/1/documents/upload
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploaded": 2,
    "failed": 0,
    "results": [
      {
        "filename": "document1.pdf",
        "id": 10,
        "status": "processing"
      },
      {
        "filename": "document2.docx",
        "id": 11,
        "status": "processing"
      }
    ]
  }
}
```

#### POST /api/collections/{id}/documents/upload-url
Upload document from URL.

**Request Body:**
```json
{
  "url": "https://example.com/document.pdf",
  "filename": "optional_custom_name.pdf"
}
```

#### POST /api/collections/{id}/documents/create-text
Create text document directly.

**Request Body:**
```json
{
  "filename": "my_notes.txt",
  "content": "This is the text content of my document..."
}
```

#### DELETE /api/collections/{id}/documents/{documentId}
Delete a specific document.

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### Search and Q&A

#### POST /api/collections/{id}/search
Search within a specific collection.

**Request Body:**
```json
{
  "query": "machine learning algorithms",
  "limit": 10,
  "threshold": 0.7
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "chunk_id": "chunk_123",
        "document_id": 5,
        "filename": "ml_paper.pdf",
        "content": "Machine learning algorithms are computational methods...",
        "similarity": 0.89,
        "metadata": {
          "page": 3,
          "chunk_index": 2
        }
      }
    ],
    "query": "machine learning algorithms",
    "total_results": 15,
    "execution_time_ms": 45
  }
}
```

#### POST /api/collections/{id}/ask
Ask a question about collection content.

**Request Body:**
```json
{
  "question": "What are the main benefits of machine learning?",
  "max_chunks": 5,
  "temperature": 0.3
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answer": "Based on your documents, the main benefits of machine learning include:\n\n1. **Automation**: ML algorithms can automate complex decision-making processes...",
    "sources": [
      {
        "document_id": 5,
        "filename": "ml_paper.pdf",
        "chunk_content": "Machine learning enables automation...",
        "similarity": 0.92
      }
    ],
    "question": "What are the main benefits of machine learning?",
    "execution_time_ms": 1250
  }
}
```

#### GET /api/search
Global search across all user collections.

**Query Parameters:**
- `q`: Search query (required)
- `limit`: Maximum results (default: 10)
- `threshold`: Similarity threshold (default: 0.5)
- `collections`: Comma-separated collection IDs to search

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "https://your-instance.com/api/search?q=artificial%20intelligence&limit=20"
```

### Smart Context Generation

#### POST /api/collections/{id}/smart-context
Generate intelligent context for a query.

**Request Body:**
```json
{
  "query": "renewable energy trends",
  "maxContextSize": 8000,
  "maxChunks": 20,
  "includeClusterMetadata": true,
  "diversityWeight": 0.3,
  "clusterContextWeight": 0.2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "context": "# Renewable Energy Trends Analysis\n\nBased on the comprehensive analysis...",
    "metadata": {
      "query": "renewable energy trends",
      "collectionId": 1,
      "collectionName": "Energy Research",
      "chunks": 18,
      "contextSize": 7542,
      "clustersRepresented": ["Solar Energy", "Wind Power", "Policy Framework"],
      "diversityScore": 0.78,
      "averageRelevance": 0.84
    }
  }
}
```

#### POST /api/collections/{id}/smart-context/preview
Preview smart context configuration.

**Request Body:**
```json
{
  "query": "renewable energy trends",
  "maxContextSize": 8000,
  "maxChunks": 20
}
```

#### GET /api/collections/{id}/smart-context/capabilities
Get smart context capabilities for a collection.

### Clustering

#### GET /api/clusters
List user's clusters.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Technology Papers",
      "description": "AI and ML research papers",
      "collection_count": 3,
      "document_count": 45,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/clusters
Create a new cluster.

**Request Body:**
```json
{
  "name": "Research Cluster",
  "description": "Academic research papers",
  "collections": [1, 3, 5]
}
```

#### GET /api/clusters/{id}
Get cluster details.

#### POST /api/clusters/{id}/collections/{collectionId}
Add collection to cluster.

#### GET /api/clusters/{id}/stats
Get cluster statistics.

## 🤖 Agent System API

### Session Management

#### POST /api/agents/sessions
Create new research session.

**Request Body:**
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

#### GET /api/agents/sessions
List user's research sessions.

**Query Parameters:**
- `status`: Filter by status (active, completed, failed)
- `page`: Page number
- `limit`: Items per page

#### GET /api/agents/sessions/{sessionId}
Get session details.

#### POST /api/agents/sessions/{sessionId}/agents/start
Start agents for research.

**Request Body:**
```json
{
  "agentTypes": ["orchestrator", "source_discovery", "content_analysis"]
}
```

#### GET /api/agents/sessions/{sessionId}/status
Get real-time session status.

#### GET /api/agents/sessions/{sessionId}/events
Server-sent events for real-time updates.

**Example (JavaScript):**
```javascript
const eventSource = new EventSource('/api/agents/sessions/123/events', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Agent update:', data);
};
```

### Artifacts

#### GET /api/agents/sessions/{sessionId}/artifacts
List generated artifacts.

#### GET /api/agents/artifacts/{artifactId}
Get specific artifact.

#### GET /api/agents/artifacts/{artifactId}/download
Download artifact file.

## 🔗 External Content API

### Web Search

#### POST /api/external/search
Search the web for content.

**Request Body:**
```json
{
  "query": "latest AI research 2024",
  "maxResults": 20,
  "sources": ["google", "bing", "duckduckgo"]
}
```

#### POST /api/external/analyze-url
Analyze web page content.

**Request Body:**
```json
{
  "url": "https://example.com/article",
  "includeContent": true,
  "extractMetadata": true
}
```

### Collection Integration

#### POST /api/external/save-to-collection
Save external content to collection.

**Request Body:**
```json
{
  "collectionId": 1,
  "sources": [
    {
      "url": "https://example.com/article1",
      "title": "Custom Title"
    },
    {
      "url": "https://example.com/article2"
    }
  ]
}
```

## 🔧 Admin API Endpoints

### User Management (Admin Only)

#### GET /api/admin/users
List all users with filtering.

**Query Parameters:**
- `search`: Search by username or email
- `tier`: Filter by tier (free, pro, enterprise)
- `isAdmin`: Filter by admin status
- `page`: Page number
- `limit`: Items per page

#### POST /api/admin/users
Create new user.

**Request Body:**
```json
{
  "username": "newuser",
  "password": "secure_password",
  "email": "user@example.com",
  "tier": "pro",
  "isAdmin": false
}
```

#### PUT /api/admin/users/{username}
Update user information.

#### DELETE /api/admin/users/{username}
Delete user account.

### System Health

#### GET /api/admin/system/health
Get comprehensive system health status.

**Response:**
```json
{
  "success": true,
  "data": {
    "database": {
      "status": "healthy",
      "lastCheck": "2024-01-20T12:00:00.000Z"
    },
    "qdrant": {
      "status": "healthy",
      "lastCheck": "2024-01-20T12:00:00.000Z"
    },
    "embeddings": {
      "status": "healthy",
      "lastCheck": "2024-01-20T12:00:00.000Z"
    },
    "usageTracking": {
      "events24h": 1250
    },
    "storage": {
      "totalBytes": 10737418240,
      "usersWithStorage": 45
    },
    "uptime": 86400
  }
}
```

### Analytics

#### GET /api/admin/analytics/monthly
Get monthly analytics data.

#### GET /api/admin/analytics/top-users
Get top users by activity.

#### GET /api/admin/analytics/collections
Get collection statistics.

## 📝 Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation error details"
  }
}
```

### Common HTTP Status Codes
- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

### Error Codes
- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_ERROR`: Invalid credentials
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `TIER_LIMIT_EXCEEDED`: Usage limit exceeded
- `PROCESSING_ERROR`: Document processing failed
- `EXTERNAL_SERVICE_ERROR`: External API error

## 🚀 Rate Limiting

### Rate Limits by Endpoint Type
- **Authentication**: 5 requests per minute
- **General API**: 100 requests per minute
- **Search/AI**: 10 requests per minute
- **Upload**: 5 requests per minute

### Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 📊 Pagination

### Standard Pagination Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## 🔗 Webhooks (Future)

### Webhook Events
- `document.processed`: Document processing completed
- `search.completed`: Search operation finished
- `agent.completed`: Agent task completed
- `user.created`: New user registered
- `collection.created`: New collection created

### Webhook Payload Example
```json
{
  "event": "document.processed",
  "timestamp": "2024-01-20T12:00:00.000Z",
  "data": {
    "documentId": 123,
    "collectionId": 45,
    "userId": 67,
    "status": "completed",
    "chunkCount": 15
  }
}
```

## 🛠️ SDKs and Libraries

### JavaScript/Node.js
```javascript
const TydidsClient = require('tydids-sdk');

const client = new TydidsClient({
  baseUrl: 'https://your-instance.com',
  token: 'your_jwt_token'
});

// Create collection
const collection = await client.collections.create({
  name: 'My Collection',
  description: 'Test collection'
});

// Upload document
const upload = await client.documents.upload(collection.id, 'path/to/file.pdf');

// Search
const results = await client.search.query(collection.id, 'search query');
```

### Python
```python
from tydids import TydidsClient

client = TydidsClient(
    base_url='https://your-instance.com',
    token='your_jwt_token'
)

# Create collection
collection = client.collections.create(
    name='My Collection',
    description='Test collection'
)

# Upload document
upload = client.documents.upload(collection.id, 'path/to/file.pdf')

# Search
results = client.search.query(collection.id, 'search query')
```

### cURL Examples

#### Complete Workflow Example
```bash
#!/bin/bash

# Set variables
BASE_URL="https://your-instance.com/api"
USERNAME="your_username"
PASSWORD="your_password"

# 1. Login and get token
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.data.token')

echo "Token: $TOKEN"

# 2. Create collection
COLLECTION=$(curl -s -X POST "$BASE_URL/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API Test Collection","description":"Test via API"}')

COLLECTION_ID=$(echo $COLLECTION | jq -r '.data.id')
echo "Collection ID: $COLLECTION_ID"

# 3. Upload document
curl -X POST "$BASE_URL/collections/$COLLECTION_ID/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@test_document.pdf"

# 4. Search
curl -X POST "$BASE_URL/collections/$COLLECTION_ID/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"test search","limit":5}'

# 5. Ask question
curl -X POST "$BASE_URL/collections/$COLLECTION_ID/ask" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?"}'
```

---

*For more examples and advanced usage, visit our GitHub repository or contact technical support.*
