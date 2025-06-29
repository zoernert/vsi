const express = require('express');
const { AgentService } = require('../services/agentService');
const { auth } = require('../middleware');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const agentService = new AgentService();

// Store active SSE connections by session ID
const activeConnections = new Map();

// Helper function to broadcast status updates to all connected clients for a session
function broadcastSessionUpdate(sessionId, updateData) {
    const connections = activeConnections.get(sessionId) || [];
    console.log(`📡 Broadcasting to ${connections.length} connections for session ${sessionId}:`, updateData.type);
    connections.forEach(res => {
        try {
            res.write(`data: ${JSON.stringify(updateData)}\n\n`);
        } catch (error) {
            console.error('Error broadcasting to connection:', error);
        }
    });
}

// Listen for agent events to broadcast updates
agentService.on('agent_started', (data) => {
    console.log(`🚀 Agent started event:`, data);
    broadcastSessionUpdate(data.sessionId, {
        type: 'log',
        log: {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Started ${data.type} agent`,
            agentId: data.agentId
        }
    });
});

agentService.on('agent_progress', (data) => {
    console.log(`📈 Agent progress event:`, data);
    broadcastSessionUpdate(data.sessionId, {
        type: 'progress',
        progress: data.progress,
        message: data.message,
        agentId: data.agentId
    });
});

agentService.on('agent_completed', (data) => {
    console.log(`✅ Agent completed event:`, data);
    broadcastSessionUpdate(data.sessionId, {
        type: 'log',
        log: {
            timestamp: new Date().toISOString(),
            level: 'success',
            message: `Agent ${data.agentId} completed successfully`,
            agentId: data.agentId
        }
    });
    
    // Send result update
    broadcastSessionUpdate(data.sessionId, {
        type: 'result',
        result: {
            agentId: data.agentId,
            status: 'completed',
            timestamp: new Date().toISOString()
        }
    });
});

agentService.on('agent_error', async (data) => {
    console.log(`❌ Agent error event:`, data);
    
    // Stop the session on agent error
    try {
        await agentService.updateSession(data.sessionId, { 
            status: 'error',
            error_message: `Agent ${data.agentId} failed: ${data.error}`,
            completed_at: new Date()
        });
        
        // Broadcast error status and detailed log
        broadcastSessionUpdate(data.sessionId, {
            type: 'status',
            status: 'error',
            message: `Session stopped due to agent error: ${data.error}`,
            error: data.error,
            agentId: data.agentId,
            timestamp: new Date().toISOString()
        });
        
        broadcastSessionUpdate(data.sessionId, {
            type: 'log',
            log: {
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `Agent ${data.agentId} error: ${data.error}`,
                agentId: data.agentId,
                details: data.details || 'No additional details available'
            }
        });
        
        // Send final result indicating failure
        broadcastSessionUpdate(data.sessionId, {
            type: 'result',
            result: {
                agentId: data.agentId,
                status: 'failed',
                error: data.error,
                timestamp: new Date().toISOString()
            }
        });
    } catch (updateError) {
        console.error(`❌ Failed to update session status on agent error:`, updateError);
    }
});

// Events endpoint with manual auth (no middleware needed for SSE)
router.get('/sessions/:sessionId/events', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Handle authentication from query parameter or header
        let userId;
        let token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }
        
        // Verify token and get user
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            userId = decoded.id;
        } catch (authError) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        
        // Check if session exists and user has access
        const session = await agentService.getSession(sessionId, userId);
        
        // Set up Server-Sent Events
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // Send initial connection event
        res.write(`data: ${JSON.stringify({
            type: 'connected',
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        })}\n\n`);
        
        // Store this connection for broadcasting updates
        if (!activeConnections.has(sessionId)) {
            activeConnections.set(sessionId, []);
        }
        activeConnections.get(sessionId).push(res);
        
        // For now, send periodic heartbeat events
        // In a full implementation, this would listen to real agent events
        const heartbeatInterval = setInterval(() => {
            res.write(`data: ${JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString()
            })}\n\n`);
        }, 30000);
        
        // Clean up on disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            // Remove this connection from the active connections
            const connections = activeConnections.get(sessionId) || [];
            const index = connections.indexOf(res);
            if (index > -1) {
                connections.splice(index, 1);
                if (connections.length === 0) {
                    activeConnections.delete(sessionId);
                }
            }
            console.log(`🔌 SSE connection closed for session ${sessionId}`);
        });
        
        req.on('end', () => {
            clearInterval(heartbeatInterval);
        });
        
    } catch (error) {
        console.error(`❌ Error setting up session events ${sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to establish event stream'
            });
        }
    }
});

