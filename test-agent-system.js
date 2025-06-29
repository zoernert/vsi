#!/usr/bin/env node

/**
 * VSI Agent System Test Script
 * 
 * This script demonstrates the basic functionality of the VSI Agent System:
 * 1. Creates a research session
 * 2. Registers and starts specialized agents
 * 3. Shows agent communication and task execution
 * 4. Displays generated artifacts
 */

// Load environment variables
require('dotenv').config();

const jwt = require('jsonwebtoken');
const { AgentService } = require('./src/services/agentService');
const { OrchestratorAgent } = require('./src/agents/OrchestratorAgent');
const { SourceDiscoveryAgent } = require('./src/agents/SourceDiscoveryAgent');
const { ContentAnalysisAgent } = require('./src/agents/ContentAnalysisAgent');

/**
 * Generate a JWT token for testing purposes
 */
function generateTestToken(userId, username) {
    return jwt.sign(
        { 
            id: userId,  // Should be 'id', not 'userId'
            username: username, 
            isAdmin: false
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

async function testAgentSystem() {
    console.log('🚀 Starting VSI Agent System Test\n');
    
    const agentService = new AgentService();
    
    try {
        // Generate JWT token for user authentication
        const userId = 2; // stromdao user
        const username = 'stromdao';
        const userToken = generateTestToken(userId, username);
        console.log('🔑 Generated authentication token for testing\n');
        
        // 1. Create a research session
        console.log('📝 Creating research session...');
        const session = await agentService.createSession(
            userId,
            'AI and Machine Learning in Healthcare',
            {
                maxSources: 20,
                analysisFrameworks: ['thematic', 'sentiment', 'trend'],
                outputFormat: 'comprehensive_report',
                priority: 'thorough'
            }
        );
        console.log(`✅ Session created: ${session.id}`);
        console.log(`   Topic: ${session.research_topic}\n`);

        // 2. Register specialized agents
        console.log('🤖 Registering specialized agents...');
        
        // Register Orchestrator Agent
        const orchestratorId = `${session.id}-orchestrator`;
        await agentService.registerAgent(orchestratorId, OrchestratorAgent, {
            agentType: 'orchestrator',
            preferences: {
                researchTopic: session.research_topic,
                strategy: 'comprehensive'
            },
            timeout: 30000,
            maxRetries: 3,
            query: session.research_topic,
            inputs: {
                query: session.research_topic,
                collections: null
            }
        });
        console.log(`✅ Orchestrator agent registered: ${orchestratorId}`);

        // Register Source Discovery Agent
        const sourceAgentId = `${session.id}-source-discovery`;
        await agentService.registerAgent(sourceAgentId, SourceDiscoveryAgent, {
            agentType: 'source_discovery',
            preferences: {
                researchTopic: session.research_topic,
                maxSources: 20,
                qualityThreshold: 0.7
            },
            timeout: 30000,
            maxRetries: 3,
            query: session.research_topic,
            inputs: {
                query: session.research_topic,
                collections: null
            },
            maxSources: 20,
            qualityThreshold: 0.7
        });
        console.log(`✅ Source Discovery agent registered: ${sourceAgentId}`);

        // Register Content Analysis Agent
        const analysisAgentId = `${session.id}-content-analysis`;
        await agentService.registerAgent(analysisAgentId, ContentAnalysisAgent, {
            agentType: 'content_analysis',
            preferences: {
                researchTopic: session.research_topic,
                analysisFrameworks: ['thematic', 'sentiment'],
                depth: 'detailed'
            },
            timeout: 30000,
            maxRetries: 3,
            query: session.research_topic,
            inputs: {
                query: session.research_topic,
                collections: null
            },
            frameworks: ['thematic', 'sentiment'],
            maxContextSize: 4000
        });
        console.log(`✅ Content Analysis agent registered: ${analysisAgentId}\n`);

        // 3. Start the orchestrator (it will coordinate other agents)
        console.log('🎬 Starting orchestrator agent...');
        await agentService.startAgent(orchestratorId, session.id, userToken);
        console.log(`✅ Orchestrator started and running\n`);

        // 4. Monitor progress for a brief period
        console.log('📊 Monitoring agent progress...');
        
        // Set up event listeners
        agentService.on('agent_started', (event) => {
            console.log(`🟢 Agent started: ${event.agentId} (${event.type})`);
        });
        
        agentService.on('agent_completed', (event) => {
            console.log(`✅ Agent completed: ${event.agentId}`);
        });
        
        agentService.on('agent_error', (event) => {
            console.log(`❌ Agent error: ${event.agentId} - ${event.error}`);
        });

        // Wait a bit to see some activity
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 5. Check session progress
        console.log('\n📈 Checking session progress...');
        const progress = await agentService.getSessionProgress(session.id);
        console.log(`Progress: ${progress.overall}%`);
        console.log(`Active agents: ${progress.agents.length}`);

        // 6. Check for artifacts
        console.log('\n📄 Checking for generated artifacts...');
        const artifacts = await agentService.getSessionArtifacts(session.id);
        console.log(`Total artifacts: ${artifacts.length}`);
        
        artifacts.forEach((artifact, index) => {
            console.log(`${index + 1}. ${artifact.artifact_type} by ${artifact.agent_id}`);
            console.log(`   Created: ${artifact.created_at}`);
            if (artifact.content && Object.keys(artifact.content).length > 0) {
                console.log(`   Content keys: ${Object.keys(artifact.content).join(', ')}`);
            }
        });

        // 7. Demonstrate agent communication
        console.log('\n💬 Testing agent communication...');
        await agentService.sendMessage(orchestratorId, sourceAgentId, {
            type: 'task_assignment',
            sessionId: session.id,
            data: {
                task: 'prioritize_medical_journals',
                parameters: {
                    focus: 'peer_reviewed',
                    recency: '2_years'
                }
            }
        });
        console.log('✅ Message sent from orchestrator to source discovery agent');

        // 8. Show session summary
        console.log('\n📋 Session Summary:');
        const updatedSession = await agentService.getSession(session.id);
        console.log(`Session ID: ${updatedSession.id}`);
        console.log(`Status: ${updatedSession.status}`);
        console.log(`Research Topic: ${updatedSession.research_topic}`);
        console.log(`Created: ${updatedSession.created_at}`);
        console.log(`Last Updated: ${updatedSession.updated_at}`);

        console.log('\n🎉 Agent system test completed successfully!');
        console.log('\n📝 What happened:');
        console.log('   • Created a research session with AI/ML healthcare topic');
        console.log('   • Registered 3 specialized agents (Orchestrator, Source Discovery, Content Analysis)');
        console.log('   • Started the orchestrator which began coordinating the research');
        console.log('   • Demonstrated inter-agent communication');
        console.log('   • Showed progress tracking and artifact generation');
        console.log('\n🔄 The agents are now running autonomously and will:');
        console.log('   • Discover relevant sources across collections');
        console.log('   • Analyze content using smart context capabilities');
        console.log('   • Generate structured research artifacts');
        console.log('   • Communicate findings between agents');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping test...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, stopping test...');
    process.exit(0);
});

// Run the test
if (require.main === module) {
    testAgentSystem().catch(error => {
        console.error('❌ Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { testAgentSystem };
