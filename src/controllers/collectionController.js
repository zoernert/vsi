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
      // This would need to be implemented with file upload middleware
      res.status(501).json({ message: 'Upload document not yet implemented' });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ message: 'Failed to upload document' });
    }
  }

  async uploadFromUrl(req, res) {
    try {
      res.status(501).json({ message: 'Upload from URL not yet implemented' });
    } catch (error) {
      console.error('Upload from URL error:', error);
      res.status(500).json({ message: 'Failed to upload from URL' });
    }
  }

  async createTextDocument(req, res) {
    try {
      res.status(501).json({ message: 'Create text document not yet implemented' });
    } catch (error) {
      console.error('Create text document error:', error);
      res.status(500).json({ message: 'Failed to create text document' });
    }
  }

  async deleteDocument(req, res) {
    try {
      res.status(501).json({ message: 'Delete document not yet implemented' });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  }

  async reindexCollection(req, res) {
    try {
      res.status(501).json({ message: 'Reindex collection not yet implemented' });
    } catch (error) {
      console.error('Reindex collection error:', error);
      res.status(500).json({ message: 'Failed to reindex collection' });
    }
  }
}

module.exports = CollectionController;