// Apply authentication to all other routes
router.use(auth);

// Session management
router.post('/sessions', async (req, res) => {
    try {
        const userId = req.user.id;
        const { researchTopic, preferences = {}, agentTypes = [] } = req.body;
        
        // Validate required fields
        if (!researchTopic) {
            return res.status(400).json({
                success: false,
                message: 'Research topic is required'
            });
        }
        
        // Create research session
        const session = await agentService.createSession(userId, researchTopic, {
            ...preferences,
            agentTypes,
            researchTopic // Store in preferences as well for agent access
        });
        
        console.log(`📝 Created research session ${session.id} for user ${userId}`);
        
        res.status(201).json({
            success: true,
            data: {
                ...session,
                preferences: agentService.parsePreferences(session.preferences)
            },
            message: 'Research session created successfully'
        });
    } catch (error) {
        console.error('❌ Error creating research session:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to create research session'
        });
    }
});

router.get('/sessions', async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, limit = 20, offset = 0 } = req.query;
        
        let sessions = await agentService.getUserSessions(userId);
        
        // Filter by status if provided
        if (status) {
            sessions = sessions.filter(s => s.status === status);
        }
        
        // Apply pagination
        const total = sessions.length;
        const paginatedSessions = sessions.slice(offset, offset + parseInt(limit));
        
        res.json({
            success: true,
            data: paginatedSessions,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: offset + parseInt(limit) < total
            }
        });
    } catch (error) {
        console.error('❌ Error getting user sessions:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to retrieve sessions'
        });
    }
});

router.get('/sessions/:sessionId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        const session = await agentService.getSession(sessionId, userId);
        
        res.json({
            success: true,
            data: {
                ...session,
                preferences: agentService.parsePreferences(session.preferences)
            }
        });
    } catch (error) {
        console.error(`❌ Error getting session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve session'
            });
        }
    }
});

router.put('/sessions/:sessionId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const updates = req.body;
        
        // Verify user has access to this session
        await agentService.getSession(sessionId, userId);
        
        // Prepare updates (ensure preferences are stringified if provided)
        const processedUpdates = { ...updates };
        if (processedUpdates.preferences) {
            processedUpdates.preferences = JSON.stringify(processedUpdates.preferences);
        }
        
        const updatedSession = await agentService.updateSession(sessionId, processedUpdates);
        
        res.json({
            success: true,
            data: {
                ...updatedSession,
                preferences: agentService.parsePreferences(updatedSession.preferences)
            },
            message: 'Session updated successfully'
        });
    } catch (error) {
        console.error(`❌ Error updating session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to update session'
            });
        }
    }
});

router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        // Verify user has access to this session
        await agentService.getSession(sessionId, userId);
        
        await agentService.deleteSession(sessionId);
        
        res.json({
            success: true,
            message: 'Session deleted successfully'
        });
    } catch (error) {
        console.error(`❌ Error deleting session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to delete session'
            });
        }
    }
});

// Agent control
router.post('/sessions/:sessionId/start', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { agentTypes = [] } = req.body;
        
        // Extract the bearer token for agents to use in API calls
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token required for agent operations'
            });
        }
        
        // Verify session exists and user has access
        const session = await agentService.getSession(sessionId, userId);
        
        if (session.status !== 'created' && session.status !== 'paused') {
            return res.status(400).json({
                success: false,
                message: `Cannot start agents for session in status: ${session.status}`
            });
        }
        
        // Use agent types from request or session preferences
        const sessionPrefs = agentService.parsePreferences(session.preferences);
        
        // First, try to get agent types from the request
        let requestedTypes = agentTypes;
        
        // If no agent types in request, check if session has a template_id
        if (requestedTypes.length === 0 && sessionPrefs.template_id) {
            // Get template configuration
            const templates = {
                'academic_research': ['orchestrator'],
                'market_research': ['orchestrator'], 
                'technical_analysis': ['orchestrator'],
                'quick_overview': ['orchestrator']
            };
            
            requestedTypes = templates[sessionPrefs.template_id] || ['orchestrator'];
            console.log(`🎯 Using template ${sessionPrefs.template_id} agent types:`, requestedTypes);
        }
        
        // Fall back to session preferences or default
        if (requestedTypes.length === 0) {
            requestedTypes = sessionPrefs.agentTypes || ['orchestrator'];
        }
        
        // Map frontend agent class names to backend types
        const agentTypeMapping = {
            'OrchestratorAgent': 'orchestrator',
            'SourceDiscoveryAgent': 'source_discovery', 
            'ContentAnalysisAgent': 'content_analysis',
            'SynthesisAgent': 'synthesis',
            'FactCheckingAgent': 'fact_checking'
        };
        
        const typesToStart = requestedTypes.map(type => 
            agentTypeMapping[type] || type
        );
        
        console.log(`🚀 Starting agents for session ${sessionId}: ${typesToStart.join(', ')}`);
        
        const result = await agentService.startAgents(sessionId, userId, typesToStart, token);
        
        // Update session status
        await agentService.updateSession(sessionId, { status: 'running' });
        
        // Broadcast status update to connected clients
        broadcastSessionUpdate(sessionId, {
            type: 'status',
            status: 'running',
            message: `Started ${result.agents.length} agents`,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            data: result,
            message: `Started ${result.agents.length} agents successfully`
        });
    } catch (error) {
        console.error(`❌ Error starting agents for session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to start agents'
            });
        }
    }
});

