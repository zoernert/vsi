const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errorHandler');
const { createContextLogger } = require('../../utils/logger');

class CollectionApplicationService {
  constructor(collectionRepository, documentRepository, userRepository, vectorService) {
    this.collectionRepository = collectionRepository;
    this.documentRepository = documentRepository;
    this.userRepository = userRepository;
    this.vectorService = vectorService; // Add VectorService integration
    this.logger = createContextLogger('CollectionApplicationService');
  }

  async createCollection(userId, collectionData) {
    const { name, description } = collectionData;

    // Use VectorService which handles both database and Qdrant
    const collection = await this.vectorService.createCollection(userId, name, description);

    this.logger.info('Collection created', { 
      collectionId: collection.id, 
      userId, 
      name 
    });

    return collection;
  }

  async getUserCollections(userId, options = {}) {
    // Use VectorService for integrated database + Qdrant approach
    const collections = await this.vectorService.getUserCollections(userId, true);
    
    return collections;
  }

  async getCollectionById(collectionId, userId) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    const stats = await this.collectionRepository.getCollectionStats(collectionId);
    
    return {
      ...collection,
      stats
    };
  }

  async updateCollection(collectionId, userId, updateData) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    // Check if new name conflicts with existing collections
    if (updateData.name && updateData.name !== collection.name) {
      const existingCollection = await this.collectionRepository.findByNameAndUser(updateData.name, userId);
      if (existingCollection) {
        throw new ValidationError('Collection name already exists for this user');
      }
    }

    const updatedCollection = await this.collectionRepository.update(collectionId, updateData);
    
    this.logger.info('Collection updated', { 
      collectionId, 
      userId, 
      updatedFields: Object.keys(updateData) 
    });

    return updatedCollection;
  }

  async deleteCollection(collectionId, userId) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    // Delete collection and all its documents
    const deletedCollection = await this.collectionRepository.deleteWithDocuments(collectionId);
    
    this.logger.info('Collection deleted', { 
      collectionId, 
      userId, 
      collectionName: collection.name 
    });

    return { message: 'Collection and all associated documents deleted successfully' };
  }

  async getCollectionDocuments(collectionId, userId, options = {}) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    const documents = await this.documentRepository.findByCollectionId(collectionId, options);
    const totalCount = await this.documentRepository.countByCollectionId(collectionId);
    
    return {
      documents,
      total: totalCount,
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description
      }
    };
  }

  async getCollectionStats(collectionId, userId) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    return await this.collectionRepository.getCollectionStats(collectionId);
  }

  async searchInCollection(collectionId, userId, searchOptions) {
    const collection = await this.collectionRepository.findById(collectionId);
    
    if (!collection) {
      throw new NotFoundError('Collection');
    }

    // Check ownership
    if (collection.user_id !== userId) {
      throw new ForbiddenError('Access denied to this collection');
    }

    // This would integrate with the SearchApplicationService
    // For now, return a placeholder
    return {
      query: searchOptions.query,
      collectionId,
      results: []
    };
  }
}

module.exports = CollectionApplicationService;
