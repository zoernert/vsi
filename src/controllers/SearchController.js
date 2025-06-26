const BaseController = require('./BaseController');

class SearchController extends BaseController {
  constructor(searchService) {
    super();
    this.searchService = searchService;
  }

  searchDocuments = this.asyncHandler(async (req, res) => {
    const { q: query, collectionId, limit = 10, threshold = 0.5 } = req.query;
    const userId = req.user?.userId;

    const options = {
      collectionId: collectionId ? parseInt(collectionId) : null,
      limit: Math.min(parseInt(limit), 50), // Max 50 results
      threshold: parseFloat(threshold),
      userId
    };

    const results = await this.searchService.searchDocuments(query, options);
    this.sendSuccessResponse(res, results, 'Search completed successfully');
  });

  searchUserCollections = this.asyncHandler(async (req, res) => {
    const { q: query, limit = 10, threshold = 0.5 } = req.query;
    const userId = req.user.userId;

    const options = {
      limit: Math.min(parseInt(limit), 50),
      threshold: parseFloat(threshold)
    };

    const results = await this.searchService.searchInUserCollections(userId, query, options);
    this.sendSuccessResponse(res, results, 'User collection search completed successfully');
  });

  getDocumentContent = this.asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.userId;

    const document = await this.searchService.getDocumentContent(documentId, userId);
    this.sendSuccessResponse(res, document, 'Document content retrieved successfully');
  });

  getSimilarDocuments = this.asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { limit = 5, threshold = 0.7 } = req.query;

    const options = {
      limit: Math.min(parseInt(limit), 20),
      threshold: parseFloat(threshold)
    };

    const results = await this.searchService.getSimilarDocuments(documentId, options);
    this.sendSuccessResponse(res, results, 'Similar documents retrieved successfully');
  });

  // Public search endpoint (no authentication required)
  publicSearch = this.asyncHandler(async (req, res) => {
    const { q: query, limit = 10, threshold = 0.6 } = req.query;

    // Higher threshold for public search for better quality results
    const options = {
      collectionId: null,
      limit: Math.min(parseInt(limit), 20), // Lower limit for public search
      threshold: parseFloat(threshold),
      userId: null
    };

    const results = await this.searchService.searchDocuments(query, options);
    
    // Remove sensitive information for public search
    const publicResults = {
      ...results,
      results: results.results.map(result => ({
        id: result.id,
        filename: result.filename,
        contentPreview: result.contentPreview,
        fileType: result.fileType,
        similarity: result.similarity
        // Remove collectionId and collectionName for privacy
      }))
    };

    this.sendSuccessResponse(res, publicResults, 'Public search completed successfully');
  });
}

module.exports = SearchController;
