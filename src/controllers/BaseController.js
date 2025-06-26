const { asyncHandler } = require('../utils/errorHandler');

class BaseController {
  constructor() {
    this.asyncHandler = asyncHandler;
  }

  sendSuccessResponse(res, data, message = 'Success', statusCode = 200) {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  sendErrorResponse(res, message, statusCode = 500, details = null) {
    const response = {
      success: false,
      message,
      statusCode,
      timestamp: new Date().toISOString()
    };

    if (details) {
      response.details = details;
    }

    res.status(statusCode).json(response);
  }

  sendPaginatedResponse(res, data, pagination, message = 'Success') {
    res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    });
  }

  extractPaginationParams(req) {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 items per page
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  extractSortParams(req, defaultSort = 'id', allowedFields = ['id', 'created_at', 'updated_at']) {
    const sortBy = allowedFields.includes(req.query.sortBy) ? req.query.sortBy : defaultSort;
    const sortOrder = ['ASC', 'DESC'].includes(req.query.sortOrder?.toUpperCase()) 
      ? req.query.sortOrder.toUpperCase() 
      : 'ASC';

    return { sortBy, sortOrder };
  }
}

module.exports = BaseController;
