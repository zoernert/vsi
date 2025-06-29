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
            console.log(`🆕 Agent instance created: ${AgentClass.name} with database service`);
            
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

    getAgentClass(agentType) {
        // Import agent classes
        const { OrchestratorAgent } = require('../agents/OrchestratorAgent');
        const { SourceDiscoveryAgent } = require('../agents/SourceDiscoveryAgent');
        const { ContentAnalysisAgent } = require('../agents/ContentAnalysisAgent');
        const { SynthesisAgent } = require('../agents/SynthesisAgent');
        const { FactCheckingAgent } = require('../agents/FactCheckingAgent');
        
        const agentClasses = {
            'orchestrator': OrchestratorAgent,
            'source_discovery': SourceDiscoveryAgent,
            'content_analysis': ContentAnalysisAgent,
            'synthesis': SynthesisAgent,
            'fact_checking': FactCheckingAgent,
        };
        
        const AgentClass = agentClasses[agentType];
        if (!AgentClass) {
            throw new Error(`Unknown agent type: ${agentType}. Available types: ${Object.keys(agentClasses).join(', ')}`);
        }
        
        return AgentClass;
    }

    getAgentConfig(agentType, preferences) {
        console.log(`⚙️ Generating config for agent type: ${agentType}`);
        console.log(`📋 Input preferences:`, preferences);
        
        const parsedPreferences = this.parsePreferences(preferences);
        console.log(`📋 Parsed preferences:`, parsedPreferences);
        
        // Generate agent-specific configuration based on preferences
        const baseConfig = {
            agentType,
            preferences: parsedPreferences,
            timeout: 30000,
            maxRetries: 3,
            query: parsedPreferences.researchTopic || 'No research topic specified',
            inputs: {
                query: parsedPreferences.researchTopic || 'No research topic specified',
                collections: parsedPreferences.collections || null
            }
        };
        
        console.log(`🔧 Base config generated:`, baseConfig);

        // Add agent-specific configuration
        switch (agentType) {
            case 'source_discovery':
                const sourceConfig = {
                    ...baseConfig,
                    maxSources: parsedPreferences.maxSources || 50,
                    qualityThreshold: parsedPreferences.qualityThreshold || 0.4, // Lowered for testing
                    // External content configuration
                    useExternalSources: parsedPreferences.enableExternalSources || false,
                    externalContent: {
                        maxExternalSources: parsedPreferences.maxExternalSources || 5,
                        search: {
                            enabled: parsedPreferences.enableWebSearch || false,
                            provider: parsedPreferences.webSearchProvider || 'duckduckgo',
                            maxResults: parsedPreferences.maxExternalSources || 5,
                            timeout: 30000
                        }
                    }
                };
                console.log(`🔍 Source discovery config:`, sourceConfig);
                return sourceConfig;
            case 'content_analysis':
                const analysisConfig = {
                    ...baseConfig,
                    frameworks: parsedPreferences.analysisFrameworks || ['thematic', 'sentiment'],
                    maxContextSize: parsedPreferences.maxContextSize || 4000,
                    // External content configuration
                    useExternalSources: parsedPreferences.enableExternalSources || false,
                    externalContent: {
                        enableWebSearch: parsedPreferences.enableWebSearch || false,
                        enableWebBrowsing: parsedPreferences.enableWebBrowsing || false,
                        maxExternalSources: parsedPreferences.maxExternalSources || 5,
                        browser: {
                            apiBase: parsedPreferences.browserApiBase || 'https://browserless.corrently.cloud',
                            timeout: 60000,
                            maxCommands: 50,
                            maxConcurrentSessions: 3
                        },
                        search: {
                            enabled: parsedPreferences.enableWebSearch || false,
                            provider: parsedPreferences.webSearchProvider || 'duckduckgo',
                            maxResults: parsedPreferences.maxExternalSources || 5,
                            timeout: 30000
                        }
                    }
                };
                console.log(`📊 Content analysis config:`, analysisConfig);
                return analysisConfig;
            case 'synthesis':
                const synthesisConfig = {
                    ...baseConfig,
                    maxSynthesisLength: parsedPreferences.maxSynthesisLength || 5000,
                    narrativeStyle: parsedPreferences.narrativeStyle || 'academic',
                    includeReferences: parsedPreferences.includeReferences !== false,
                    coherenceThreshold: parsedPreferences.coherenceThreshold || 0.8,
                    structureTemplate: parsedPreferences.structureTemplate || 'research'
                };
                console.log(`📝 Synthesis config:`, synthesisConfig);
                return synthesisConfig;
            case 'fact_checking':
                const factCheckConfig = {
                    ...baseConfig,
                    confidenceThreshold: parsedPreferences.confidenceThreshold || 0.7,
                    maxClaimsToCheck: parsedPreferences.maxClaimsToCheck || 50,
                    checkExternalSources: parsedPreferences.checkExternalSources || false,
                    disputeThreshold: parsedPreferences.disputeThreshold || 0.3,
                    verificationMethods: parsedPreferences.verificationMethods || ['source_cross_reference', 'statistical_validation']
                };
                console.log(`✅ Fact checking config:`, factCheckConfig);
                return factCheckConfig;
            default:
                console.log(`🔧 Default config for ${agentType}:`, baseConfig);
                return baseConfig;
        }
    }

    async provideFeedback(sessionId, userId, feedbackData) {
        try {
            const session = await this.getSession(sessionId, userId);
            const feedbackId = uuidv4();
            
            const query = `
                INSERT INTO agent_feedback (id, session_id, user_id, agent_id, artifact_id, feedback_type, feedback_data, priority, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;
            
            await this.db.query(query, [
                feedbackId,
                sessionId,
                userId,
                feedbackData.agentId || null,
                feedbackData.artifactId || null,
                feedbackData.type || 'general',
                JSON.stringify(feedbackData.feedback),
                feedbackData.priority || 'medium',
                'pending',
                new Date()
            ]);

            this.emit('feedback_received', { sessionId, feedbackId, ...feedbackData });
            return { success: true, feedbackId };
        } catch (error) {
            console.error(`❌ Error providing feedback:`, error);
            throw error;
        }
    }

    async getSessionLogs(sessionId, options = {}) {
        try {
            const { limit = 100, offset = 0, level } = options;
            
            let query = `
                SELECT * FROM agent_logs 
                WHERE session_id = $1
            `;
            const params = [sessionId];
            
            // Add level filter if specified
            if (level) {
                query += ` AND log_level = $${params.length + 1}`;
                params.push(level);
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);
            
            const result = await this.db.query(query, params);
            
            return result.rows.map(log => ({
                ...log,
                // PostgreSQL JSONB automatically deserializes to objects, so don't parse again
                metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata || {}
            }));
        } catch (error) {
            console.error(`❌ Error getting session logs:`, error);
            throw error;
        }
    }
}

module.exports = { AgentService };
