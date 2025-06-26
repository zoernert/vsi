const express = require('express');
const router = express.Router();
const path = require('path');

// Serve static files from both public and src/public directories
router.use(express.static(path.join(__dirname, '..', '..', 'public')));
router.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint to get server configuration (public - no auth required)
router.get('/api/config', (req, res) => {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    res.json({
        baseUrl,
        version: '1.0.0',
        features: {
            selfRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true',
            rapidApiSupport: process.env.ALLOW_RAPIDAPI_USERS === 'true',
            mcpSupport: true
        }
    });
});

// Main landing page (the nice looking index.html)
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// User dashboard (functional dashboard)
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'dashboard.html'));
});

// Also serve dashboard at /dashboard.html for direct access
router.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'dashboard.html'));
});

// Legacy route support
router.get('/index.html', (req, res) => {
    // Redirect index.html requests to the main landing page
    res.redirect('/');
});

// Serve login page
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'login.html'));
});

// Serve admin dashboard
router.get('/admin/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin', 'dashboard.html'));
});

// Redirect /admin to /admin/dashboard.html
router.get('/admin', (req, res) => {
    res.redirect('/admin/dashboard.html');
});

// Redirect /admin/ to /admin/dashboard.html
router.get('/admin/', (req, res) => {
    res.redirect('/admin/dashboard.html');
});

// Serve comprehensive documentation
router.get('/documentation', async (req, res) => {
    try {
        const fs = require('fs');
        
        // Create comprehensive documentation content
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        const documentation = `
# VSI Vector Store - Complete User Guide

## Quick Start

### 1. Authentication
- **Login**: Use the login form in the top-right corner
- **Registration**: Contact your administrator for account creation
- **Admin Access**: Admin users can access ${baseUrl}/admin/ for user management

### 2. Collections Management
- **Create Collection**: Click "Create Collection" button and provide a name
- **View Collections**: All your collections are listed in the Collections tab
- **Delete Collection**: Click the trash icon next to any collection

### 3. Document Upload & Management
- **Upload Files**: Select a collection, then drag & drop files or click "Upload Files"
- **Supported Formats**: TXT, MD, PDF, DOCX, XLSX, and images (with AI description)
- **Create Text Documents**: Use "Create Text Document" to add content directly
- **View Documents**: Browse all documents in the Documents section of each collection

### 4. Search & Q&A
- **Semantic Search**: Use natural language queries to find relevant documents
- **AI Q&A**: Ask questions about your documents and get intelligent answers
- **Search Results**: View relevance scores and document previews

## API Integration

### Authentication
All API calls require authentication. Get your token by logging in:

\`\`\`bash
# Login to get token
curl -X POST ${baseUrl}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"your-username","password":"your-password"}'

# Use token in subsequent requests
curl -H "Authorization: Bearer YOUR_TOKEN" ${baseUrl}/api/collections
\`\`\`

### Collection Operations
\`\`\`bash
# List collections
curl -H "Authorization: Bearer YOUR_TOKEN" ${baseUrl}/api/collections

# Create collection
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"my-collection","description":"My collection"}' \\
  ${baseUrl}/api/collections

# Delete collection
curl -X DELETE -H "Authorization: Bearer YOUR_TOKEN" \\
  ${baseUrl}/api/collections/{collection-id}
\`\`\`

### Document Operations
\`\`\`bash
# Upload file
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "file=@document.pdf" \\
  ${baseUrl}/api/collections/my-collection/upload

# Create text document
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Document","content":"Document content here"}' \\
  ${baseUrl}/api/collections/my-collection/create-text

# Search documents
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"search terms","limit":10}' \\
  ${baseUrl}/api/collections/my-collection/search

# AI Q&A
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is this document about?"}' \\
  ${baseUrl}/api/collections/my-collection/ask
\`\`\`

## Advanced Features

### Qdrant Compatibility
This service is fully compatible with Qdrant client libraries:

\`\`\`python
from qdrant_client import QdrantClient

client = QdrantClient(
    url="${baseUrl}",
    api_key="your-jwt-token"
)

# Standard Qdrant operations work
collections = client.get_collections()
\`\`\`

### MCP Integration
For AI assistants supporting Model Context Protocol:

\`\`\`json
{
  "mcpServers": {
    "vsi-vector-store": {
      "command": "node",
      "args": ["src/mcp-server.js"],
      "cwd": "/path/to/vsi",
      "env": {
        "QDRANT_URL": "${baseUrl.replace('http://', 'http://').replace('https://', 'https://')}/api/v1/qdrant",
        "GOOGLE_AI_API_KEY": "your-api-key"
      }
    }
  }
}
\`\`\`

## Troubleshooting

### Common Issues
1. **Login Problems**: Check username/password, contact admin if registration is disabled
2. **Upload Failures**: Verify file format and size limits based on your subscription tier
3. **Search Returns Nothing**: Ensure documents are uploaded and indexed properly
4. **API Errors**: Verify token is valid and not expired

### Support
- **Documentation**: ${baseUrl}/documentation
- **LLM Integration Guide**: ${baseUrl}/llm-documentation.txt
- **API Reference**: ${baseUrl}/openapi.json
- **Admin Dashboard**: ${baseUrl}/admin/ (admin users only)

## Subscription Tiers

### Free Tier
- 100 documents
- 500MB storage
- 1,000 API calls/month
- 3 collections
- 10MB max file size

### Paid Tiers
Contact your administrator for tier upgrades and expanded limits.

---
Generated on ${new Date().toISOString()}
        `;
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(documentation.trim());
    } catch (error) {
        console.error('Error serving documentation:', error);
        res.status(500).send('Error loading documentation');
    }
});

// LLM-specific documentation
router.get('/llm-documentation.txt', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Try to read the template file first
        const templatePath = path.join(__dirname, '..', '..', 'public', 'llm-documentation.txt');
        let content;
        
        if (fs.existsSync(templatePath)) {
            content = fs.readFileSync(templatePath, 'utf8');
            // Replace placeholders
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            content = content.replace(/\{\{BASE_URL\}\}/g, baseUrl);
        } else {
            // Fallback content
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            content = `# VSI Vector Store API Documentation

This is a vector store service with document upload and semantic search capabilities.

Base URL: ${baseUrl}

## Authentication
All endpoints require JWT authentication:
Authorization: Bearer YOUR_TOKEN

## Key Endpoints
- POST ${baseUrl}/api/auth/login - Login to get token
- GET ${baseUrl}/api/collections - List collections
- POST ${baseUrl}/api/collections/COLLECTION/upload - Upload file
- POST ${baseUrl}/api/collections/COLLECTION/search - Search documents
- POST ${baseUrl}/api/collections/COLLECTION/ask - AI Q&A

For complete documentation, visit: ${baseUrl}/documentation
`;
        }
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
    } catch (error) {
        console.error('Error serving LLM documentation:', error);
        res.status(500).send('Error loading documentation');
    }
});

// Serve OpenAPI specification
router.get('/openapi.json', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'openapi.json'));
});

// Serve API documentation redirect
router.get('/api-docs', (req, res) => {
    res.redirect('/openapi.json');
});

module.exports = router;
