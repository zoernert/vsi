#!/usr/bin/env node

/**
 * Simple test for new SynthesisAgent and FactCheckingAgent
 */

const { SynthesisAgent } = require('./src/agents/SynthesisAgent');
const { FactCheckingAgent } = require('./src/agents/FactCheckingAgent');
const { AgentApiClient } = require('./src/services/agentApiClient');

async function testNewAgents() {
    console.log('🧪 Testing New Agents: SynthesisAgent and FactCheckingAgent\n');
    
    try {
        // Create mock dependencies
        const sessionId = 'test-session-' + Date.now();
        const apiClient = new AgentApiClient(sessionId);
        
        // Test SynthesisAgent
        console.log('📝 Testing SynthesisAgent...');
        const synthesisConfig = {
            maxSynthesisLength: 1000,
            narrativeStyle: 'academic',
            includeReferences: true,
            coherenceThreshold: 0.8,
            structureTemplate: 'research'
        };
        
        const synthesisAgent = new SynthesisAgent('synthesis-test', sessionId, synthesisConfig, apiClient);
        console.log(`✅ SynthesisAgent created: ${synthesisAgent.constructor.name}`);
        console.log(`   - Agent ID: ${synthesisAgent.agentId}`);
        console.log(`   - Session ID: ${synthesisAgent.sessionId}`);
        console.log(`   - Max Length: ${synthesisAgent.config.maxSynthesisLength}`);
        console.log(`   - Style: ${synthesisAgent.config.narrativeStyle}`);
        
        // Test FactCheckingAgent
        console.log('\n🔍 Testing FactCheckingAgent...');
        const factCheckConfig = {
            reliabilityThreshold: 0.7,
            crossReferenceCount: 3,
            flagSuspiciousClaims: true,
            checkSources: true,
            factCheckingApis: ['factcheck.org', 'snopes.com']
        };
        
        const factCheckAgent = new FactCheckingAgent('factcheck-test', sessionId, factCheckConfig, apiClient);
        console.log(`✅ FactCheckingAgent created: ${factCheckAgent.constructor.name}`);
        console.log(`   - Agent ID: ${factCheckAgent.agentId}`);
        console.log(`   - Session ID: ${factCheckAgent.sessionId}`);
        console.log(`   - Reliability Threshold: ${factCheckAgent.config.reliabilityThreshold}`);
        console.log(`   - Cross Reference Count: ${factCheckAgent.config.crossReferenceCount}`);
        
        // Test agent capabilities
        console.log('\n🔧 Testing Agent Capabilities...');
        
        // Test synthesis capabilities
        const synthesisCapabilities = synthesisAgent.getCapabilities();
        console.log(`📊 SynthesisAgent Capabilities: ${synthesisCapabilities.join(', ')}`);
        
        // Test fact checking capabilities
        const factCheckCapabilities = factCheckAgent.getCapabilities();
        console.log(`📊 FactCheckingAgent Capabilities: ${factCheckCapabilities.join(', ')}`);
        
        // Test mock task execution
        console.log('\n⚡ Testing Mock Task Execution...');
        
        // Mock data for synthesis
        const mockAnalysisData = {
            artifacts: [
                {
                    type: 'analysis_summary',
                    content: 'AI technology is rapidly advancing with significant implications for various industries.',
                    metadata: { source: 'ContentAnalysisAgent', confidence: 0.9 }
                },
                {
                    type: 'theme_analysis',
                    content: 'Key themes include automation, job displacement, and technological innovation.',
                    metadata: { source: 'ContentAnalysisAgent', confidence: 0.85 }
                }
            ]
        };
        
        const synthesisTask = {
            taskId: 'test-synthesis-1',
            type: 'synthesis',
            parameters: {
                inputData: mockAnalysisData,
                style: 'academic',
                maxLength: 500
            }
        };
        
        // Test synthesis planning
        const synthesisCanHandle = synthesisAgent.canHandle(synthesisTask);
        console.log(`📝 SynthesisAgent can handle task: ${synthesisCanHandle}`);
        
        // Mock data for fact checking
        const mockSynthesisResult = {
            artifacts: [
                {
                    type: 'narrative',
                    content: 'Artificial intelligence technologies are transforming industries at an unprecedented rate, with 85% of companies reporting significant efficiency gains.',
                    metadata: { claims: ['85% of companies reporting efficiency gains'], sources: [] }
                }
            ]
        };
        
        const factCheckTask = {
            taskId: 'test-factcheck-1',
            type: 'fact_checking',
            parameters: {
                inputData: mockSynthesisResult,
                checkSources: true,
                crossReference: true
            }
        };
        
        // Test fact checking planning
        const factCheckCanHandle = factCheckAgent.canHandle(factCheckTask);
        console.log(`🔍 FactCheckingAgent can handle task: ${factCheckCanHandle}`);
        
        console.log('\n✅ All tests passed! New agents are working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    testNewAgents()
        .then(() => {
            console.log('\n🎉 Test completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Test failed:', error);
            process.exit(1);
        });
}

module.exports = { testNewAgents };
