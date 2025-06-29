const { DatabaseService } = require('./databaseService');
const { v4: uuidv4 } = require('uuid');

class AgentMemoryService {
    constructor() {
        this.db = new DatabaseService();
        this.cache = new Map(); // In-memory cache for frequently accessed data
        this.cacheTimeout = 300000; // 5 minutes cache timeout
    }

    // Session-based memory (specific to a research session)
    async storeSessionMemory(sessionId, agentId, key, value, metadata = {}) {
        try {
            const memoryId = uuidv4();
            const memoryData = {
                id: memoryId,
                session_id: sessionId,
                agent_id: agentId,
                memory_key: key,
                memory_value: JSON.stringify(value),
                metadata: JSON.stringify({
                    ...metadata,
                    scope: 'session',
                    created_at: new Date()
                }),
                created_at: new Date(),
                updated_at: new Date()
            };

            const query = `
                INSERT INTO agent_memory (id, session_id, agent_id, memory_key, memory_value, metadata, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (agent_id, memory_key) 
                DO UPDATE SET 
                    memory_value = EXCLUDED.memory_value,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
            `;

            const result = await this.db.query(query, [
                memoryData.id,
                memoryData.session_id,
                memoryData.agent_id,
                memoryData.memory_key,
                memoryData.memory_value,
                memoryData.metadata,
                memoryData.created_at,
                memoryData.updated_at
            ]);

            // Update cache
            const cacheKey = `session_${sessionId}_${agentId}_${key}`;
            this.cache.set(cacheKey, {
                data: value,
                metadata,
                timestamp: Date.now()
            });

            console.log(`💾 Stored session memory: ${key} for agent ${agentId} in session ${sessionId}`);
            return { success: true, id: result.rows[0].id };
        } catch (error) {
            console.error(`❌ Error storing session memory:`, error);
            throw error;
        }
    }

    async getSessionMemory(sessionId, agentId, key) {
        try {
            // Check cache first
            const cacheKey = `session_${sessionId}_${agentId}_${key}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return { success: true, data: cached.data, metadata: cached.metadata };
            }

            // Query database
            const query = `
                SELECT * FROM agent_memory 
                WHERE session_id = $1 AND agent_id = $2 AND memory_key = $3
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [sessionId, agentId, key]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'Memory not found' };
            }

            const memory = result.rows[0];
            const data = JSON.parse(memory.memory_value);
            const metadata = JSON.parse(memory.metadata || '{}');

            // Update cache
            this.cache.set(cacheKey, {
                data,
                metadata,
                timestamp: Date.now()
            });

