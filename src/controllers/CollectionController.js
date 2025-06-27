const BaseController = require('./BaseController');

class CollectionController extends BaseController {
  constructor(collectionService) {
    super();
    this.collectionService = collectionService;
  }

  createCollection = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collection = await this.collectionService.createCollection(userId, req.body);
    this.sendSuccessResponse(res, collection, 'Collection created successfully', 201);
  });

  getUserCollections = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const pagination = this.extractPaginationParams(req);
    const sort = this.extractSortParams(req, 'created_at', ['id', 'name', 'created_at', 'updated_at']);
    
    const options = {
      limit: pagination.limit,
      offset: pagination.offset,
      orderBy: sort.sortBy,
      sortOrder: sort.sortOrder
    };

    const collections = await this.collectionService.getUserCollections(userId, options);
    
    // For paginated response, we need total count
    const totalCollections = await this.collectionService.collectionRepository.countByUserId(userId);
    this.sendPaginatedResponse(res, collections, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCollections
    }, 'Collections retrieved successfully');
  });

  getCollection = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collectionId = parseInt(req.params.id);
    // Always use collectionId (UUID)
    const collection = await this.collectionService.getCollectionById(collectionId, userId);
    this.sendSuccessResponse(res, collection, 'Collection retrieved successfully');
  });

  updateCollection = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collectionId = parseInt(req.params.id);
    
    const updatedCollection = await this.collectionService.updateCollection(collectionId, userId, req.body);
    this.sendSuccessResponse(res, updatedCollection, 'Collection updated successfully');
  });

  deleteCollection = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collectionId = parseInt(req.params.id);
    
    const result = await this.collectionService.deleteCollection(collectionId, userId);
    this.sendSuccessResponse(res, result, 'Collection deleted successfully');
  });

  getCollectionDocuments = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collectionId = parseInt(req.params.id);
    const pagination = this.extractPaginationParams(req);
    const sort = this.extractSortParams(req, 'created_at', ['id', 'filename', 'created_at', 'updated_at']);
    
    const options = {
      limit: pagination.limit,
      offset: pagination.offset,
      orderBy: sort.sortBy,
      sortOrder: sort.sortOrder
    };

    const result = await this.collectionService.getCollectionDocuments(collectionId, userId, options);
    
    this.sendPaginatedResponse(res, result.documents, {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total
    }, 'Collection documents retrieved successfully');
  });

  getCollectionStats = this.asyncHandler(async (req, res) => {
    const userId = req.user.id; // Use 'id' instead of 'userId'
    const collectionId = parseInt(req.params.id);
    
    const stats = await this.collectionService.getCollectionStats(collectionId, userId);
    this.sendSuccessResponse(res, stats, 'Collection statistics retrieved successfully');
  });
}

module.exports = CollectionController;
