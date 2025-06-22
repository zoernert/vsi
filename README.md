# VSI Vector Store Service

A Qdrant-compatible vector store service with document upload, processing, and semantic search capabilities. Provides both a web UI and REST API for managing vector collections and performing semantic search on documents.

**Now includes MCP (Model Context Protocol) support for AI assistant integration!**

## Features

- **Qdrant-Compatible API**: Direct compatibility with Qdrant client libraries
- **Document Processing**: Upload and automatically index text files, PDFs, and more
- **Semantic Search**: Natural language search using Google's embedding models
- **Web Interface**: User-friendly dashboard for collection and document management
- **Authentication**: JWT-based authentication with user management
- **Text Creation**: Create and index text documents directly through the interface
- **Collection Management**: Create, delete, and manage vector collections
- **Document Browser**: Browse and manage indexed documents
- **🆕 MCP Support**: Integration with AI assistants via Model Context Protocol

## Prerequisites

- Node.js 18+
- Qdrant instance (local or remote)
- Google AI API key for embeddings

## Quick Start

### Option 1: Docker (Recommended)

The easiest way to get started is using Docker, which includes Qdrant and handles all dependencies:

```bash
# Clone and setup
git clone <your-repo>
cd vsi

# Copy environment file and configure
cp .env.docker .env
# Edit .env with your Google AI API key

# Run setup script
chmod +x scripts/docker-setup.sh
./scripts/docker-setup.sh
```

The setup script will:
- ✅ Validate your environment configuration
- ✅ Create necessary directories with proper permissions
- ✅ Build and start both Qdrant and VSI services
- ✅ Wait for services to be healthy
- ✅ Show you the service URLs and status

**Service URLs after setup:**
- **VSI Web Interface**: http://localhost:3000
- **Qdrant API**: http://localhost:6333
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### Option 2: Manual Installation

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Setup Qdrant

Using Docker:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

Or install Qdrant locally following the [official documentation](https://qdrant.tech/documentation/quick-start/).

#### 3. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
QDRANT_URL=http://localhost:6333

# Authentication
JWT_SECRET=your-very-secure-secret-key-here
# API_KEY=your-api-key-here  # Optional: for API key authentication

# Google AI (required for embeddings)
GOOGLE_AI_API_KEY=your-google-ai-key-here

# Server
PORT=3000
```

#### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

#### 5. Access the Application

- **Web Interface**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api-docs (OpenAPI spec at http://localhost:3000/openapi.json)

## Usage

### Web Interface

1. **Register/Login**: Create an account or login at http://localhost:3000/login
2. **Create Collections**: Use the dashboard to create vector collections
3. **Upload Documents**: Upload files (TXT, MD, PDF) to be automatically indexed
4. **Create Text Documents**: Create and index text content directly
5. **Search**: Perform semantic search across your collections
6. **Browse Documents**: View and manage all documents in your collections

### API Usage

#### Authentication

All API endpoints require authentication. You can use either:

1. **JWT Bearer Token** (from login):
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/collections
```

2. **API Key** (if configured):
```bash
curl -H "api-key: YOUR_API_KEY" http://localhost:3000/collections
```

#### Basic Operations

**List Collections:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/collections
```

**Create Collection:**
```bash
curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":768,"distance":"Cosine"}}' \
  http://localhost:3000/collections/my_collection
```

**Upload Document:**
```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.txt" \
  http://localhost:3000/api/collections/my_collection/upload
```

**Search Documents:**
```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"machine learning","limit":10}' \
  http://localhost:3000/api/collections/my_collection/search
```

### Qdrant Client Compatibility

The service is compatible with standard Qdrant client libraries:

```python
from qdrant_client import QdrantClient

client = QdrantClient(
    url="http://localhost:3000",
    api_key="your-jwt-token"  # Use your JWT token as API key
)

# Standard Qdrant operations work
collections = client.get_collections()
points = client.search(
    collection_name="my_collection",
    query_vector=[0.1, 0.2, 0.3, ...],
    limit=10
)
```

```javascript
import { QdrantClient } from '@qdrant/qdrant-js';

const client = new QdrantClient({
  url: 'http://localhost:3000',
  apiKey: 'your-jwt-token'
});

// Search vectors
const searchResult = await client.search('my_collection', {
  vector: [0.1, 0.2, 0.3, ...],
  limit: 10
});
```

## MCP (Model Context Protocol) Integration

This service now acts as an MCP server, allowing AI assistants to interact with your vector store directly.

### MCP Tools Available

1. **list_collections** - List all available vector collections
2. **create_collection** - Create a new vector collection
3. **delete_collection** - Delete a vector collection
4. **add_document** - Add text documents with automatic embedding generation
5. **search_documents** - Semantic search across documents
6. **get_document** - Retrieve specific documents by ID
7. **delete_document** - Delete documents from collections
8. **list_documents** - Browse all documents in a collection

### Using with Claude Desktop

1. Install the MCP server:
```bash
npm install
```

2. Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "vsi-vector-store": {
      "command": "node",
      "args": ["src/mcp-server.js"],
      "cwd": "/home/thorsten/Development/vsi",
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "GOOGLE_AI_API_KEY": "your-google-ai-key-here"
      }
    }
  }
}
```

3. Restart Claude Desktop

4. Now you can ask Claude to:
   - "Create a new collection called 'research_papers'"
   - "Add this document to my knowledge base..."
   - "Search for documents about machine learning"
   - "Show me all documents in my collection"

### Using with Other MCP Clients

Run the MCP server standalone:
```bash
npm run mcp
```

### MCP Examples

**Create a collection:**
```
Please create a new vector collection called "my_knowledge" for storing research documents.
```