            return { success: true, data, metadata };
        } catch (error) {
            console.error(`❌ Error getting session memory:`, error);
            throw error;
        }
    }

    async searchSessionMemory(sessionId, query, agentId = null) {
        try {
            let sqlQuery = `
                SELECT * FROM agent_memory 
                WHERE session_id = $1 
                AND (memory_key ILIKE $2 OR memory_value::text ILIKE $2)
            `;
            let params = [sessionId, `%${query}%`];

            if (agentId) {
                sqlQuery += ` AND agent_id = $3`;
                params.push(agentId);
            }

            sqlQuery += ` ORDER BY updated_at DESC`;

            const result = await this.db.query(sqlQuery, params);
            
            const memories = result.rows.map(row => ({
                id: row.id,
                agentId: row.agent_id,
                key: row.memory_key,
                value: JSON.parse(row.memory_value),
                metadata: JSON.parse(row.metadata || '{}'),
                updatedAt: row.updated_at
            }));

            return { success: true, data: memories };
        } catch (error) {
            console.error(`❌ Error searching session memory:`, error);
            throw error;
        }
    }

    // Cross-session knowledge (persists across research sessions for a user)
    async storeKnowledge(userId, key, value, metadata = {}) {
        try {
            const knowledgeId = uuidv4();
            const knowledgeData = {
                id: knowledgeId,
                user_id: userId,
                knowledge_key: key,
                knowledge_value: JSON.stringify(value),
                metadata: JSON.stringify({
                    ...metadata,
                    scope: 'knowledge',
                    created_at: new Date()
                }),
                created_at: new Date(),
                updated_at: new Date()
            };

            // Create knowledge table if it doesn't exist
            await this.ensureKnowledgeTable();

            const query = `
                INSERT INTO agent_knowledge (id, user_id, knowledge_key, knowledge_value, metadata, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (user_id, knowledge_key) 
                DO UPDATE SET 
                    knowledge_value = EXCLUDED.knowledge_value,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
            `;

            const result = await this.db.query(query, [
                knowledgeData.id,
                knowledgeData.user_id,
                knowledgeData.knowledge_key,
                knowledgeData.knowledge_value,
                knowledgeData.metadata,
                knowledgeData.created_at,
                knowledgeData.updated_at
            ]);

            // Update cache
            const cacheKey = `knowledge_${userId}_${key}`;
            this.cache.set(cacheKey, {
                data: value,
                metadata,
                timestamp: Date.now()
            });

            console.log(`🧠 Stored knowledge: ${key} for user ${userId}`);
            return { success: true, id: result.rows[0].id };
        } catch (error) {
            console.error(`❌ Error storing knowledge:`, error);
            throw error;
        }
    }

    async getKnowledge(userId, key) {
        try {
            // Check cache first
            const cacheKey = `knowledge_${userId}_${key}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return { success: true, data: cached.data, metadata: cached.metadata };
            }

            const query = `
                SELECT * FROM agent_knowledge 
                WHERE user_id = $1 AND knowledge_key = $2
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [userId, key]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'Knowledge not found' };
            }

            const knowledge = result.rows[0];
            const data = JSON.parse(knowledge.knowledge_value);
            const metadata = JSON.parse(knowledge.metadata || '{}');

            // Update cache
            this.cache.set(cacheKey, {
                data,
                metadata,
                timestamp: Date.now()
            });

            return { success: true, data, metadata };
        } catch (error) {
            console.error(`❌ Error getting knowledge:`, error);
            throw error;
        }
    }

    async searchKnowledge(userId, query) {
        try {
            const sqlQuery = `
                SELECT * FROM agent_knowledge 
                WHERE user_id = $1 
                AND (knowledge_key ILIKE $2 OR knowledge_value::text ILIKE $2)
                ORDER BY updated_at DESC
            `;

            const result = await this.db.query(sqlQuery, [userId, `%${query}%`]);
            
            const knowledge = result.rows.map(row => ({
                id: row.id,
                key: row.knowledge_key,
                value: JSON.parse(row.knowledge_value),
                metadata: JSON.parse(row.metadata || '{}'),
                updatedAt: row.updated_at
            }));

            return { success: true, data: knowledge };
        } catch (error) {
            console.error(`❌ Error searching knowledge:`, error);
            throw error;
        }
    }

    // Agent working memory (temporary memory with TTL)
    async storeWorkingMemory(agentId, key, value, ttl = 3600) {
        try {
            const expiresAt = new Date(Date.now() + (ttl * 1000));
            const memoryId = uuidv4();
            
            const memoryData = {
                id: memoryId,
                agent_id: agentId,
                memory_key: key,
                memory_value: JSON.stringify(value),
                metadata: JSON.stringify({
                    scope: 'working',
                    ttl: ttl,
                    created_at: new Date()
                }),
                expires_at: expiresAt,
                created_at: new Date(),
                updated_at: new Date()
            };

            const query = `
                INSERT INTO agent_memory (id, agent_id, memory_key, memory_value, metadata, expires_at, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (agent_id, memory_key) 
                DO UPDATE SET 
                    memory_value = EXCLUDED.memory_value,
                    metadata = EXCLUDED.metadata,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
            `;

            const result = await this.db.query(query, [
                memoryData.id,
                memoryData.agent_id,
                memoryData.memory_key,
                memoryData.memory_value,
                memoryData.metadata,
                memoryData.expires_at,
                memoryData.created_at,
                memoryData.updated_at
            ]);

            // Update cache with TTL
            const cacheKey = `working_${agentId}_${key}`;
            this.cache.set(cacheKey, {
                data: value,
                timestamp: Date.now(),
                expiresAt: expiresAt.getTime()
            });

            console.log(`⚡ Stored working memory: ${key} for agent ${agentId} (TTL: ${ttl}s)`);
            return { success: true, id: result.rows[0].id };
        } catch (error) {
            console.error(`❌ Error storing working memory:`, error);
            throw error;
        }
    }

    async getWorkingMemory(agentId, key) {
        try {
            // Check cache first
            const cacheKey = `working_${agentId}_${key}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached) {
                if (cached.expiresAt && Date.now() > cached.expiresAt) {
                    this.cache.delete(cacheKey);
                } else {
                    return { success: true, data: cached.data };
                }
            }

            // Query database
            const query = `
                SELECT * FROM agent_memory 
                WHERE agent_id = $1 AND memory_key = $2
                AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [agentId, key]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'Working memory not found or expired' };
            }

            const memory = result.rows[0];
            const data = JSON.parse(memory.memory_value);

            // Update cache
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now(),
                expiresAt: memory.expires_at ? new Date(memory.expires_at).getTime() : null
            });

            return { success: true, data };
        } catch (error) {
            console.error(`❌ Error getting working memory:`, error);
            throw error;
        }
    }

    async clearWorkingMemory(agentId) {
        try {
            const query = `
                DELETE FROM agent_memory 
                WHERE agent_id = $1 
                AND metadata->>'scope' = 'working'
            `;

            await this.db.query(query, [agentId]);

            // Clear from cache
            for (const [key, value] of this.cache.entries()) {
                if (key.startsWith(`working_${agentId}_`)) {
                    this.cache.delete(key);
                }
            }

            console.log(`🧹 Cleared working memory for agent ${agentId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error clearing working memory:`, error);
            throw error;
        }
    }

    // Shared session memory (accessible by all agents in a session)
    async storeSharedMemory(sessionId, key, value, metadata = {}) {
        try {
            const memoryId = uuidv4();
            const memoryData = {
                id: memoryId,
                session_id: sessionId,
                agent_id: `shared_${sessionId}`, // Special agent ID for shared memory
                memory_key: key,
                memory_value: JSON.stringify(value),
                metadata: JSON.stringify({
                    ...metadata,
                    scope: 'shared',
                    created_at: new Date()
                }),
                created_at: new Date(),
                updated_at: new Date()
            };

            const query = `
                INSERT INTO agent_memory (id, session_id, agent_id, memory_key, memory_value, metadata, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (agent_id, memory_key) 
                DO UPDATE SET 
                    memory_value = EXCLUDED.memory_value,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
            `;

            const result = await this.db.query(query, [
                memoryData.id,
                memoryData.session_id,
                memoryData.agent_id,
                memoryData.memory_key,
                memoryData.memory_value,
                memoryData.metadata,
                memoryData.created_at,
                memoryData.updated_at
            ]);

            // Update cache
            const cacheKey = `shared_${sessionId}_${key}`;
            this.cache.set(cacheKey, {
                data: value,
                metadata,
                timestamp: Date.now()
            });

            console.log(`🤝 Stored shared memory: ${key} for session ${sessionId}`);
            return { success: true, id: result.rows[0].id };
        } catch (error) {
            console.error(`❌ Error storing shared memory:`, error);
            throw error;
        }
    }

    async getSharedMemory(sessionId, key) {
        try {
            // Check cache first
            const cacheKey = `shared_${sessionId}_${key}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return { success: true, data: cached.data, metadata: cached.metadata };
            }

            const query = `
                SELECT * FROM agent_memory 
                WHERE session_id = $1 AND memory_key = $2
                AND agent_id = $3
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [sessionId, key, `shared_${sessionId}`]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'Shared memory not found' };
            }

            const memory = result.rows[0];
            const data = JSON.parse(memory.memory_value);
            const metadata = JSON.parse(memory.metadata || '{}');

            // Update cache
            this.cache.set(cacheKey, {
                data,
                metadata,
                timestamp: Date.now()
            });

            return { success: true, data, metadata };
        } catch (error) {
            console.error(`❌ Error getting shared memory:`, error);
            throw error;
        }
    }

    // Memory cleanup and maintenance
    async cleanupExpiredMemory() {
        try {
            const query = `
                DELETE FROM agent_memory 
                WHERE expires_at IS NOT NULL AND expires_at < NOW()
            `;

            const result = await this.db.query(query);
            console.log(`🧹 Cleaned up ${result.rowCount} expired memory entries`);

            // Clear expired cache entries
            for (const [key, value] of this.cache.entries()) {
                if (value.expiresAt && Date.now() > value.expiresAt) {
                    this.cache.delete(key);
                }
            }

            return { success: true, cleaned: result.rowCount };
        } catch (error) {
            console.error(`❌ Error cleaning up expired memory:`, error);
            throw error;
        }
    }

    async getMemoryStats(sessionId = null, agentId = null) {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_entries,
                    COUNT(DISTINCT agent_id) as unique_agents,
                    SUM(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 ELSE 0 END) as active_entries,
                    SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END) as expired_entries,
                    AVG(LENGTH(memory_value::text)) as avg_value_size
                FROM agent_memory
                WHERE 1=1
            `;
            let params = [];
            let paramIndex = 1;

            if (sessionId) {
                query += ` AND session_id = $${paramIndex}`;
                params.push(sessionId);
                paramIndex++;
            }

            if (agentId) {
                query += ` AND agent_id = $${paramIndex}`;
                params.push(agentId);
                paramIndex++;
            }

            const result = await this.db.query(query, params);
            const stats = result.rows[0];

            return {
                success: true,
                stats: {
                    totalEntries: parseInt(stats.total_entries),
                    uniqueAgents: parseInt(stats.unique_agents),
                    activeEntries: parseInt(stats.active_entries),
                    expiredEntries: parseInt(stats.expired_entries),
                    avgValueSize: Math.round(parseFloat(stats.avg_value_size) || 0),
                    cacheSize: this.cache.size
                }
            };
        } catch (error) {
            console.error(`❌ Error getting memory stats:`, error);
            throw error;
        }
    }

    // Helper methods
    async ensureKnowledgeTable() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS agent_knowledge (
                    id UUID PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    knowledge_key VARCHAR(255) NOT NULL,
                    knowledge_value JSONB NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, knowledge_key)
                );
                
                CREATE INDEX IF NOT EXISTS idx_agent_knowledge_user_id ON agent_knowledge(user_id);
                CREATE INDEX IF NOT EXISTS idx_agent_knowledge_key ON agent_knowledge(knowledge_key);
            `;
            
            await this.db.query(query);
        } catch (error) {
            // Table might already exist, which is fine
            console.log('Knowledge table creation skipped (likely already exists)');
        }
    }

    // Cache management
    clearCache() {
        this.cache.clear();
        console.log('🧹 Memory cache cleared');
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    // Start automatic cleanup task
    startCleanupTask(intervalMs = 300000) { // Default: 5 minutes
        setInterval(() => {
            this.cleanupExpiredMemory().catch(error => {
                console.error('Error in automatic memory cleanup:', error);
            });
        }, intervalMs);
        
        console.log(`🕐 Started automatic memory cleanup (interval: ${intervalMs}ms)`);
    }
}

module.exports = { AgentMemoryService };
