# Smart Context Feature Documentation

## Overview

The Smart Context feature is an intelligent context creation service for VSI Vector Store that leverages both semantic search and clustering functionality to generate optimal context for AI/LLM applications. It goes beyond simple semantic search by incorporating cluster information to provide more diverse, relevant, and well-organized context.

## Architecture

### Core Components

1. **SmartContextService** (`/src/services/smartContextService.js`)
   - Main service for intelligent context creation
   - Handles semantic search, cluster analysis, and context optimization
   - Integrates with existing Qdrant vector database and cluster services

2. **SmartContextController** (`/src/controllers/smartContextController.js`)
   - API endpoint controller with comprehensive validation
   - Handles three main endpoints: generation, preview, and capabilities

3. **Frontend Integration** (`/public/index.html` + `/public/js/modules/collections-module.js`)
   - Interactive Smart Context tab in collection interface
   - Real-time preview, configuration, and results display
   - Export functionality for generated context

## API Endpoints

### 1. Generate Smart Context
```
POST /api/collections/:id/smart-context
```

**Purpose**: Generate intelligent context for a collection based on a search query

**Request Body**:
```json
{
  "query": "search query for finding relevant content",
  "maxContextSize": 8000,
  "maxChunks": 20,
  "includeClusterMetadata": true,
  "diversityWeight": 0.3,
  "clusterContextWeight": 0.2
}
```

**Response**:
```json
{
  "success": true,
  "context": "Generated intelligent context text...",
  "metadata": {
    "query": "original query",
    "collectionId": 123,
    "collectionName": "Collection Name",
    "clusterInfo": {
      "clusterName": "Named Cluster",
      "clusterDescription": "Cluster description"
    },
    "chunks": [...],
    "stats": {
      "totalChunks": 15,
      "contextSize": 7500,
      "clustersRepresented": ["Cluster A", "Cluster B"],
      "diversityScore": 0.75,
      "averageRelevance": 0.85
    }
  }
}
```

### 2. Preview Smart Context
```
POST /api/collections/:id/smart-context/preview
```

**Purpose**: Preview context configuration without full generation

**Request Body**:
```json
{
  "query": "search query",
  "maxContextSize": 8000,
  "maxChunks": 20
}
```

### 3. Get Capabilities
```
GET /api/collections/:id/smart-context/capabilities
```

**Purpose**: Get collection information and recommended settings

## Smart Context Algorithm

### 1. Semantic Search Phase
- Generates embeddings for the user query using Google's text-embedding-004 model
- Performs vector similarity search in Qdrant
- Retrieves top relevant chunks with similarity scores

### 2. Cluster Enhancement Phase
- Identifies clusters associated with found chunks
- Analyzes cluster relationships and metadata
- Applies cluster-aware scoring to boost relevant content

### 3. Diversity Optimization Phase
- Prevents over-representation from single documents
- Ensures variety across different clusters
- Balances relevance vs. diversity based on user settings

### 4. Context Assembly Phase
- Selects optimal chunks within size constraints
- Includes cluster metadata if requested
- Formats final context with proper structure

## Key Features

### Cluster-Aware Intelligence
- **Cluster Metadata Integration**: Includes cluster names and descriptions in context
- **Cross-Cluster Analysis**: Identifies relationships between different clusters
- **Cluster-Based Scoring**: Boosts content from semantically related clusters

### Intelligent Optimization
- **Size Management**: Respects maximum context size while maximizing content
- **Diversity Control**: Configurable balance between relevance and variety
- **Document Distribution**: Limits chunks per document to ensure diversity

### Advanced Analytics
- **Relevance Scoring**: Shows similarity scores for each chunk
- **Cluster Analysis**: Displays cluster distribution in results
- **Diversity Metrics**: Calculates and reports content diversity scores

## Configuration Options

### Context Size Management
- **maxContextSize** (100-50,000 chars): Maximum context length in characters
- **maxChunks** (1-100): Maximum number of document chunks to include

### Quality & Diversity Controls
- **diversityWeight** (0.0-1.0): Balance between relevance and diversity
- **clusterContextWeight** (0.0-1.0): Influence of cluster information on scoring

### Metadata Options
- **includeClusterMetadata** (boolean): Include cluster names and descriptions

## Use Cases

### AI/LLM Context Optimization
Perfect for applications that need to maximize the relevance and diversity of context provided to large language models:

```javascript
// Example: Generate context for a research question
const response = await api.createSmartContext(collectionId, {
  query: "machine learning applications in healthcare",
  maxContextSize: 12000,
  maxChunks: 25,
  diversityWeight: 0.4,
  includeClusterMetadata: true
});

// Use the generated context with your LLM
const llmResponse = await llm.chat([
  { role: "system", content: response.context },
  { role: "user", content: "What are the main benefits?" }
]);
```

### Research & Knowledge Management
- Generate comprehensive overviews of topics from document collections
- Create well-structured context that spans multiple clusters/topics
- Ensure diverse perspectives are included in analysis

### Content Summarization
- Create intelligent summaries that represent the breadth of a collection
- Include related topics through cluster relationships
- Balance depth vs. breadth based on use case

## Frontend User Experience

### Interactive Configuration
1. **Query Input**: Enter search terms with real-time validation
2. **Parameter Controls**: Adjust context size, chunk limits, and weights
3. **Preview Mode**: See estimated results before full generation
4. **Capabilities Display**: View collection cluster information and recommendations

### Results & Analytics
1. **Context Display**: Formatted, copyable context output
2. **Statistics Panel**: Key metrics about generated context
3. **Chunk Analysis**: Detailed breakdown of selected content
4. **Export Options**: Copy to clipboard or download as file

### Integration with Clusters
- Displays cluster information when available
- Shows cluster-specific recommendations
- Highlights cross-cluster relationships in results

## Technical Implementation

### Dependencies
- Google Generative AI (embeddings)
- Qdrant (vector search)
- Existing VSI cluster services
- PostgreSQL (metadata storage)

### Performance Considerations
- Efficient vector search with Qdrant
- Intelligent chunk selection to minimize processing
- Caching of embeddings and cluster information
- Streaming-friendly context generation

### Error Handling
- Comprehensive input validation
- Graceful degradation when clusters unavailable
- Fallback to basic semantic search if needed
- User-friendly error messages

## Future Enhancements

### Advanced Clustering Features
- **Dynamic Cluster Creation**: Auto-generate clusters for better context
- **Cross-Collection Context**: Include content from related collections
- **Temporal Clustering**: Consider document age and relevance over time

### Machine Learning Improvements
- **Adaptive Scoring**: Learn from user feedback to improve results
- **Query Expansion**: Automatically expand queries for better coverage
- **Contextual Embeddings**: Use query-specific embedding models

### User Experience
- **Saved Configurations**: Store frequently used parameter sets
- **Context Templates**: Predefined formats for different use cases
- **Real-time Collaboration**: Share context configurations with team members

## Conclusion

The Smart Context feature represents a significant advancement in intelligent content retrieval for VSI Vector Store. By combining semantic search with cluster awareness, it provides users with a powerful tool for generating high-quality, diverse context that maximizes the effectiveness of AI/LLM applications while maintaining the organizational benefits of the existing clustering system.