**Add documents:**
```
Add this document to my knowledge collection:
Title: "Introduction to Vector Databases"
Content: "Vector databases are specialized databases designed to store and query high-dimensional vectors..."
```

**Search documents:**
```
Search my knowledge collection for documents about "machine learning algorithms" and show me the top 5 results.
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Collections
- `GET /collections` - List collections
- `PUT /collections/{name}` - Create collection
- `GET /collections/{name}` - Get collection info
- `DELETE /collections/{name}` - Delete collection

### Documents
- `POST /api/collections/{collection}/upload` - Upload file
- `POST /api/collections/{collection}/create-text` - Create text document
- `GET /api/collections/{collection}/documents` - List documents
- `GET /api/collections/{collection}/documents/{id}` - Get document
- `DELETE /api/collections/{collection}/documents/{id}` - Delete document

### Search
- `POST /api/collections/{collection}/search` - Semantic search

### Qdrant Compatible
- `POST /collections/{collection}/points/search` - Vector search
- `PUT /collections/{collection}/points` - Upsert points
- `POST /collections/{collection}/points` - Get points by IDs
- `POST /collections/{collection}/points/delete` - Delete points

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `QDRANT_URL` | Qdrant instance URL | Yes | `http://localhost:6333` |
| `JWT_SECRET` | Secret for JWT tokens | Yes | - |
| `API_KEY` | Optional API key for authentication | No | - |
| `GOOGLE_AI_API_KEY` | Google AI API key for embeddings | Yes | - |
| `PORT` | Server port | No | `3000` |

### Supported File Types

- **Text files**: `.txt`, `.md`
- **PDFs**: `.pdf` (basic support, filename indexing)
- **Other**: Files are indexed by filename

> **Note**: For better PDF text extraction, consider integrating libraries like `pdf-parse` or `pdf2pic`.

## Development

### Project Structure

```
src/
├── config/
│   └── qdrant.js          # Qdrant client configuration
├── middleware/
│   ├── auth.js            # Authentication middleware
│   └── qdrantProxy.js     # Qdrant proxy middleware
├── routes/
│   ├── authRoutes.js      # Authentication endpoints
│   ├── collections.js    # Qdrant-compatible collection routes
│   ├── collectionRoutes.js # Internal collection management
│   ├── points.js          # Qdrant-compatible point operations
│   ├── uploadRoutes.js    # Document upload and search
│   └── webRoutes.js       # Web UI routes
├── public/                # Static web assets
├── utils/
│   └── errorHandler.js    # Error handling middleware
├── mcp-server.js          # 🆕 MCP server implementation
└── index.js               # Main server file
```

### Adding New Features

1. **New File Types**: Extend `extractTextFromFile()` in `uploadRoutes.js`
2. **Custom Embeddings**: Modify `generateEmbedding()` function
3. **Additional Search Filters**: Extend search endpoints with custom filters
4. **User Isolation**: Add user-specific collection filtering

### Testing

```bash
# Run the server in development mode
npm run dev

# Test authentication
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  http://localhost:3000/api/auth/register

curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  http://localhost:3000/api/auth/login
```

## Deployment

### Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart
```

### Production Deployment

For production, use the production Dockerfile:

```bash
# Build production image
docker build -f Dockerfile.production -t vsi-vector-store:latest .

# Run with docker-compose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment Variables for Docker

When using Docker, set these environment variables in your `.env` file:

```bash
# Required
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
JWT_SECRET=your-very-secure-jwt-secret-at-least-32-characters-long

# Optional
API_KEY=your-optional-api-key-for-direct-access
MCP_LOG_LEVEL=info
```

### Data Persistence

Docker volumes are configured for persistence:
- **Qdrant data**: `./data/qdrant` - Vector database storage
- **User data**: `./data/users` - User accounts and settings
- **Uploads**: `./uploads` - Uploaded files

### Docker Commands

```bash
# View service status
docker-compose ps

# View logs for specific service
docker-compose logs -f vsi-service
docker-compose logs -f qdrant

# Access VSI service shell
docker-compose exec vsi-service sh

# Access Qdrant service shell
docker-compose exec qdrant sh

# Rebuild services
docker-compose build --no-cache

# Remove all data (⚠️ destructive)
docker-compose down -v
sudo rm -rf data/ uploads/
```

### Troubleshooting Docker

**Services won't start:**
```bash
# Check logs
docker-compose logs

# Check if ports are already in use
netstat -tulpn | grep :3000
netstat -tulpn | grep :6333
```

**Permission issues:**
```bash
# Fix directory permissions
sudo chown -R $USER:$USER data/ uploads/
chmod -R 755 data/ uploads/
```

**Qdrant connection issues:**
```bash
# Test Qdrant connectivity
curl http://localhost:6333/health
docker-compose exec vsi-service curl http://qdrant:6333/health
```

### Production Considerations

1. **Security**:
   - Use strong JWT secrets (at least 32 characters)
   - Implement rate limiting
   - Add HTTPS support with reverse proxy
   - Hash passwords with bcrypt
   - Run containers as non-root users ✅

2. **Performance**:
   - Implement connection pooling
   - Add caching for embeddings
   - Use a proper database for user management
   - Configure Qdrant for your workload

3. **Monitoring**:
   - Add logging middleware
   - Implement health checks ✅
   - Monitor Qdrant performance
   - Set up container monitoring

4. **Backup**:
   - Regular backup of `./data/qdrant` directory
   - Backup user data in `./data/users`
   - Consider automated backup solutions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Support

For issues and questions:
- Check the [OpenAPI documentation](http://localhost:3000/openapi.json)
- Review the code examples in this README
- Open an issue on the project repository
