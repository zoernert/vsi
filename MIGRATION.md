# VSI Vector Store Monetization Implementation Plan - Developer Ready

## Overview
This plan adds monetization capabilities while maintaining backward compatibility and current functionality. All existing features remain accessible, with new usage tracking and tier management added incrementally.

## Database Architecture Changes

### 1. Add PostgreSQL to Docker Setup

#### Update `docker-compose.yml`
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: vsi-postgres
    environment:
      POSTGRES_DB: vsi_db
      POSTGRES_USER: vsi_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-vsi_password}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-READY", "pg_isready", "-U", "vsi_user", "-d", "vsi_db"]
      interval: 30s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - vsi-network

  redis:
    image: redis:7-alpine
    container_name: vsi-redis
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - vsi-network

  qdrant:
    # ... existing qdrant config ...
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  vsi-service:
    # ... existing vsi-service config ...
    environment:
      # ... existing env vars ...
      - DATABASE_URL=postgresql://vsi_user:${POSTGRES_PASSWORD:-vsi_password}@postgres:5432/vsi_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_healthy
```

#### Create `scripts/init-db.sql`
```sql
-- Initialize database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migrate existing users from JSON to database
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    tier VARCHAR(20) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    stripe_customer_id VARCHAR(255)
);

-- User subscriptions
CREATE TABLE user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'api_calls', 'storage_bytes', 'documents', 'collections'
    amount BIGINT NOT NULL DEFAULT 1,
    endpoint VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    date DATE DEFAULT CURRENT_DATE
);

-- Create indexes for performance
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, date);
CREATE INDEX idx_usage_tracking_user_resource ON usage_tracking(user_id, resource_type);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_users_username ON users(username);

-- Create view for current usage
CREATE VIEW current_month_usage AS
SELECT 
    user_id,
    resource_type,
    SUM(amount) as total_usage,
    DATE_TRUNC('month', CURRENT_DATE) as month
FROM usage_tracking 
WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY user_id, resource_type;
```

### 2. Database Migration Service

#### Create `src/services/migrationService.js`
```javascript
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

class MigrationService {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://vsi_user:vsi_password@localhost:5432/vsi_db'
        });
    }

    async migrateUsersFromJson() {
        const usersFilePath = path.join(__dirname, '..', '..', 'data', 'users.json');
        
        if (!fs.existsSync(usersFilePath)) {
            console.log('No users.json file found, skipping migration');
            return;
        }

        try {
            const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            
            for (const [username, userData] of Object.entries(usersData)) {
                await this.pool.query(`
                    INSERT INTO users (username, password, is_admin, created_at, created_by, tier)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (username) DO NOTHING
                `, [
                    username,
                    userData.password,
                    userData.isAdmin || false,
                    userData.createdAt || new Date().toISOString(),
                    userData.createdBy || 'migration',
                    'unlimited' // Existing users get unlimited access
                ]);
            }

            console.log('✅ User migration completed successfully');
            
            // Backup original file
            fs.renameSync(usersFilePath, `${usersFilePath}.backup`);
            
        } catch (error) {
            console.error('❌ User migration failed:', error);
            throw error;
        }
    }

    async ensureAdminUser() {
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        await this.pool.query(`
            INSERT INTO users (username, password, is_admin, created_by, tier)
            VALUES ($1, $2, true, 'system', 'unlimited')
            ON CONFLICT (username) DO UPDATE SET
                is_admin = true,
                tier = 'unlimited'
        `, [adminUsername, adminPassword]);

        console.log('✅ Admin user ensured');
    }
}

module.exports = { MigrationService };
```

## Implementation Phase 1: Foundation & Backward Compatibility

### 1. Database Service Layer

#### Create `src/services/databaseService.js`
```javascript
const { Pool } = require('pg');

