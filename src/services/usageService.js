class UsageService {
  constructor(databaseService) {
    this.db = databaseService;
    this.TIER_LIMITS = {
      free: {
        collections: 5,
        documents: 100,
        searches: 500,
        uploads: 50
      },
      pro: {
        collections: 50,
        documents: 10000,
        searches: 10000,
        uploads: 1000
      },
      unlimited: {
        collections: -1,
        documents: -1,
        searches: -1,
        uploads: -1
      }
    };
  }

  async getUserUsage(userId) {
    try {
      await this.ensureUsageTrackingTable();
      
      // Get user tier
      const userTier = await this.db.getUserTier(userId);
      const limits = this.TIER_LIMITS[userTier] || this.TIER_LIMITS.free;
      
      // Get current usage counts
      const currentUsage = await this.getCurrentUsageCounts(userId);
      
      // Calculate billing period (monthly)
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      return {
        collections: {
          current: currentUsage.collections,
          limit: limits.collections,
          percentage: limits.collections === -1 ? 0 : Math.round((currentUsage.collections / limits.collections) * 100)
        },
        documents: {
          current: currentUsage.documents,
          limit: limits.documents,
          percentage: limits.documents === -1 ? 0 : Math.round((currentUsage.documents / limits.documents) * 100)
        },
        searches: {
          current: currentUsage.searches,
          limit: limits.searches,
          percentage: limits.searches === -1 ? 0 : Math.round((currentUsage.searches / limits.searches) * 100)
        },
        uploads: {
          current: currentUsage.uploads,
          limit: limits.uploads,
          percentage: limits.uploads === -1 ? 0 : Math.round((currentUsage.uploads / limits.uploads) * 100)
        },
        tier: userTier,
        billingPeriod: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        }
      };
    } catch (error) {
      console.error('Failed to get user usage:', error);
      throw error;
    }
  }

  async getCurrentUsageCounts(userId) {
    // Get actual counts from database
    const collectionsResult = await this.db.pool.query(
      'SELECT COUNT(*) as count FROM collections WHERE user_id = $1',
      [userId]
    );
    
    const documentsResult = await this.db.pool.query(
      'SELECT COUNT(*) as count FROM documents d JOIN collections c ON d.collection_id = c.id WHERE c.user_id = $1',
      [userId]
    );
    
    // Get monthly usage counts
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const searchesResult = await this.db.pool.query(
      'SELECT COUNT(*) as count FROM usage_tracking WHERE user_id = $1 AND resource_type = $2 AND created_at >= $3',
      [userId, 'searches', monthStart]
    );
    
    const uploadsResult = await this.db.pool.query(
      'SELECT COUNT(*) as count FROM usage_tracking WHERE user_id = $1 AND resource_type = $2 AND created_at >= $3',
      [userId, 'uploads', monthStart]
    );
    
    return {
      collections: parseInt(collectionsResult.rows[0].count) || 0,
      documents: parseInt(documentsResult.rows[0].count) || 0,
      searches: parseInt(searchesResult.rows[0].count) || 0,
      uploads: parseInt(uploadsResult.rows[0].count) || 0
    };
  }

  async incrementUsage(userId, type, amount = 1) {
    try {
      await this.ensureUsageTrackingTable();
      
      await this.db.pool.query(
        'INSERT INTO usage_tracking (user_id, resource_type, amount, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
        [userId, type, amount]
      );
    } catch (error) {
      console.error('Failed to increment usage:', error);
    }
  }

  async ensureUsageTrackingTable() {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS usage_tracking (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          resource_type VARCHAR(50) NOT NULL,
          amount INTEGER DEFAULT 1,
          endpoint VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create index for performance
      await this.db.pool.query(`
        CREATE INDEX IF NOT EXISTS usage_tracking_user_resource_date_idx 
        ON usage_tracking (user_id, resource_type, created_at)
      `);
    } catch (error) {
      console.error('Failed to ensure usage tracking table:', error);
    }
  }
}

module.exports = { UsageService };