router.post('/sessions/:sessionId/pause', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        await agentService.pauseSession(sessionId, userId);
        
        // Broadcast status update to connected clients
        broadcastSessionUpdate(sessionId, {
            type: 'status',
            status: 'paused',
            message: 'Session paused',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Session paused successfully'
        });
    } catch (error) {
        console.error(`❌ Error pausing session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to pause session'
            });
        }
    }
});

router.post('/sessions/:sessionId/resume', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        // Verify session exists and is paused
        const session = await agentService.getSession(sessionId, userId);
        
        if (session.status !== 'paused') {
            return res.status(400).json({
                success: false,
                message: `Cannot resume session in status: ${session.status}`
            });
        }
        
        // Resume all paused agents (this would need to be implemented in AgentService)
        await agentService.updateSession(sessionId, { status: 'running' });
        
        // Broadcast status update to connected clients
        broadcastSessionUpdate(sessionId, {
            type: 'status',
            status: 'running',
            message: 'Session resumed',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Session resumed successfully'
        });
    } catch (error) {
        console.error(`❌ Error resuming session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to resume session'
            });
        }
    }
});

router.post('/sessions/:sessionId/stop', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        await agentService.stopSession(sessionId, userId);
        
        // Broadcast status update to connected clients
        broadcastSessionUpdate(sessionId, {
            type: 'status',
            status: 'stopped',
            message: 'Session stopped',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Session stopped successfully'
        });
    } catch (error) {
        console.error(`❌ Error stopping session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to stop session'
            });
        }
    }
});

// Progress and artifacts
router.get('/sessions/:sessionId/progress', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        const progress = await agentService.getSessionProgress(sessionId, userId);
        
        res.json({
            success: true,
            data: progress
        });
    } catch (error) {
        console.error(`❌ Error getting session progress ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve progress'
            });
        }
    }
});

router.get('/sessions/:sessionId/artifacts', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { type, status, limit = 50 } = req.query;
        
        let artifacts = await agentService.getSessionArtifacts(sessionId, userId);
        
        // Filter by type if provided
        if (type) {
            artifacts = artifacts.filter(a => a.artifact_type === type);
        }
        
        // Filter by status if provided
        if (status) {
            artifacts = artifacts.filter(a => a.status === status);
        }
        
        // Apply limit
        artifacts = artifacts.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            data: artifacts
        });
    } catch (error) {
        console.error(`❌ Error getting session artifacts ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve artifacts'
            });
        }
    }
});

router.get('/sessions/:sessionId/artifacts/:artifactId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId, artifactId } = req.params;
        
        // Verify user has access to session
        await agentService.getSession(sessionId, userId);
        
        // Get specific artifact (this would need to be implemented in AgentService)
        const artifacts = await agentService.getSessionArtifacts(sessionId, userId);
        const artifact = artifacts.find(a => a.id === artifactId);
        
        if (!artifact) {
            return res.status(404).json({
                success: false,
                message: 'Artifact not found'
            });
        }
        
        res.json({
            success: true,
            data: artifact
        });
    } catch (error) {
        console.error(`❌ Error getting artifact ${req.params.artifactId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve artifact'
            });
        }
    }
});

