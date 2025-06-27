class CollectionController {
  constructor(databaseService, vectorService, usageService) {
    this.db = databaseService;
    this.vectorService = vectorService;
    this.usageService = usageService;
    
    // Bind methods to maintain context
    this.createCollection = this.createCollection.bind(this);
    this.getUserCollections = this.getUserCollections.bind(this);
    this.getCollection = this.getCollection.bind(this);
    this.updateCollection = this.updateCollection.bind(this);
    this.deleteCollection = this.deleteCollection.bind(this);
    this.getCollectionDocuments = this.getCollectionDocuments.bind(this);
    this.getCollectionStats = this.getCollectionStats.bind(this);
    this.uploadDocument = this.uploadDocument.bind(this);
    this.uploadFromUrl = this.uploadFromUrl.bind(this);
    this.createTextDocument = this.createTextDocument.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.reindexCollection = this.reindexCollection.bind(this);
  }

  async createCollection(req, res) {
    try {
      const { name, description } = req.body;
      const userId = req.user.id;
      
      // Create collection using VectorService for database integration
      const collection = await this.vectorService.createCollection(userId, name, description);
      
      res.status(201).json({
        success: true,
        collection
      });
    } catch (error) {
      console.error('Create collection error:', error);
      res.status(500).json({ message: error.message || 'Failed to create collection' });
    }
  }

  async getUserCollections(req, res) {
    try {
      const userId = req.user.id;
      const includeStats = req.query.include_stats === 'true';
      
      // Get collections using VectorService with database integration
      const collections = await this.vectorService.getUserCollections(userId, includeStats);
      
      res.json(collections);
    } catch (error) {
      console.error('Get user collections error:', error);
      res.status(500).json({ message: 'Failed to get collections' });
    }
  }

  async getCollection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      // Always use id (UUID)
      const collection = await this.vectorService.getCollection(userId, id);
      if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
      }
      res.json(collection);
    } catch (error) {
      console.error('Get collection error:', error);
      res.status(500).json({ message: 'Failed to get collection' });
    }
  }

  async updateCollection(req, res) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      const userId = req.user.id;
      
      await this.vectorService.updateCollection(userId, id, { name, description });
      
      res.json({ success: true, message: 'Collection updated successfully' });
    } catch (error) {
      console.error('Update collection error:', error);
      res.status(500).json({ message: 'Failed to update collection' });
    }
  }

  async deleteCollection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      await this.vectorService.deleteCollection(userId, id);
      
      res.json({ success: true, message: 'Collection deleted successfully' });
    } catch (error) {
      console.error('Delete collection error:', error);
      res.status(500).json({ message: 'Failed to delete collection' });
    }
  }

  async getCollectionDocuments(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { type, limit = 50, offset = 0 } = req.query;
      
      const documents = await this.vectorService.getCollectionDocuments(userId, id, {
        type,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json(documents);
    } catch (error) {
      console.error('Get collection documents error:', error);
      res.status(500).json({ message: 'Failed to get documents' });
    }
  }

  async getCollectionStats(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const stats = await this.vectorService.getCollectionStats(userId, id);
      
      res.json(stats);
    } catch (error) {
      console.error('Get collection stats error:', error);
      res.status(500).json({ message: 'Failed to get collection stats' });
    }
  }

  async uploadDocument(req, res) {
    try {
      // This requires file upload middleware (e.g., multer) to be set up on the route
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }
      // The logic would be similar to document processing in index.js
      res.status(501).json({ message: 'Upload document endpoint logic not fully implemented. File received.', file: req.file.originalname });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ message: 'Failed to upload document' });
    }
  }

  async uploadFromUrl(req, res) {
    try {
      const { id } = req.params;
      const { url } = req.body;
      // In a real implementation, you would fetch the URL, process its content, and add it as a document.
      console.log(`Received request to upload from URL ${url} to collection ${id}`);
      res.status(501).json({ message: 'Upload from URL not yet implemented, but request received.' });
    } catch (error) {
      console.error('Upload from URL error:', error);
      res.status(500).json({ message: 'Failed to upload from URL' });
    }
  }

  async createTextDocument(req, res) {
    try {
      const { id } = req.params;
      const { title, content } = req.body;
      const userId = req.user.id;

      if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
      }

      const document = await this.vectorService.addTextDocument(userId, id, { title, content });
      
      res.status(201).json({
        success: true,
        message: 'Text document created successfully.',
        document
      });
    } catch (error) {
      console.error('Create text document error:', error);
      res.status(500).json({ message: 'Failed to create text document' });
    }
  }

  async deleteDocument(req, res) {
    try {
      const { collectionId, documentId } = req.params;
      const userId = req.user.id;
      await this.vectorService.deleteDocument(userId, collectionId, documentId);
      res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  }

  async reindexCollection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      // This would be a long-running background job in a real application.
      console.log(`Received request to re-index collection ${id} for user ${userId}`);
      res.status(501).json({ message: 'Re-indexing is a complex operation and not yet implemented.' });
    } catch (error) {
      console.error('Reindex collection error:', error);
      res.status(500).json({ message: 'Failed to reindex collection' });
    }
  }
}

module.exports = CollectionController;