class DatabaseService {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });
    }

    // User management (replaces JSON file operations)
    async getUser(username) {
        const result = await this.pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0];
    }

    async createUser(userData) {
        const { username, password, email, isAdmin = false, tier = 'free', createdBy = 'self-registration' } = userData;
        
        const result = await this.pool.query(`
            INSERT INTO users (username, password, email, is_admin, tier, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [username, password, email, isAdmin, tier, createdBy]);
        
        return result.rows[0];
    }

    async getAllUsers() {
        const result = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
        return result.rows;
    }

    async updateUser(username, updates) {
        const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 2}`).join(', ');
        const values = [username, ...Object.values(updates)];
        
        const result = await this.pool.query(`
            UPDATE users SET ${setClause}, updated_at = NOW()
            WHERE username = $1
            RETURNING *
        `, values);
        
        return result.rows[0];
    }

    async deleteUser(username) {
        await this.pool.query('DELETE FROM users WHERE username = $1', [username]);
    }

    // Usage tracking
    async trackUsage(userId, resourceType, amount = 1, endpoint = null) {
        await this.pool.query(`
            INSERT INTO usage_tracking (user_id, resource_type, amount, endpoint)
            VALUES ($1, $2, $3, $4)
        `, [userId, resourceType, amount, endpoint]);
    }

    async getCurrentUsage(userId, resourceType) {
        const result = await this.pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM usage_tracking 
            WHERE user_id = $1 
                AND resource_type = $2 
                AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        `, [userId, resourceType]);
        
        return parseInt(result.rows[0].total);
    }

    async getUserTier(userId) {
        const result = await this.pool.query(
            'SELECT tier FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0]?.tier || 'free';
    }
}

module.exports = { DatabaseService };
```

### 2. Backward Compatible User Service

#### Update `src/services/userService.js`
```javascript
const { DatabaseService } = require('./databaseService');

class UserService {
    constructor() {
        this.db = new DatabaseService();
    }

    // Maintain exact same interface as before for backward compatibility
    async loadUsers() {
        const users = await this.db.getAllUsers();
        // Convert to old format for compatibility
        const userMap = {};
        users.forEach(user => {
            userMap[user.username] = {
                password: user.password,
                id: user.id,
                isAdmin: user.is_admin,
                createdAt: user.created_at,
                createdBy: user.created_by,
                tier: user.tier // New field
            };
        });
        return userMap;
    }

    async getUser(username) {
        return await this.db.getUser(username);
    }

    async createUser(userData) {
        return await this.db.createUser(userData);
    }

    async updateUser(username, updates) {
        return await this.db.updateUser(username, updates);
    }

    async deleteUser(username) {
        return await this.db.deleteUser(username);
    }

    // New methods for tier management
    async getUserTier(userId) {
        return await this.db.getUserTier(userId);
    }

    async updateUserTier(userId, tier) {
        return await this.db.updateUser(userId, { tier });
    }
}

module.exports = { UserService };
```

### 3. Tier Configuration

#### Create `src/config/tiers.js`
```javascript
const TIER_LIMITS = {
    free: {
        documents: 100,
        storage_bytes: 500 * 1024 * 1024, // 500MB
        api_calls_monthly: 1000,
        collections: 3,
        max_file_size: 10 * 1024 * 1024, // 10MB
        features: ['basic_search', 'file_upload', 'simple_qa']
    },
    starter: {
        documents: 1000,
        storage_bytes: 5 * 1024 * 1024 * 1024, // 5GB
        api_calls_monthly: 10000,
        collections: 10,
        max_file_size: 50 * 1024 * 1024, // 50MB
        features: ['basic_search', 'file_upload', 'simple_qa', 'priority_processing']
    },
    professional: {
        documents: 10000,
        storage_bytes: 50 * 1024 * 1024 * 1024, // 50GB
        api_calls_monthly: 100000,
        collections: 50,
        max_file_size: 200 * 1024 * 1024, // 200MB
        features: ['basic_search', 'file_upload', 'advanced_qa', 'analytics', 'priority_support']
    },
    enterprise: {
        documents: 100000,
        storage_bytes: 500 * 1024 * 1024 * 1024, // 500GB
        api_calls_monthly: 1000000,
        collections: 1000,
        max_file_size: 1024 * 1024 * 1024, // 1GB
        features: ['all_features', 'white_label', 'dedicated_support']
    },
    unlimited: {
        documents: Infinity,
        storage_bytes: Infinity,
        api_calls_monthly: Infinity,
        collections: Infinity,
        max_file_size: Infinity,
        features: ['all_features']
    }
};

module.exports = { TIER_LIMITS };
```

### 4. Usage Tracking Middleware (Non-blocking)

#### Create `src/middleware/usageTracking.js`
```javascript
const { DatabaseService } = require('../services/databaseService');
const { TIER_LIMITS } = require('../config/tiers');

class UsageTracker {
    constructor() {
        this.db = new DatabaseService();
    }

    // Non-blocking usage tracking
    trackUsage(userId, resourceType, amount = 1, endpoint = null) {
        // Fire and forget - don't block requests
        setImmediate(async () => {
            try {
                await this.db.trackUsage(userId, resourceType, amount, endpoint);
            } catch (error) {
                console.error('Usage tracking error (non-blocking):', error);
            }
        });
    }

    async checkLimits(userId, resourceType, amount = 1) {
        try {
            const userTier = await this.db.getUserTier(userId);
            
            // Unlimited tier bypasses all checks
            if (userTier === 'unlimited') {
                return true;
            }

            const limits = TIER_LIMITS[userTier];
            if (!limits) {
                console.warn(`Unknown tier: ${userTier}, defaulting to free`);
                limits = TIER_LIMITS.free;
            }

            const currentUsage = await this.db.getCurrentUsage(userId, resourceType);
            const newUsage = currentUsage + amount;

            return newUsage <= limits[resourceType];
        } catch (error) {
            console.error('Limit check error (allowing request):', error);
            return true; // Fail open - don't block on errors
        }
    }
}

const usageTracker = new UsageTracker();

// Middleware factory
const createUsageMiddleware = (resourceType, amount = 1) => {
    return (req, res, next) => {
        // Always track usage (non-blocking)
        if (req.user && req.user.id) {
            usageTracker.trackUsage(req.user.id, resourceType, amount, req.route?.path);
        }
        next();
    };
};

// Middleware that checks limits before proceeding
const createLimitMiddleware = (resourceType, amount = 1) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.id) {
            return next();
        }

        try {
            const withinLimits = await usageTracker.checkLimits(req.user.id, resourceType, amount);
            
            if (!withinLimits) {
                return res.status(429).json({
                    error: 'Usage limit exceeded',
                    message: `You have exceeded your ${resourceType.replace('_', ' ')} limit for the current billing period`,
                    upgradeUrl: '/pricing',
                    currentTier: await usageTracker.db.getUserTier(req.user.id)
                });
            }
        } catch (error) {
            console.error('Limit check failed (allowing request):', error);
        }

        next();
    };
};

module.exports = {
    createUsageMiddleware,
    createLimitMiddleware,
    usageTracker
};
```

## Implementation Phase 2: Route Updates with Backward Compatibility

### 1. Update Authentication Routes

#### Modify `src/routes/authRoutes.js`
```javascript
// Add at the top
const { UserService } = require('../services/userService');
const { createUsageMiddleware } = require('../middleware/usageTracking');

const userService = new UserService();

// Replace file operations with database operations
router.post('/register', createUsageMiddleware('api_calls'), async (req, res) => {
    try {
        // Check if self-registration is allowed (existing logic)
        if (process.env.ALLOW_SELF_REGISTRATION !== 'true') {
            return res.status(403).json({ 
                error: 'Self-registration is disabled. Please contact an administrator.' 
            });
        }
        
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Check if user exists
        const existingUser = await userService.getUser(username);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create user with free tier
        await userService.createUser({
            username,
            password,
            email,
            tier: 'free'
        });
        
        console.log('User registered successfully:', username);
        res.json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', createUsageMiddleware('api_calls'), async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = await userService.getUser(username);
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { 
                id: user.id, 
                username,
                isAdmin: user.is_admin || false,
                tier: user.tier || 'free'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ 
            token, 
            username,
            isAdmin: user.is_admin || false,
            tier: user.tier || 'free'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new endpoint for current user info including usage
router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
    try {
        const user = await userService.getUser(req.user.username);
        const usage = {
            documents: await userService.db.getCurrentUsage(req.user.id, 'documents'),
            storage_bytes: await userService.db.getCurrentUsage(req.user.id, 'storage_bytes'),
            api_calls: await userService.db.getCurrentUsage(req.user.id, 'api_calls'),
            collections: await userService.db.getCurrentUsage(req.user.id, 'collections')
        };
        
        res.json({
            username: user.username,
            email: user.email,
            isAdmin: user.is_admin || false,
            tier: user.tier || 'free',
            usage,
            limits: TIER_LIMITS[user.tier || 'free']
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### 2. Update Upload Routes with Limits

#### Modify `src/routes/uploadRoutes.js`
```javascript
// Add imports
const { createUsageMiddleware, createLimitMiddleware } = require('../middleware/usageTracking');
const { TIER_LIMITS } = require('../config/tiers');

// File size check middleware
const checkFileSize = async (req, res, next) => {
    if (req.file && req.user) {
        const userTier = await new (require('../services/databaseService')).DatabaseService().getUserTier(req.user.id);
        const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
        
        if (req.file.size > limits.max_file_size) {
            return res.status(413).json({
                error: 'File too large',
                message: `File size exceeds limit for ${userTier} tier`,
                maxSize: limits.max_file_size,
                upgradeUrl: '/pricing'
            });
        }
    }
    next();
};

// Update upload endpoint
router.post('/collections/:collection/upload', 
    upload.single('file'),
    checkFileSize,
    createLimitMiddleware('documents'),
    createLimitMiddleware('storage_bytes', 0), // Will be calculated based on file size
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        try {
            // ... existing upload logic ...
            
            // Track usage after successful upload
            if (req.user && req.user.id) {
                const usageTracker = require('../middleware/usageTracking').usageTracker;
                usageTracker.trackUsage(req.user.id, 'documents', 1);
                usageTracker.trackUsage(req.user.id, 'storage_bytes', file.size);
            }
            
            // ... rest of existing logic ...
        } catch (error) {
            // ... existing error handling ...
        }
    }
);

