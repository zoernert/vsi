const { createContextLogger } = require('../utils/logger');

class CacheService {
  constructor(config) {
    this.config = config;
    this.logger = createContextLogger('CacheService');
    this.cache = new Map(); // In-memory cache for development
    this.defaultTTL = config.cache?.ttl || 3600; // 1 hour default
  }
  
  async get(key) {
    try {
      const item = this.cache.get(key);
      
      if (!item) {
        this.logger.debug('Cache miss', { key });
        return null;
      }
      
      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        this.logger.debug('Cache expired', { key });
        return null;
      }
      
      this.logger.debug('Cache hit', { key });
      return item.value;
    } catch (error) {
      this.logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }
  
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const expiresAt = Date.now() + (ttl * 1000);
      this.cache.set(key, { value, expiresAt });
      
      this.logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      this.logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  }
  
  async delete(key) {
    try {
      const deleted = this.cache.delete(key);
      this.logger.debug('Cache delete', { key, deleted });
      return deleted;
    } catch (error) {
      this.logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }
  
  async clear() {
    try {
      this.cache.clear();
      this.logger.info('Cache cleared');
      return true;
    } catch (error) {
      this.logger.error('Cache clear error', { error: error.message });
      return false;
    }
  }
  
  // Cache with function execution
  async getOrSet(key, asyncFn, ttl = this.defaultTTL) {
    let value = await this.get(key);
    
    if (value === null) {
      value = await asyncFn();
      await this.set(key, value, ttl);
    }
    
    return value;
  }
  
  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info('Cache cleanup completed', { cleanedCount });
    }
  }
  
  // Get cache statistics
  getStats() {
    const size = this.cache.size;
    const memoryUsage = process.memoryUsage();
    
    return {
      size,
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
      }
    };
  }
}

module.exports = CacheService;
