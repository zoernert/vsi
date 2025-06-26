class SearchController {
  constructor(vectorService, llmQaService, usageService) {
    this.vectorService = vectorService;
    this.llmQaService = llmQaService;
    this.usageService = usageService;
    
    // Bind methods to maintain context
    this.searchCollection = this.searchCollection.bind(this);
    this.askQuestion = this.askQuestion.bind(this);
    this.searchDocuments = this.searchDocuments.bind(this);
    this.searchUserCollections = this.searchUserCollections.bind(this);
    this.publicSearch = this.publicSearch.bind(this);
    this.getDocumentContent = this.getDocumentContent.bind(this);
    this.getSimilarDocuments = this.getSimilarDocuments.bind(this);
  }

  async searchCollection(req, res) {
    try {
      const { id } = req.params;
      const { query, limit = 10 } = req.body;
      const userId = req.user.id;
      
      const results = await this.vectorService.searchCollection(userId, id, query, {
        limit: parseInt(limit)
      });
      
      res.json({
        results,
        query,
        total: results.length
      });
    } catch (error) {
      console.error('Search collection error:', error);
      res.status(500).json({ message: 'Failed to search collection' });
    }
  }

  async askQuestion(req, res) {
    try {
      const { id } = req.params;
      const { question, systemPrompt, maxResults = 5, maxQueries = 3 } = req.body;
      const userId = req.user.id;
      
      const response = await this.llmQaService.askQuestion(userId, id, question, {
        systemPrompt,
        maxResults: parseInt(maxResults),
        maxQueries: parseInt(maxQueries)
      });
      
      res.json(response);
    } catch (error) {
      console.error('Ask question error:', error);
      res.status(500).json({ message: 'Failed to process question' });
    }
  }

  async searchDocuments(req, res) {
    try {
      const { q: query, limit = 10 } = req.query;
      const userId = req.user?.id; // Optional auth
      
      const results = await this.vectorService.globalSearch(query, {
        userId,
        limit: parseInt(limit)
      });
      
      res.json({ results, query });
    } catch (error) {
      console.error('Search documents error:', error);
      res.status(500).json({ message: 'Failed to search documents' });
    }
  }

  async searchUserCollections(req, res) {
    try {
      const { q: query, limit = 10 } = req.query;
      const userId = req.user.id;
      
      const results = await this.vectorService.searchUserCollections(userId, query, {
        limit: parseInt(limit)
      });
      
      res.json({ results, query });
    } catch (error) {
      console.error('Search user collections error:', error);
      res.status(500).json({ message: 'Failed to search user collections' });
    }
  }

  async publicSearch(req, res) {
    try {
      const { q: query, limit = 10 } = req.query;
      
      const results = await this.vectorService.publicSearch(query, {
        limit: parseInt(limit)
      });
      
      res.json({ results, query });
    } catch (error) {
      console.error('Public search error:', error);
      res.status(500).json({ message: 'Failed to perform public search' });
    }
  }

  async getDocumentContent(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const document = await this.vectorService.getDocumentContent(userId, id);
      
      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }
      
      res.json(document);
    } catch (error) {
      console.error('Get document content error:', error);
      res.status(500).json({ message: 'Failed to get document content' });
    }
  }

  async getSimilarDocuments(req, res) {
    try {
      const { id } = req.params;
      
      const similar = await this.vectorService.getSimilarDocuments(id);
      
      res.json({ similar });
    } catch (error) {
      console.error('Get similar documents error:', error);
      res.status(500).json({ message: 'Failed to get similar documents' });
    }
  }
}

module.exports = SearchController;