// Update other endpoints similarly...
```

### 3. Update Collection Routes

#### Modify `src/routes/collections.js`
```javascript
// Add usage tracking to all collection operations
const { createUsageMiddleware, createLimitMiddleware } = require('../middleware/usageTracking');

// Update create collection endpoint
router.put('/:name', 
    createLimitMiddleware('collections'),
    createUsageMiddleware('api_calls'),
    async (req, res) => {
        try {
            // ... existing logic ...
            
            // Track collection creation
            if (req.user && req.user.id) {
                const usageTracker = require('../middleware/usageTracking').usageTracker;
                usageTracker.trackUsage(req.user.id, 'collections', 1);
            }
            
            // ... rest of existing logic ...
        } catch (error) {
            // ... existing error handling ...
        }
    }
);

// Add usage tracking to other endpoints
router.get('/', createUsageMiddleware('api_calls'), async (req, res) => {
    // ... existing logic unchanged ...
});

router.get('/:name', createUsageMiddleware('api_calls'), async (req, res) => {
    // ... existing logic unchanged ...
});

router.delete('/:name', createUsageMiddleware('api_calls'), async (req, res) => {
    try {
        // ... existing logic ...
        
        // Track collection deletion (negative count)
        if (req.user && req.user.id) {
            const usageTracker = require('../middleware/usageTracking').usageTracker;
            usageTracker.trackUsage(req.user.id, 'collections', -1);
        }
        
        // ... rest of existing logic ...
    } catch (error) {
        // ... existing error handling ...
    }
});
```

## Implementation Phase 3: Startup Migration

### 1. Update Main Application Startup

#### Modify `src/index.js`
```javascript
// Add at the top
const { MigrationService } = require('./services/migrationService');
const { DatabaseService } = require('./services/databaseService');

