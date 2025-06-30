const { DatabaseService } = require('./databaseService');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class AgentService extends EventEmitter {
    constructor(databaseService) {
        super();
        this.db = databaseService;
        this.agents = new Map();
        this.sessions = new Map();
        this.messageQueue = [];
        this.sseClients = new Map();
        
        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for session management
     */
    setupEventListeners() {
        this.on('agent_completed', async ({ agentId, sessionId }) => {
            try {
                console.log(`🔍 Checking if session ${sessionId} is complete after agent ${agentId} completion`);
                await this.checkSessionCompletion(sessionId);
            } catch (error) {
                console.error(`❌ Error checking session completion for ${sessionId}:`, error);
            }
        });
    }

    /**
     * Check if all agents in a session have completed and update session status
     */
    async checkSessionCompletion(sessionId) {
        try {
            const sessionInfo = this.sessions.get(sessionId);
            if (!sessionInfo) {
                console.log(`⚠️ Session ${sessionId} not found in active sessions`);
                return;
            }

            // Check if all agents are completed
            let allCompleted = true;
            let hasErrors = false;
            let completedCount = 0;
            let totalCount = 0;

            for (const [agentId, agentData] of sessionInfo.agents) {
                totalCount++;
                const agentInfo = this.agents.get(agentId);
                if (agentInfo) {
                    if (agentInfo.status === 'completed') {
                        completedCount++;
                    } else if (agentInfo.status === 'error') {
                        hasErrors = true;
                        completedCount++; // Count errors as "completed" for session closure
                    } else {
                        allCompleted = false;
                    }
                }
            }

            console.log(`📊 Session ${sessionId} progress: ${completedCount}/${totalCount} agents completed`);

            if (allCompleted && totalCount > 0) {
                const newStatus = hasErrors ? 'error' : 'completed';
                console.log(`✅ All agents completed for session ${sessionId}, updating status to '${newStatus}'`);
                
                // Update session status in database
                await this.updateSession(sessionId, { 
                    status: newStatus,
                    completed_at: new Date()
                });

                // Broadcast session completion
                this.emit('session_status_updated', {
                    sessionId,
                    status: newStatus,
                    message: hasErrors ? 'Session completed with errors' : 'Session completed successfully',
                    completedAgents: completedCount,
                    totalAgents: totalCount,
                    timestamp: new Date().toISOString()
                });

                console.log(`🎉 Session ${sessionId} marked as ${newStatus}`);
            }
        } catch (error) {
            console.error(`❌ Error checking session completion for ${sessionId}:`, error);
        }
    }

    /**
     * Safely parse preferences from database
     */
    parsePreferences(preferences) {
        if (!preferences) return {};
        if (typeof preferences === 'object') return preferences;
        if (typeof preferences === 'string') {
            try {
                return JSON.parse(preferences);
            } catch (error) {
                console.warn('Failed to parse preferences JSON:', preferences, error);
                return {};
            }
        }
        return {};
    }

    // Agent lifecycle management
    async registerAgent(agentId, agentClass, config) {
        try {
            console.log(`📝 Registering agent: ${agentId} of type ${agentClass.name}`);
            
            // Validate agent class has required methods
            const requiredMethods = ['initialize', 'execute', 'pause', 'resume', 'cleanup'];
            for (const method of requiredMethods) {
                if (typeof agentClass.prototype[method] !== 'function') {
                    throw new Error(`Agent class ${agentClass.name} missing required method: ${method}`);
                }
            }
            
            // Store agent registration
            this.agents.set(agentId, {
                class: agentClass,
                config: config,
                status: 'registered',
                instance: null,
                createdAt: new Date()
            });
            
            this.emit('agent_registered', { agentId, type: agentClass.name });
            return { success: true, agentId };
        } catch (error) {
            console.error(`❌ Error registering agent ${agentId}:`, error);
            throw error;
        }
    }

    async startAgent(agentId, sessionId, userToken = null) {
        try {
            console.log(`🚀 Starting individual agent: ${agentId} for session: ${sessionId}`);
            const agentInfo = this.agents.get(agentId);
            if (!agentInfo) {
                throw new Error(`Agent ${agentId} not found`);
            }
            console.log(`📋 Agent info found:`, { class: agentInfo.class.name, status: agentInfo.status });

            // Create agent instance
            const AgentClass = agentInfo.class;
            const apiClient = this.createApiClient(sessionId, userToken);
            console.log(`🔗 API client created for session: ${sessionId}${userToken ? ' (with auth token)' : ' (no auth token)'}`);
            
            const instance = new AgentClass(agentId, sessionId, agentInfo.config, apiClient, this.db);
            console.log(`🆕 Agent instance created: ${AgentClass.name} with database service: ${this.db ? 'YES' : 'NO'}`);
            console.log(`🗄️ Database service type: ${this.db ? this.db.constructor.name : 'undefined'}`);
            
            // Set reference to AgentService for event emission
            instance.setAgentService(this);
            console.log(`🔗 Agent service reference set`);
            
            // Update agent info
            agentInfo.instance = instance;
            agentInfo.status = 'starting';
            agentInfo.startedAt = new Date();
            console.log(`📝 Agent status updated to 'starting'`);
            
            // Initialize and start execution
            console.log(`🔧 Initializing agent...`);
            await instance.initialize();
            console.log(`✅ Agent initialized successfully`);
            
            agentInfo.status = 'running';
            console.log(`📝 Agent status updated to 'running'`);
            
            // Add agent to session tracking
            const sessionInfo = this.sessions.get(sessionId);
            if (sessionInfo) {
                sessionInfo.agents.set(agentId, {
                    type: AgentClass.name,
                    status: 'running',
                    startedAt: new Date()
                });
                console.log(`📊 Agent ${agentId} added to session ${sessionId} tracking`);
            } else {
                console.warn(`⚠️ Session ${sessionId} not found in active sessions for agent tracking`);
            }
            
            // Start execution in background
            console.log(`🚀 Starting background execution...`);
            this.executeAgentAsync(agentId, instance);
            
            this.emit('agent_started', { agentId, sessionId, type: AgentClass.name });
            console.log(`📡 Emitted agent_started event`);
            
            return { success: true, status: 'running' };
        } catch (error) {
            console.error(`❌ Error starting agent ${agentId}:`, error);
            const agentInfo = this.agents.get(agentId);
            if (agentInfo) {
                agentInfo.status = 'error';
                agentInfo.error = error.message;
            }
            throw error;
        }
    }

    async stopAgent(agentId) {
        try {
            const agentInfo = this.agents.get(agentId);
            if (!agentInfo || !agentInfo.instance) {
                throw new Error(`Agent ${agentId} not running`);
            }

            agentInfo.status = 'stopping';
            await agentInfo.instance.cleanup();
            agentInfo.status = 'stopped';
            agentInfo.stoppedAt = new Date();
            
            this.emit('agent_stopped', { agentId });
            return { success: true, status: 'stopped' };
        } catch (error) {
            console.error(`❌ Error stopping agent ${agentId}:`, error);
            throw error;
        }
    }

    async pauseAgent(agentId) {
        try {
            const agentInfo = this.agents.get(agentId);
            if (!agentInfo || !agentInfo.instance) {
                throw new Error(`Agent ${agentId} not running`);
            }

            await agentInfo.instance.pause();
            agentInfo.status = 'paused';
            
            this.emit('agent_paused', { agentId });
            return { success: true, status: 'paused' };
        } catch (error) {
            console.error(`❌ Error pausing agent ${agentId}:`, error);
            throw error;
        }
    }

    // Session management
    async createSession(userId, researchTopic, preferences = {}) {
        try {
            const sessionId = uuidv4();
            const sessionData = {
                id: sessionId,
                user_id: userId,
                research_topic: researchTopic,
                preferences: JSON.stringify(preferences),
                status: 'created',
                created_at: new Date(),
                updated_at: new Date()
            };

            // Store in database
            const query = `
                INSERT INTO agent_sessions (id, user_id, research_topic, preferences, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            
            const result = await this.db.query(query, [
                sessionData.id,
                sessionData.user_id,
                sessionData.research_topic,
                sessionData.preferences,
                sessionData.status,
                sessionData.created_at,
                sessionData.updated_at
            ]);

            // Store in memory
            this.sessions.set(sessionId, {
                ...sessionData,
                preferences: preferences, // Keep parsed version in memory
                agents: new Map(),
                artifacts: new Map(),
                progress: {
                    overall: 0,
                    agents: []
                }
            });

            this.emit('session_created', { sessionId, userId, researchTopic });
            return result.rows[0];
        } catch (error) {
            console.error(`❌ Error creating session:`, error);
            throw error;
        }
    }

    async getSession(sessionId, userId = null) {
        try {
            let query = 'SELECT * FROM agent_sessions WHERE id = $1';
            let params = [sessionId];
            
            if (userId) {
                query += ' AND user_id = $2';
                params.push(userId);
            }

            const result = await this.db.query(query, params);
            if (result.rows.length === 0) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const session = result.rows[0];
            session.preferences = this.parsePreferences(session.preferences);
            
            // Ensure session is in memory for tracking if not already there
            if (!this.sessions.has(sessionId)) {
                console.log(`💭 Loading session ${sessionId} into memory for tracking`);
                this.sessions.set(sessionId, {
                    ...session,
                    agents: new Map(),
                    artifacts: new Map(),
                    progress: {
                        overall: 0,
                        agents: []
                    }
                });
            }
            
            return session;
        } catch (error) {
            console.error(`❌ Error getting session ${sessionId}:`, error);
            throw error;
        }
    }

    async updateSession(sessionId, updates) {
        try {
            const setClause = Object.keys(updates)
                .map((key, index) => `${key} = $${index + 2}`)
                .join(', ');
            
            const query = `
                UPDATE agent_sessions 
                SET ${setClause}, updated_at = NOW() 
                WHERE id = $1 
                RETURNING *
            `;
            
            const params = [sessionId, ...Object.values(updates)];
            const result = await this.db.query(query, params);
            
            if (result.rows.length === 0) {
                throw new Error(`Session ${sessionId} not found`);
            }

            // Update memory if session exists
            if (this.sessions.has(sessionId)) {
                Object.assign(this.sessions.get(sessionId), updates);
            }

            this.emit('session_updated', { sessionId, updates });
            return result.rows[0];
        } catch (error) {
            console.error(`❌ Error updating session ${sessionId}:`, error);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        try {
            // Stop all agents in session first
            const sessionInfo = this.sessions.get(sessionId);
            if (sessionInfo) {
                for (const agentId of sessionInfo.agents.keys()) {
                    await this.stopAgent(agentId);
                }
            }

            // Delete from database (cascade will handle related records)
            const query = 'DELETE FROM agent_sessions WHERE id = $1';
            await this.db.query(query, [sessionId]);

            // Remove from memory
            this.sessions.delete(sessionId);

            this.emit('session_deleted', { sessionId });
            return { success: true };
        } catch (error) {
            console.error(`❌ Error deleting session ${sessionId}:`, error);
            throw error;
        }
    }

    // Inter-agent communication
    async sendMessage(fromAgent, toAgent, message) {
        try {
            const messageId = uuidv4();
            const messageData = {
                id: messageId,
                from_agent: fromAgent,
                to_agent: toAgent,
                message_type: message.type,
                message_data: JSON.stringify(message.data),
                status: 'sent',
                created_at: new Date()
            };

            // Store in database
            const query = `
                INSERT INTO agent_messages (id, session_id, from_agent, to_agent, message_type, message_data, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            await this.db.query(query, [
                messageData.id,
                message.sessionId,
                messageData.from_agent,
                messageData.to_agent,
                messageData.message_type,
                messageData.message_data,
                messageData.status,
                messageData.created_at
            ]);

            // Add to processing queue
            this.messageQueue.push({
                ...messageData,
                sessionId: message.sessionId,
                data: message.data
            });

            this.emit('message_sent', { messageId, fromAgent, toAgent });
            return { success: true, messageId };
        } catch (error) {
            console.error(`❌ Error sending message:`, error);
            throw error;
        }
    }

    async broadcastMessage(fromAgent, message) {
        try {
            return await this.sendMessage(fromAgent, null, message);
        } catch (error) {
            console.error(`❌ Error broadcasting message:`, error);
            throw error;
        }
    }

    async subscribeToMessages(agentId, messageType, handler) {
        const eventName = `message_${messageType}_${agentId}`;
        this.on(eventName, handler);
        return { success: true, eventName };
    }

    // Helper methods
    async executeAgentAsync(agentId, instance) {
        try {
            console.log(`🏃 Starting async execution for agent: ${agentId}`);
            await instance.execute();
            console.log(`✅ Agent execution completed: ${agentId}`);
            
            const agentInfo = this.agents.get(agentId);
            if (agentInfo) {
                agentInfo.status = 'completed';
                agentInfo.completedAt = new Date();
                console.log(`📝 Agent status updated to 'completed'`);
            }
            
            this.emit('agent_completed', { 
                agentId, 
                sessionId: instance.sessionId 
            });
            console.log(`📡 Emitted agent_completed event`);
        } catch (error) {
            console.error(`❌ Agent ${agentId} execution error:`, error);
            
            const agentInfo = this.agents.get(agentId);
            if (agentInfo) {
                agentInfo.status = 'error';
                agentInfo.error = error.message;
                console.log(`📝 Agent status updated to 'error'`);
            }
            
            this.emit('agent_error', { 
                agentId, 
                sessionId: instance.sessionId, 
                error: error.message 
            });
            console.log(`📡 Emitted agent_error event`);
        }
    }

    createApiClient(sessionId, userToken = null) {
        // Create API client that agents can use to access VSI endpoints
        const { AgentApiClient } = require('./agentApiClient');
        return new AgentApiClient(sessionId, null, userToken);
    }

    startMessageProcessing() {
        setInterval(() => {
            if (!this.isProcessing && this.messageQueue.length > 0) {
                this.processMessageQueue();
            }
        }, 1000); // Process every second
    }

    async processMessageQueue() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        try {
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                await this.deliverMessage(message);
            }
        } catch (error) {
            console.error('❌ Error processing message queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async deliverMessage(message) {
        try {
            // Broadcast or targeted delivery
            if (message.to_agent === null) {
                // Broadcast to all agents in session
                const sessionInfo = this.sessions.get(message.sessionId);
                if (sessionInfo) {
                    for (const agentId of sessionInfo.agents.keys()) {
                        this.emit(`message_${message.message_type}_${agentId}`, message);
                    }
                }
            } else {
                // Targeted delivery
                this.emit(`message_${message.message_type}_${message.to_agent}`, message);
            }

            // Update message status
            await this.db.query(
                'UPDATE agent_messages SET status = $1, processed_at = NOW() WHERE id = $2',
                ['delivered', message.id]
            );
        } catch (error) {
            console.error(`❌ Error delivering message ${message.id}:`, error);
        }
    }

    // Session utility methods
    async getUserSessions(userId) {
        try {
            const query = `
                SELECT * FROM agent_sessions 
                WHERE user_id = $1 
                ORDER BY created_at DESC
            `;
            const result = await this.db.query(query, [userId]);
            
            return result.rows.map(session => ({
                ...session,
                preferences: this.parsePreferences(session.preferences)
            }));
        } catch (error) {
            console.error(`❌ Error getting user sessions:`, error);
            throw error;
        }
    }

    async getSessionProgress(sessionId, userId = null) {
        try {
            const session = await this.getSession(sessionId, userId);
            const sessionInfo = this.sessions.get(sessionId);
            
            if (!sessionInfo) {
                return { overall: 0, agents: [], status: session.status };
            }

            return sessionInfo.progress;
        } catch (error) {
            console.error(`❌ Error getting session progress:`, error);
            throw error;
        }
    }

    async getSessionArtifacts(sessionId, userId = null) {
        try {
            await this.getSession(sessionId, userId); // Verify access
            
            const query = `
                SELECT * FROM agent_artifacts 
                WHERE session_id = $1 
                ORDER BY created_at DESC
            `;
            const result = await this.db.query(query, [sessionId]);
            
            return result.rows.map(artifact => ({
                ...artifact,
                // PostgreSQL JSONB automatically deserializes to objects, so don't parse again
                content: typeof artifact.content === 'string' ? JSON.parse(artifact.content) : artifact.content || {},
                metadata: typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata || {}
            }));
        } catch (error) {
            console.error(`❌ Error getting session artifacts:`, error);
            throw error;
        }
    }

    async startAgents(sessionId, userId, agentTypes, userToken = null) {
        try {
            console.log(`🚀 Starting agents for session ${sessionId}, user ${userId}, types:`, agentTypes);
            const session = await this.getSession(sessionId, userId);
            console.log(`📋 Session found:`, { id: session.id, status: session.status, researchTopic: session.research_topic });
            const results = [];

            for (const agentType of agentTypes) {
                console.log(`🔧 Processing agent type: ${agentType}`);
                const agentId = `${sessionId}-${agentType}-${Date.now()}`;
                console.log(`🆔 Generated agent ID: ${agentId}`);
                
                try {
                    // Register and start agent
                    const AgentClass = this.getAgentClass(agentType);
                    console.log(`📦 Agent class loaded: ${AgentClass.name}`);
                    
                    const config = this.getAgentConfig(agentType, session.preferences);
                    console.log(`⚙️ Agent config generated:`, config);
                    
                    await this.registerAgent(agentId, AgentClass, config);
                    console.log(`📝 Agent registered: ${agentId}`);
                    
                    const result = await this.startAgent(agentId, sessionId, userToken);
                    console.log(`✅ Agent started successfully:`, result);
                    
                    results.push({ agentId, type: agentType, ...result });
                } catch (agentError) {
                    console.error(`❌ Error with agent ${agentType}:`, agentError);
                    throw agentError;
                }
            }

            console.log(`🎉 All agents started. Results:`, results);
            return { success: true, agents: results };
        } catch (error) {
            console.error(`❌ Error starting agents:`, error);
            throw error;
        }
    }

    async pauseSession(sessionId, userId) {
        try {
            const session = await this.getSession(sessionId, userId);
            const sessionInfo = this.sessions.get(sessionId);
            
            if (sessionInfo) {
                // Pause all running agents
                for (const agentId of sessionInfo.agents.keys()) {
                    const agentInfo = this.agents.get(agentId);
                    if (agentInfo && agentInfo.status === 'running') {
                        await this.pauseAgent(agentId);
                    }
                }
            }

            await this.updateSession(sessionId, { status: 'paused' });
            return { success: true };
        } catch (error) {
            console.error(`❌ Error pausing session:`, error);
            throw error;
        }
    }

    async stopSession(sessionId, userId) {
        try {
            const session = await this.getSession(sessionId, userId);
            const sessionInfo = this.sessions.get(sessionId);
            
            if (sessionInfo) {
                // Stop all agents
                for (const agentId of sessionInfo.agents.keys()) {
                    await this.stopAgent(agentId);
                }
            }

            await this.updateSession(sessionId, { status: 'stopped' });
            return { success: true };
        } catch (error) {
            console.error(`❌ Error stopping session:`, error);
            throw error;
        }
    }

    async restartSession(sessionId, userId, options = {}) {
        try {
            console.log(`🔄 Restarting session: ${sessionId}`);
            
            const session = await this.getSession(sessionId, userId);
            
            // Verify session is in a restartable state
            const restartableStates = ['completed', 'failed', 'error', 'stopped'];
            if (!restartableStates.includes(session.status)) {
                throw new Error(`Cannot restart session in status: ${session.status}. Session must be completed, failed, stopped, or error.`);
            }

            const { 
                clearArtifacts = true, 
                clearMemory = false,
                preserveSourceDiscovery = false,
                agentTypes = null
            } = options;
            
            console.log(`🔧 Restart options:`, { clearArtifacts, clearMemory, preserveSourceDiscovery });

            // Stop any remaining agents (safety measure)
            const sessionInfo = this.sessions.get(sessionId);
            if (sessionInfo) {
                console.log(`🛑 Stopping any remaining agents...`);
                for (const agentId of sessionInfo.agents.keys()) {
                    try {
                        await this.stopAgent(agentId);
                    } catch (error) {
                        console.warn(`⚠️ Warning stopping agent ${agentId}:`, error.message);
                    }
                }
                
                // Clear agent tracking from session
                sessionInfo.agents.clear();
                
                // Clear artifacts if requested
                if (clearArtifacts) {
                    console.log(`🗑️ Clearing session artifacts...`);
                    if (preserveSourceDiscovery) {
                        console.log(`📋 Preserving source discovery artifacts`);
                        // Keep only source discovery artifacts
                        for (const [key, artifact] of sessionInfo.artifacts) {
                            if (!key.includes('source_discovery')) {
                                sessionInfo.artifacts.delete(key);
                            }
                        }
                    } else {
                        sessionInfo.artifacts.clear();
                    }
                }
                
                // Reset progress
                sessionInfo.progress = {
                    overall: 0,
                    agents: []
                };
            }

            // Clear memory if requested
            if (clearMemory) {
                console.log(`🧠 Clearing session memory...`);
                try {
                    // Clear agent memory for this session
                    await this.clearSessionMemory(sessionId);
                } catch (error) {
                    console.warn(`⚠️ Warning clearing session memory:`, error.message);
                }
            }

            // Reset session status and timestamps
            const updateData = { 
                status: 'created',
                error_message: null,
                completed_at: null,
                updated_at: new Date()
            };
            
            await this.updateSession(sessionId, updateData);
            console.log(`✅ Session reset to 'created' status`);

            // Determine agent types to start
            let typesToStart = agentTypes;
            if (!typesToStart) {
                // Use default agents or extract from preferences
                const preferences = session.preferences || {};
                typesToStart = preferences.agentTypes || ['orchestrator'];
            }

            console.log(`🚀 Starting fresh agents:`, typesToStart);
            
            // Extract auth token if available (for agent API calls)
            const token = options.userToken || null;
            
            // Start fresh agents
            const result = await this.startAgents(sessionId, userId, typesToStart, token);
            
            console.log(`🎉 Session restart completed successfully`);
            return { 
                success: true, 
                message: 'Session restarted successfully',
                agents: result.agents,
                clearedArtifacts: clearArtifacts,
                clearedMemory: clearMemory
            };
            
        } catch (error) {
            console.error(`❌ Error restarting session ${sessionId}:`, error);
            
            // Try to set session to error state if restart failed
            try {
                await this.updateSession(sessionId, { 
                    status: 'error',
                    error_message: `Restart failed: ${error.message}`
                });
            } catch (updateError) {
                console.error(`❌ Failed to update session status after restart error:`, updateError);
            }
            
            throw error;
        }
    }

    // Helper method to clear session memory
    async clearSessionMemory(sessionId) {
        try {
            // Clear session-specific memory (if table exists)
            const query = 'DELETE FROM agent_memory WHERE session_id = $1';
            await this.db.query(query, [sessionId]);
            console.log(`🧹 Cleared memory for session ${sessionId}`);
        } catch (error) {
            // Ignore table not found errors (agent_memory is optional)
            if (error.message.includes('does not exist') || error.message.includes('relation') && error.message.includes('does not exist')) {
                console.log(`💭 Agent memory table not found, skipping memory cleanup`);
            } else {
                console.error(`❌ Error clearing session memory:`, error);
                throw error;
            }
        }
    }

    // Agent class loading and configuration
    getAgentClass(agentType) {
        try {
            switch (agentType) {
                case 'orchestrator':
                    const { OrchestratorAgent } = require('../agents/OrchestratorAgent');
                    return OrchestratorAgent;
                case 'source_discovery':
                    const { SourceDiscoveryAgent } = require('../agents/SourceDiscoveryAgent');
                    return SourceDiscoveryAgent;
                case 'content_analysis':
                    const { ContentAnalysisAgent } = require('../agents/ContentAnalysisAgent');
                    return ContentAnalysisAgent;
                case 'synthesis':
                    const { SynthesisAgent } = require('../agents/SynthesisAgent');
                    return SynthesisAgent;
                case 'fact_checking':
                    const { FactCheckingAgent } = require('../agents/FactCheckingAgent');
                    return FactCheckingAgent;
                case 'language':
                    const { LanguageAgent } = require('../agents/LanguageAgent');
                    return LanguageAgent;
                default:
                    throw new Error(`Unknown agent type: ${agentType}`);
            }
        } catch (error) {
            console.error(`❌ Error loading agent class for ${agentType}:`, error);
            throw new Error(`Failed to load agent class for type: ${agentType}`);
        }
    }

    getAgentConfig(agentType, sessionPreferences = {}) {
        const baseConfig = {
            agentType: agentType,
            preferences: sessionPreferences,
            timeout: 30000,
            maxRetries: 3,
            query: sessionPreferences.researchTopic || '',
            inputs: {
                query: sessionPreferences.researchTopic || '',
                collections: null
            }
        };

        // Type-specific configuration
        switch (agentType) {
            case 'orchestrator':
                return {
                    ...baseConfig,
                    specializedAgents: ['source_discovery', 'content_analysis', 'synthesis', 'fact_checking'],
                    coordinationStrategy: 'sequential',
                    useExternalSources: sessionPreferences.useExternalSources || false,
                    externalContent: sessionPreferences.externalContent || {}
                };
            case 'source_discovery':
                return {
                    ...baseConfig,
                    maxSources: sessionPreferences.maxSources || 50,
                    qualityThreshold: sessionPreferences.qualityThreshold || 0.6,
                    useExternalSources: sessionPreferences.useExternalSources || false,
                    externalContent: sessionPreferences.externalContent || {}
                };
            case 'content_analysis':
                return {
                    ...baseConfig,
                    analysisFrameworks: sessionPreferences.analysisFrameworks || ['thematic', 'sentiment'],
                    maxContextSize: sessionPreferences.maxContextSize || 4000,
                    useExternalSources: sessionPreferences.useExternalSources || false,
                    externalContent: sessionPreferences.externalContent || {}
                };
            case 'synthesis':
                return {
                    ...baseConfig,
                    maxSynthesisLength: sessionPreferences.maxSynthesisLength || 5000,
                    narrativeStyle: sessionPreferences.narrativeStyle || 'academic',
                    coherenceThreshold: sessionPreferences.coherenceThreshold || 0.8
                };
            case 'fact_checking':
                return {
                    ...baseConfig,
                    verificationSources: sessionPreferences.verificationSources || ['internal'],
                    confidenceThreshold: sessionPreferences.confidenceThreshold || 0.7,
                    useExternalSources: sessionPreferences.useExternalSources || false,
                    externalContent: sessionPreferences.externalContent || {}
                };
            case 'language':
                return {
                    ...baseConfig,
                    supportedLanguages: ['en', 'de', 'fr', 'es'],
                    autoDetection: true,
                    translationEnabled: sessionPreferences.translationEnabled || false
                };
            default:
                return baseConfig;
        }
    }
}

module.exports = { AgentService };