// Session logs and results
router.get('/sessions/:sessionId/logs', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        
        // Verify user has access to session
        await agentService.getSession(sessionId, userId);
        
        // Get session logs - for now return empty array as logs aren't implemented yet
        const logs = [];
        
        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error(`❌ Error getting session logs ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve logs'
            });
        }
    }
});

router.get('/sessions/:sessionId/results', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { type, limit = 50 } = req.query;
        
        // Verify user has access to session
        await agentService.getSession(sessionId, userId);
        
        // Get session artifacts as results
        const artifacts = await agentService.getSessionArtifacts(sessionId, userId);
        
        // Transform artifacts to results format
        const results = artifacts.map(artifact => ({
            id: artifact.id,
            type: artifact.artifact_type,
            agentId: artifact.agent_id,
            title: generateResultTitle(artifact),
            content: artifact.content,
            createdAt: artifact.created_at,
            metadata: artifact.metadata
        }));
        
        // Filter by type if specified
        const filteredResults = type ? 
            results.filter(result => result.type === type) : 
            results;
        
        // Apply limit
        const limitedResults = filteredResults.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            data: limitedResults
        });
    } catch (error) {
        console.error(`❌ Error getting session results ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve results'
            });
        }
    }
});

// Feedback and interaction
router.post('/sessions/:sessionId/feedback', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        const { agentId, artifactId, feedback, priority = 'medium', type = 'general' } = req.body;
        
        if (!feedback) {
            return res.status(400).json({
                success: false,
                message: 'Feedback content is required'
            });
        }
        
        const feedbackResult = await agentService.provideFeedback(sessionId, userId, {
            agentId,
            artifactId,
            feedback,
            priority,
            type
        });
        
        res.json({
            success: true,
            data: feedbackResult,
            message: 'Feedback provided successfully'
        });
    } catch (error) {
        console.error(`❌ Error providing feedback for session ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to provide feedback'
            });
        }
    }
});

// Agent types and templates
router.get('/agent-types', async (req, res) => {
    try {
        const agentTypes = {
            'orchestrator': {
                name: 'Research Orchestrator',
                description: 'Coordinates and manages specialized research agents',
                capabilities: ['Research planning', 'Agent coordination', 'Result synthesis'],
                estimatedTime: '5-10 minutes',
                dependencies: []
            },
            'source_discovery': {
                name: 'Source Discovery Agent',
                description: 'Finds and evaluates relevant sources across collections',
                capabilities: ['Multi-collection search', 'Source quality assessment', 'Bibliography creation'],
                estimatedTime: '5-15 minutes',
                dependencies: []
            },
            'content_analysis': {
                name: 'Content Analysis Agent',
                description: 'Performs deep analysis of content using various analytical frameworks',
                capabilities: ['Theme extraction', 'Insight generation', 'Pattern recognition'],
                estimatedTime: '10-25 minutes',
                dependencies: ['source_discovery']
            },
            'synthesis': {
                name: 'Synthesis Agent',
                description: 'Creates coherent narratives by connecting insights across sources',
                capabilities: ['Cross-source synthesis', 'Narrative creation', 'Conflict resolution'],
                estimatedTime: '15-30 minutes',
                dependencies: ['source_discovery', 'content_analysis'],
                available: false // Not yet implemented
            },
            'fact_checking': {
                name: 'Fact-Checking Agent',
                description: 'Verifies statements and assigns confidence scores',
                capabilities: ['Statement verification', 'Confidence scoring', 'Source validation'],
                estimatedTime: '5-20 minutes',
                dependencies: ['synthesis'],
                available: false // Not yet implemented
            }
        };
        
        res.json({
            success: true,
            data: agentTypes
        });
    } catch (error) {
        console.error('❌ Error getting agent types:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve agent types'
        });
    }
});

router.get('/research-templates', async (req, res) => {
    try {
        const templates = [
            {
                id: 'academic_research',
                name: 'Academic Research',
                description: 'Comprehensive academic research with citations and literature review',
                agentTypes: ['orchestrator'],
                outputFormat: 'academic_paper',
                estimatedDuration: 45, // minutes
                defaultSettings: {
                    detailLevel: 'high',
                    qualityThreshold: 0.7,
                    maxSources: 30,
                    analysisFrameworks: ['thematic', 'conceptual', 'structural'],
                    sections: ['abstract', 'introduction', 'literature_review', 'analysis', 'conclusion']
                }
            },
            {
                id: 'market_research',
                name: 'Market Research',
                description: 'Business-focused market analysis and competitive intelligence',
                agentTypes: ['orchestrator'],
                outputFormat: 'business_report',
                estimatedDuration: 30, // minutes
                defaultSettings: {
                    detailLevel: 'medium',
                    qualityThreshold: 0.6,
                    maxSources: 25,
                    analysisFrameworks: ['thematic', 'sentiment', 'temporal'],
                    sections: ['executive_summary', 'market_overview', 'competitive_landscape', 'recommendations']
                }
            },
            {
                id: 'technical_analysis',
                name: 'Technical Analysis',
                description: 'In-depth technical analysis and documentation',
                agentTypes: ['orchestrator'],
                outputFormat: 'technical_doc',
                estimatedDuration: 35, // minutes
                defaultSettings: {
                    detailLevel: 'high',
                    qualityThreshold: 0.7,
                    maxSources: 20,
                    analysisFrameworks: ['thematic', 'structural', 'conceptual'],
                    sections: ['overview', 'technical_details', 'implementation_guide', 'examples']
                }
            },
            {
                id: 'quick_overview',
                name: 'Quick Overview',
                description: 'Fast overview of a topic with key insights',
                agentTypes: ['orchestrator'],
                outputFormat: 'summary_report',
                estimatedDuration: 15, // minutes
                defaultSettings: {
                    detailLevel: 'low',
                    qualityThreshold: 0.5,
                    maxSources: 15,
                    analysisFrameworks: ['thematic', 'sentiment'],
                    sections: ['summary', 'key_points', 'insights']
                }
            }
        ];
        
        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        console.error('❌ Error getting research templates:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve research templates'
        });
    }
});

// Session statistics
router.get('/sessions/:sessionId/stats', async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;
        
        // Verify user has access to session
        const session = await agentService.getSession(sessionId, userId);
        const artifacts = await agentService.getSessionArtifacts(sessionId, userId);
        
        // Calculate basic statistics
        const stats = {
            session: {
                id: sessionId,
                status: session.status,
                duration: session.completed_at ? 
                    new Date(session.completed_at) - new Date(session.created_at) : 
                    Date.now() - new Date(session.created_at),
                createdAt: session.created_at,
                completedAt: session.completed_at
            },
            artifacts: {
                total: artifacts.length,
                byType: artifacts.reduce((acc, a) => {
                    acc[a.artifact_type] = (acc[a.artifact_type] || 0) + 1;
                    return acc;
                }, {}),
                byStatus: artifacts.reduce((acc, a) => {
                    acc[a.status] = (acc[a.status] || 0) + 1;
                    return acc;
                }, {})
            },
            preferences: agentService.parsePreferences(session.preferences)
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error(`❌ Error getting session stats ${req.params.sessionId}:`, error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ 
                success: false, 
                message: 'Session not found or access denied'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to retrieve session statistics'
            });
        }
    }
});

// Health check for agent system
router.get('/health', async (req, res) => {
    try {
        // Basic health check - could be expanded to check database, etc.
        res.json({
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date(),
                version: '1.0.0',
                features: {
                    agentTypes: ['orchestrator', 'source_discovery', 'content_analysis'],
                    templates: 4,
                    database: 'connected'
                }
            }
        });
    } catch (error) {
        console.error('❌ Agent health check failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Agent system health check failed'
        });
    }
});

// Helper function to generate human-readable titles for results
function generateResultTitle(artifact) {
    const typeMap = {
        'source_evaluation': 'Source Discovery Report',
        'source_bibliography': 'Source Bibliography',
        'source_distribution_analysis': 'Source Distribution Analysis', 
        'thematic_analysis': 'Thematic Analysis',
        'sentiment_analysis': 'Sentiment Analysis',
        'research_narrative': 'Research Narrative',
        'synthesis_report': 'Research Synthesis',
        'fact_verification': 'Fact Verification Report',
        'research_summary': 'Final Research Summary'
    };
    
    return typeMap[artifact.artifact_type] || `${artifact.artifact_type} Report`;
}

module.exports = router;