// Add before starting the server
async function initializeDatabase() {
    try {
        // Test database connection
        const db = new DatabaseService();
        await db.pool.query('SELECT 1');
        console.log('✅ Database connection successful');
        
        // Run migrations
        const migrationService = new MigrationService();
        await migrationService.migrateUsersFromJson();
        await migrationService.ensureAdminUser();
        
        console.log('✅ Database migrations completed');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        console.error('Please ensure PostgreSQL is running and accessible');
        process.exit(1);
    }
}

// Replace the server startup section
async function startServer() {
    try {
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`✅ VSI Vector Store ready with monetization features`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Call the async startup function
startServer();
```

### 2. Update Package Dependencies

#### Update `package.json`
```json
{
  "dependencies": {
    // ... existing dependencies ...
    "pg": "^8.11.3",
    "redis": "^4.6.7",
    "express-rate-limit": "^6.10.0",
    "rate-limit-redis": "^3.0.1"
  }
}
```

### 3. Environment Variables

#### Update `.env.example`
```bash
# ... existing variables ...

# Database Configuration
DATABASE_URL=postgresql://vsi_user:vsi_password@localhost:5432/vsi_db
POSTGRES_PASSWORD=vsi_password

# Redis Configuration  
REDIS_URL=redis://localhost:6379

# Monetization Features
ENABLE_USAGE_TRACKING=true
ENABLE_TIER_LIMITS=true

# Stripe Configuration (optional for now)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

## Testing & Validation Plan

### 1. Backward Compatibility Tests
- Verify all existing functionality works unchanged
- Test user login/registration flow
- Confirm file uploads work as before
- Validate collection operations
- Check MCP integration remains functional

### 2. New Feature Tests
- Verify usage tracking doesn't block requests
- Test tier limit enforcement
- Confirm database migration works correctly
- Validate unlimited tier bypasses all limits

### 3. Performance Tests
- Ensure usage tracking doesn't impact response times
- Test database query performance under load
- Verify Redis operations don't cause delays

## Deployment Instructions

### 1. Development Setup
```bash
# Add new environment variables
cp .env.example .env
# Edit .env with your database password

# Start services
docker-compose up -d

# The migration will run automatically on first startup
```

### 2. Production Deployment
```bash
# Set secure passwords
export POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Deploy with existing docker-compose process
docker-compose down
docker-compose pull
docker-compose up -d

# Monitor logs for successful migration
docker-compose logs -f vsi-service
```

## Key Principles Maintained

1. **Zero Breaking Changes**: All existing functionality remains identical
2. **Graceful Degradation**: Usage tracking failures don't block requests  
3. **Unlimited Access**: Existing users get unlimited tier automatically
4. **Backward Compatibility**: API responses include new fields but maintain existing structure
5. **Docker Integration**: Database and Redis added to existing container setup
6. **Environment Driven**: All new features can be disabled via environment variables

This implementation ensures you can continue using your service exactly as before while the new monetization infrastructure is built around it. 