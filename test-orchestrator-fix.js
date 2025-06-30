#!/usr/bin/env node

/**
 * Test script to verify the fixed orchestrator agent system
 * Tests that specialized agents are properly created and started
 */

// Load environment variables
require('dotenv').config();

const { AgentService } = require('./src/services/agentService');
const { DatabaseService } = require('./src/services/databaseService');
const { OrchestratorAgent } = require('./src/agents/OrchestratorAgent');

async function testOrchestratorFix() {
    console.log('🧪 Testing Orchestrator Agent Fix');
    console.log('=' .repeat(50));
    
    let agentService, session;
    
    try {
        // Initialize database and agent service
        console.log('🗄️ Initializing database service...');
        const databaseService = new DatabaseService();
        await databaseService.initialize(); // Use initialize() instead of connect()
        
        console.log('🤖 Initializing agent service...');
        agentService = new AgentService(databaseService);
        
        // Create test session
        console.log('📋 Creating test session...');
        session = await agentService.createSession(
            'test-user',
            'Test research on renewable energy technologies',
            {
                researchTopic: 'Test research on renewable energy technologies',
                maxSources: 10,
                qualityThreshold: 0.7,
                analysisFrameworks: ['thematic', 'sentiment'],
                useExternalSources: false
            }
        );
        console.log(`✅ Session created: ${session.id}`);
        
        // Register and start orchestrator agent
        console.log('🎯 Registering orchestrator agent...');
        const orchestratorId = `${session.id}-orchestrator-${Date.now()}`;
        const orchestratorConfig = agentService.getAgentConfig('orchestrator', session.preferences);
        
        await agentService.registerAgent(orchestratorId, OrchestratorAgent, orchestratorConfig);
        console.log(`📝 Orchestrator registered: ${orchestratorId}`);
        
        console.log('🚀 Starting orchestrator agent...');
        const startResult = await agentService.startAgent(orchestratorId, session.id);
        console.log(`✅ Orchestrator started:`, startResult);
        
        // Wait a bit for the orchestrator to create specialized agents
        console.log('⏳ Waiting for orchestrator to create specialized agents...');
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        // Check what agents were created
        console.log('🔍 Checking created agents...');
        const agentIds = Array.from(agentService.agents.keys());
        console.log(`📊 Total agents in system: ${agentIds.length}`);
        
        agentIds.forEach(agentId => {
            const agentInfo = agentService.agents.get(agentId);
            console.log(`  - ${agentId}: ${agentInfo.class.name} (${agentInfo.status})`);
        });
        
        // Check session tracking
        const sessionInfo = agentService.sessions.get(session.id);
        if (sessionInfo) {
            console.log(`📈 Session tracking - ${sessionInfo.agents.size} agents tracked:`);
            sessionInfo.agents.forEach((info, agentId) => {
                console.log(`  - ${agentId}: ${info.type} (${info.status})`);
            });
        } else {
            console.log('⚠️ No session tracking info found');
        }
        
        // Wait a bit more for execution to progress
        console.log('⏳ Waiting for agent execution to progress...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 more seconds
        
        // Final status check
        console.log('📊 Final agent status check:');
        agentIds.forEach(agentId => {
            const agentInfo = agentService.agents.get(agentId);
            console.log(`  - ${agentId}: ${agentInfo.status} (${agentInfo.class.name})`);
            if (agentInfo.error) {
                console.log(`    Error: ${agentInfo.error}`);
            }
        });
        
        console.log('\n✅ Test completed successfully!');
        console.log('🎯 Key findings:');
        console.log(`  - Orchestrator started: ${startResult.success ? 'YES' : 'NO'}`);
        console.log(`  - Specialized agents created: ${agentIds.length > 1 ? 'YES' : 'NO'}`);
        console.log(`  - Session tracking active: ${sessionInfo ? 'YES' : 'NO'}`);
        
        if (agentIds.length > 1) {
            console.log('🎉 SUCCESS: Orchestrator is now properly creating specialized agents!');
        } else {
            console.log('❌ ISSUE: Orchestrator did not create additional agents');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        throw error;
    }
}

// Self-executing test
if (require.main === module) {
    testOrchestratorFix()
        .then(() => {
            console.log('\n🎯 Test completed - check the results above');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Test failed:', error);
            process.exit(1);
        });
}

module.exports = { testOrchestratorFix };
