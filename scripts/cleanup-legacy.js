const fs = require('fs');
const path = require('path');
const { logger } = require('../src/utils/logger');

class LegacyCleanup {
  constructor() {
    this.basePath = path.join(__dirname, '..');
    this.legacyFiles = [
      'src/routes/authRoutes.js',
      'src/routes/userRoutes.js', 
      'src/routes/collectionRoutes.js',
      'src/routes/documentRoutes.js',
      'src/routes/searchRoutes.js',
      'src/routes/uploadRoutes.js',
      'src/routes/index.js', // Only if it imports legacy routes
      'src/controllers/authController.js',
      'src/middleware/authMiddleware.js' // Only if different from auth.js
    ];
    
    this.backupDir = path.join(this.basePath, 'legacy-backup');
    this.removed = [];
    this.backed = [];
    this.errors = [];
  }

  async cleanup() {
    try {
      logger.info('Starting legacy code cleanup...');
      
      // Create backup directory
      await this.createBackupDir();
      
      // Remove legacy files
      await this.removeLegacyFiles();
      
      // Verify new architecture files exist
      await this.verifyNewArchitecture();
      
      // Report results
      this.reportResults();
      
      logger.info('✅ Legacy cleanup completed successfully');
      return true;
      
    } catch (error) {
      logger.error('❌ Legacy cleanup failed', { error: error.message });
      return false;
    }
  }

  async createBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info('Created backup directory', { path: this.backupDir });
    }
  }

  async removeLegacyFiles() {
    for (const relativePath of this.legacyFiles) {
      const fullPath = path.join(this.basePath, relativePath);
      
      try {
        if (fs.existsSync(fullPath)) {
          // Check if it's actually a legacy file by examining content
          const isLegacy = await this.isLegacyFile(fullPath, relativePath);
          
          if (isLegacy) {
            // Backup before removing
            await this.backupFile(fullPath, relativePath);
            
            // Remove the file
            fs.unlinkSync(fullPath);
            this.removed.push(relativePath);
            logger.info('Removed legacy file', { file: relativePath });
          } else {
            logger.info('Keeping file (not legacy)', { file: relativePath });
          }
        } else {
          logger.debug('File does not exist (already cleaned)', { file: relativePath });
        }
      } catch (error) {
        this.errors.push({ file: relativePath, error: error.message });
        logger.warn('Failed to process file', { file: relativePath, error: error.message });
      }
    }
  }

  async isLegacyFile(filePath, relativePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Heuristics to determine if file is legacy
      const legacyIndicators = [
        /require\(['"]express['"]\).*Router/, // Old route pattern
        /module\.exports\s*=\s*router/, // Old export pattern
        /router\.(get|post|put|delete)\s*\(/, // Old route definitions
        /authController/, // References to old controllers
        /userController\s*=\s*require/ // Old controller imports
      ];
      
      // If it's a route file, check for new architecture patterns
      if (relativePath.includes('routes/')) {
        const hasNewPattern = /setupApiRoutes.*container/.test(content);
        if (hasNewPattern) {
          return false; // This is new architecture
        }
      }
      
      // Check for legacy patterns
      return legacyIndicators.some(pattern => pattern.test(content));
      
    } catch (error) {
      logger.warn('Could not read file for legacy check', { file: filePath });
      return false; // If we can't read it, don't remove it
    }
  }

  async backupFile(filePath, relativePath) {
    try {
      const backupPath = path.join(this.backupDir, relativePath);
      const backupDir = path.dirname(backupPath);
      
      // Create backup directory structure
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Copy file to backup
      fs.copyFileSync(filePath, backupPath);
      this.backed.push(relativePath);
      
    } catch (error) {
      logger.warn('Failed to backup file', { file: relativePath, error: error.message });
    }
  }

  async verifyNewArchitecture() {
    const requiredFiles = [
      'src/routes/api.js',
      'src/controllers/BaseController.js',
      'src/controllers/UserController.js',
      'src/controllers/CollectionController.js', 
      'src/controllers/SearchController.js',
      'src/middleware/auth.js',
      'src/container/setup.js'
    ];

    const missing = [];
    
    for (const file of requiredFiles) {
      const fullPath = path.join(this.basePath, file);
      if (!fs.existsSync(fullPath)) {
        missing.push(file);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required new architecture files: ${missing.join(', ')}`);
    }
    
    logger.info('✅ All required new architecture files present');
  }

  reportResults() {
    logger.info('Legacy cleanup summary', {
      removedFiles: this.removed.length,
      backedUpFiles: this.backed.length,
      errors: this.errors.length
    });

    if (this.removed.length > 0) {
      logger.info('Removed legacy files:', { files: this.removed });
    }

    if (this.backed.length > 0) {
      logger.info('Backed up files to:', { 
        backupDir: this.backupDir,
        files: this.backed 
      });
    }

    if (this.errors.length > 0) {
      logger.warn('Cleanup errors:', { errors: this.errors });
    }

    // Instructions for next steps
    logger.info('Next steps:');
    logger.info('1. Run: npm run validate-config');
    logger.info('2. Run: npm test');
    logger.info('3. Run: npm run dev');
    logger.info('4. Test API endpoints');
  }
}

// Main execution
async function main() {
  const cleanup = new LegacyCleanup();
  const success = await cleanup.cleanup();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    logger.error('Cleanup script failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = LegacyCleanup;
