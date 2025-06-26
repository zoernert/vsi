const path = require('path');

module.exports = {
  uploads: {
    directory: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown'
    ],
    allowedExtensions: process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'txt', 'docx', 'doc', 'md']
  },
  
  processing: {
    chunkSize: 1000, // Characters per chunk for large documents
    overlapSize: 200, // Overlap between chunks
    maxChunksPerDocument: 100
  },
  
  cleanup: {
    retentionDays: parseInt(process.env.FILE_RETENTION_DAYS) || 365,
    orphanedFilesCleanupHours: 24
  }
};
