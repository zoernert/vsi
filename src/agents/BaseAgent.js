const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class BaseAgent {
    constructor(agentId, sessionId, config, apiClient, databaseService = null) {
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.config = config;
        this.api = apiClient;
        this.db = databaseService;
        this.status = 'initialized';
        this.memory = new Map();
        this.tasks = [];
        this.artifacts = [];
        this.progress = 0;
        this.currentTask = null;
        this.startTime = null;
        this.dependencies = [];
        this.dependencyResults = new Map();
        
        // Store reference to AgentService for event emission
        this.agentService = null;
        
        // Use the API client's configured axios instance (includes authentication)
        this.httpClient = this.api.axios;
    }
    
    // Method to set reference to AgentService for event emission
    setAgentService(agentService) {
        this.agentService = agentService;
    }

    // Core agent methods (must be implemented by subclasses)
    async initialize() {
        await this.log('info', 'Initializing agent', { status: 'initializing' });
        this.status = 'initializing';
        this.startTime = new Date();
        
        // Base initialization logic
        await this.loadDependencies();
        await this.validateConfiguration();
        
        this.status = 'initialized';
        await this.log('success', 'Agent initialized successfully', { status: 'initialized' });
    }

    async execute() {
        await this.log('info', 'Starting execution', { status: 'running' });
        this.status = 'running';
        
        try {
            // Wait for dependencies if any
            if (this.dependencies.length > 0) {
                await this.waitForDependencies(this.dependencies);
            }

            // Execute main logic (to be implemented by subclasses)
            await this.performWork();
            
            this.status = 'completed';
            this.progress = 100;
            await this.log('success', 'Agent completed successfully', { 
                status: 'completed',
                progress: 100,
                duration: this.startTime ? Date.now() - this.startTime.getTime() : null
            });
        } catch (error) {
            this.status = 'error';
            await this.log('error', `Agent execution failed: ${error.message}`, { 
                status: 'error',
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async pause() {
        console.log(`⏸️ Pausing agent ${this.agentId}`);
        this.status = 'paused';
        // Save current state if needed
        await this.saveState();
    }

    async resume() {
        console.log(`▶️ Resuming agent ${this.agentId}`);
        this.status = 'running';
        // Restore state if needed
        await this.restoreState();
    }

    async cleanup() {
        console.log(`🧹 Cleaning up agent ${this.agentId}`);
        this.status = 'cleaning_up';
        
        // Clean up resources
        await this.cleanupResources();
        
        this.status = 'stopped';
        console.log(`🛑 Agent ${this.agentId} stopped`);
    }

    // Virtual methods to be implemented by subclasses
    async performWork() {
        throw new Error(`performWork() must be implemented by ${this.constructor.name}`);
    }

    async loadDependencies() {
        // Override in subclasses to load specific dependencies
        return true;
    }

    async validateConfiguration() {
        // Override in subclasses to validate specific configuration
        return true;
    }

    async saveState() {
        // Override in subclasses to save agent-specific state
        return true;
    }

    async restoreState() {
        // Override in subclasses to restore agent-specific state
        return true;
    }

    async cleanupResources() {
        // Override in subclasses to cleanup agent-specific resources
        return true;
    }

    // Memory management
    async storeMemory(key, value, metadata = {}) {
        try {
            const memoryEntry = {
                key,
                value,
                metadata: {
                    ...metadata,
                    timestamp: new Date(),
                    agentId: this.agentId,
                    sessionId: this.sessionId
                }
            };

            // Store in local memory
            this.memory.set(key, memoryEntry);

            // Persist to database if configured
            if (this.config.persistMemory !== false) {
                await this.persistMemory(key, value, metadata);
            }

            console.log(`💾 Stored memory: ${key} for agent ${this.agentId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error storing memory for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async retrieveMemory(key) {
        try {
            // Try local memory first
            if (this.memory.has(key)) {
                return this.memory.get(key);
            }

            // Try database if not in local memory
            const persistedMemory = await this.loadPersistedMemory(key);
            if (persistedMemory) {
                this.memory.set(key, persistedMemory);
                return persistedMemory;
            }

            return null;
        } catch (error) {
            console.error(`❌ Error retrieving memory for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async searchMemory(query) {
        try {
            const results = [];
            
            // Search local memory
            for (const [key, entry] of this.memory.entries()) {
                if (this.matchesQuery(entry, query)) {
                    results.push({ key, ...entry });
                }
            }

            // Search persisted memory if needed
            const persistedResults = await this.searchPersistedMemory(query);
            results.push(...persistedResults);

            return results;
        } catch (error) {
            console.error(`❌ Error searching memory for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    // Task management
    async addTask(task) {
        try {
            const taskId = uuidv4();
            const taskData = {
                id: taskId,
                ...task,
                status: 'pending',
                createdAt: new Date(),
                agentId: this.agentId,
                sessionId: this.sessionId
            };

            this.tasks.push(taskData);

            // Persist task if configured
            if (this.config.persistTasks !== false) {
                await this.persistTask(taskData);
            }

            console.log(`📋 Added task ${taskId} to agent ${this.agentId}`);
            return { success: true, taskId };
        } catch (error) {
            console.error(`❌ Error adding task for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async completeTask(taskId, result) {
        try {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            task.status = 'completed';
            task.result = result;
            task.completedAt = new Date();

            // Update persisted task
            if (this.config.persistTasks !== false) {
                await this.updatePersistedTask(taskId, { status: 'completed', result });
            }

            console.log(`✅ Completed task ${taskId} for agent ${this.agentId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error completing task for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async delegateTask(targetAgent, task) {
        try {
            // Send task to target agent via message system
            const message = {
                type: 'task_delegation',
                sessionId: this.sessionId,
                data: {
                    task,
                    fromAgent: this.agentId,
                    targetAgent
                }
            };

            // This would be sent via the AgentService message system
            console.log(`📨 Delegated task to ${targetAgent} from agent ${this.agentId}`);
            return { success: true, delegated: true };
        } catch (error) {
            console.error(`❌ Error delegating task for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    // Artifact creation
    async createArtifact(type, content, metadata = {}) {
        try {
            const artifactId = uuidv4();
            const artifact = {
                id: artifactId,
                type,
                content,
                metadata: {
                    ...metadata,
                    agentId: this.agentId,
                    sessionId: this.sessionId,
                    createdAt: new Date()
                },
                status: 'draft'
            };

            this.artifacts.push(artifact);

            // Persist artifact
            await this.persistArtifact(artifact);

            console.log(`🎨 Created artifact ${artifactId} of type ${type} for agent ${this.agentId}`);
            return { success: true, artifactId, artifact };
        } catch (error) {
            console.error(`❌ Error creating artifact for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async updateArtifact(artifactId, updates) {
        try {
            const artifact = this.artifacts.find(a => a.id === artifactId);
            if (!artifact) {
                throw new Error(`Artifact ${artifactId} not found`);
            }

            Object.assign(artifact, updates);
            artifact.metadata.updatedAt = new Date();

            // Update persisted artifact
            await this.updatePersistedArtifact(artifactId, updates);

            console.log(`📝 Updated artifact ${artifactId} for agent ${this.agentId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error updating artifact for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    // API helpers (using existing VSI endpoints)
    async searchCollections(query, options = {}) {
        try {
            const response = await this.httpClient.get('/api/collections');
            const collections = response.data.data || [];
            
            const searchResults = [];
            for (const collection of collections) {
                try {
                    const searchResponse = await this.httpClient.post(
                        `/api/collections/${collection.id}/search`,
                        { query, ...options }
                    );
                    
                    if (searchResponse.data.success) {
                        searchResults.push({
                            collection,
                            results: searchResponse.data.data || []
                        });
                    }
                } catch (error) {
                    console.warn(`⚠️ Search failed for collection ${collection.id}:`, error.message);
                }
            }

            return { success: true, data: searchResults };
        } catch (error) {
            console.error(`❌ Error searching collections for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async generateSmartContext(collectionId, query, options = {}) {
        try {
            const response = await this.httpClient.post(
                `/api/collections/${collectionId}/smart-context`,
                { query, ...options }
            );

            return response.data;
        } catch (error) {
            console.error(`❌ Error generating smart context for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async askQuestion(collectionId, question, options = {}) {
        try {
            const response = await this.httpClient.post(
                `/api/collections/${collectionId}/ask`,
                { question, ...options }
            );

            return response.data;
        } catch (error) {
            console.error(`❌ Error asking question for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async getClusters() {
        try {
            const response = await this.httpClient.get('/api/clusters');
            return response.data;
        } catch (error) {
            console.error(`❌ Error getting clusters for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async analyzeCluster(clusterId) {
        try {
            const response = await this.httpClient.get(`/api/clusters/${clusterId}/analysis`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error analyzing cluster for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    // Dependency management
    async waitForDependencies(dependencies) {
        console.log(`⏳ Agent ${this.agentId} waiting for dependencies: ${dependencies.join(', ')}`);
        
        const timeout = this.config.dependencyTimeout || 300000; // 5 minutes default
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const completedDependencies = [];
            
            for (const dependency of dependencies) {
                const result = await this.checkDependencyCompletion(dependency);
                if (result) {
                    completedDependencies.push(dependency);
                    this.dependencyResults.set(dependency, result);
                }
            }

            // Remove completed dependencies
            dependencies = dependencies.filter(dep => !completedDependencies.includes(dep));
            
            if (dependencies.length === 0) {
                console.log(`✅ All dependencies completed for agent ${this.agentId}`);
                return true;
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
        }

        throw new Error(`Timeout waiting for dependencies: ${dependencies.join(', ')}`);
    }

    async checkDependencyCompletion(dependency) {
        // This would check the shared memory or database for dependency completion
        const sharedMemory = await this.getSharedMemory(dependency);
        return sharedMemory;
    }

    async getSharedMemory(key) {
        // Access shared memory across agents in the same session
        try {
            // This would query the database for shared session memory
            return await this.loadSharedMemory(key);
        } catch (error) {
            return null;
        }
    }

    async getSharedArtifact(artifactName) {
        // Access shared artifacts across agents in the same session
        try {
            return await this.loadSharedArtifact(artifactName);
        } catch (error) {
            return null;
        }
    }

    // Progress reporting
    updateProgress(progress, currentTask = null) {
        this.progress = Math.min(100, Math.max(0, progress));
        this.currentTask = currentTask;
        
        // Emit progress event to AgentService if available
        if (this.agentService) {
            this.agentService.emit('agent_progress', {
                agentId: this.agentId,
                sessionId: this.sessionId,
                progress: this.progress,
                message: currentTask || 'Working...',
                timestamp: new Date().toISOString()
            });
        }
        
        // Log progress update
        this.log('info', `Progress: ${this.progress}% - ${currentTask || 'Working...'}`, {
            progress: this.progress,
            currentTask: currentTask
        });
    }

    // Logging methods
    async log(level, message, metadata = {}) {
        const timestamp = new Date();
        const logEntry = {
            timestamp,
            level,
            message,
            agentId: this.agentId,
            sessionId: this.sessionId,
            metadata
        };

        // Console output for development
        const emoji = this.getLogEmoji(level);
        console.log(`${emoji} [${level.toUpperCase()}] Agent ${this.agentId}: ${message}`);

        // Persist to database if available
        await this.persistLog(logEntry);
    }

    getLogEmoji(level) {
        const emojis = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌',
            'debug': '🔍'
        };
        return emojis[level] || 'ℹ️';
    }

    async persistLog(logEntry) {
        try {
            if (!this.db) {
                // No database service available, skip persistence
                return;
            }

            const query = `
                INSERT INTO agent_logs (
                    session_id, agent_id, log_level, message, details
                ) VALUES ($1, $2, $3, $4, $5)
            `;

            const values = [
                this.sessionId,
                this.agentId,
                logEntry.level,
                logEntry.message,
                JSON.stringify(logEntry.metadata || {})
            ];

            await this.db.query(query, values);
        } catch (error) {
            // Don't throw errors for logging failures, just log to console
            console.error(`Failed to persist log for agent ${this.agentId}:`, error.message);
        }
    }

    // Helper methods for data persistence (to be implemented based on database schema)
    async persistMemory(key, value, metadata) {
        // Implementation would use DatabaseService to store in agent_memory table
        return true;
    }

    async loadPersistedMemory(key) {
        // Implementation would use DatabaseService to load from agent_memory table
        return null;
    }

    async searchPersistedMemory(query) {
        // Implementation would use DatabaseService to search agent_memory table
        return [];
    }

    async persistTask(taskData) {
        // Implementation would use DatabaseService to store in agent_tasks table
        return true;
    }

    async updatePersistedTask(taskId, updates) {
        // Implementation would use DatabaseService to update agent_tasks table
        return true;
    }

    async persistArtifact(artifact) {
        try {
            if (!this.db) {
                console.warn(`⚠️ No database service available for agent ${this.agentId}, artifact not persisted`);
                return false;
            }
            
            const query = `
                INSERT INTO agent_artifacts (
                    id, session_id, agent_id, artifact_type, artifact_name, 
                    content, metadata, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING id
            `;
            
            const values = [
                artifact.id,
                this.sessionId,
                this.agentId,
                artifact.type,
                artifact.metadata.name || artifact.type,
                JSON.stringify(artifact.content),
                JSON.stringify(artifact.metadata),
                artifact.status || 'draft'
            ];
            
            const result = await this.db.query(query, values);
            console.log(`💾 Persisted artifact ${artifact.id} to database for agent ${this.agentId}`);
            return result.rows[0];
        } catch (error) {
            console.error(`❌ Error persisting artifact for agent ${this.agentId}:`, error);
            throw error;
        }
    }

    async updatePersistedArtifact(artifactId, updates) {
        // Implementation would use DatabaseService to update agent_artifacts table
        return true;
    }

    async loadSharedMemory(key) {
        // Implementation would load memory shared across agents in the session
        return null;
    }

    async loadSharedArtifact(artifactName) {
        // Implementation would load artifacts shared across agents in the session
        return null;
    }

    // Utility methods
    matchesQuery(entry, query) {
        // Simple text matching for memory search
        const searchText = JSON.stringify(entry).toLowerCase();
        return searchText.includes(query.toLowerCase());
    }

    // Lifecycle hooks (can be overridden by subclasses)
    async onInitialize() {
        // Called after successful initialization
    }

    async onStart() {
        // Called when execution starts
    }

    async onProgress(progress) {
        // Called when progress is updated
    }

    async onComplete() {
        // Called when execution completes successfully
    }

    async onError(error) {
        // Called when an error occurs
    }

    async onPause() {
        // Called when agent is paused
    }

    async onResume() {
        // Called when agent is resumed
    }

    async onCleanup() {
        // Called during cleanup
    }
}

module.exports = { BaseAgent };
