#!/usr/bin/env node

/**
 * VSI Agent System CLI
 * 
 * Command-line interface for managing the VSI Agent System
 * 
 * Usage:
 *   node agent-cli.js create-session "Research Topic" [options]
 *   node agent-cli.js start-agents <session-id> [agent-types]
 *   node agent-cli.js session-status <session-id>
 *   node agent-cli.js list-sessions [user-id]
 *   node agent-cli.js stop-session <session-id>
 *   node agent-cli.js artifacts <session-id>
 */

const { AgentService } = require('./src/services/agentService');
const { program } = require('commander');

const agentService = new AgentService();

program
    .name('agent-cli')
    .description('VSI Agent System Command Line Interface')
    .version('1.0.0');

// Create a new research session
program
    .command('create-session')
    .description('Create a new research session')
    .argument('<topic>', 'Research topic')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .option('-s, --sources <number>', 'Maximum sources', '50')
    .option('-f, --frameworks <list>', 'Analysis frameworks (comma-separated)', 'thematic,sentiment')
    .option('-o, --output <format>', 'Output format', 'comprehensive_report')
    .action(async (topic, options) => {
        try {
            console.log(`🚀 Creating research session for: "${topic}"`);
            
            const preferences = {
                maxSources: parseInt(options.sources),
                analysisFrameworks: options.frameworks.split(','),
                outputFormat: options.output
            };
            
            const session = await agentService.createSession(options.user, topic, preferences);
            
            console.log(`✅ Session created successfully!`);
            console.log(`📋 Session ID: ${session.id}`);
            console.log(`👤 User: ${session.user_id}`);
            console.log(`📊 Status: ${session.status}`);
            console.log(`⏰ Created: ${session.created_at}`);
            console.log(`\n💡 Next steps:`);
            console.log(`   Start agents: node agent-cli.js start-agents ${session.id} orchestrator,source_discovery,content_analysis`);
            console.log(`   Check status: node agent-cli.js session-status ${session.id}`);
        } catch (error) {
            console.error('❌ Failed to create session:', error.message);
            process.exit(1);
        }
    });

// Start agents for a session
program
    .command('start-agents')
    .description('Start agents for a research session')
    .argument('<session-id>', 'Session ID')
    .argument('[agent-types]', 'Comma-separated list of agent types', 'orchestrator')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .action(async (sessionId, agentTypesStr, options) => {
        try {
            const agentTypes = agentTypesStr.split(',').map(t => t.trim());
            
            console.log(`🤖 Starting agents for session: ${sessionId}`);
            console.log(`📝 Agent types: ${agentTypes.join(', ')}`);
            
            const result = await agentService.startAgents(sessionId, options.user, agentTypes);
            
            console.log(`✅ Agents started successfully!`);
            result.agents.forEach(agent => {
                console.log(`   🟢 ${agent.type}: ${agent.agentId} (${agent.status})`);
            });
            
            console.log(`\n💡 Monitor progress:`);
            console.log(`   node agent-cli.js session-status ${sessionId}`);
        } catch (error) {
            console.error('❌ Failed to start agents:', error.message);
            process.exit(1);
        }
    });

// Check session status
program
    .command('session-status')
    .description('Check the status of a research session')
    .argument('<session-id>', 'Session ID')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .action(async (sessionId, options) => {
        try {
            console.log(`📊 Checking status for session: ${sessionId}`);
            
            const session = await agentService.getSession(sessionId, options.user);
            const progress = await agentService.getSessionProgress(sessionId, options.user);
            const artifacts = await agentService.getSessionArtifacts(sessionId, options.user);
            
            console.log(`\n📋 Session Information:`);
            console.log(`   ID: ${session.id}`);
            console.log(`   Topic: ${session.research_topic}`);
            console.log(`   Status: ${session.status}`);
            console.log(`   Created: ${session.created_at}`);
            console.log(`   Updated: ${session.updated_at}`);
            
            console.log(`\n📈 Progress:`);
            console.log(`   Overall: ${progress.overall}%`);
            console.log(`   Active Agents: ${progress.agents?.length || 0}`);
            
            if (progress.agents && progress.agents.length > 0) {
                console.log(`\n🤖 Agent Status:`);
                progress.agents.forEach(agent => {
                    console.log(`   ${agent.type}: ${agent.status} (${agent.progress}%)`);
                });
            }
            
            console.log(`\n📄 Artifacts: ${artifacts.length}`);
            artifacts.forEach((artifact, index) => {
                console.log(`   ${index + 1}. ${artifact.artifact_type} (${artifact.agent_id})`);
                console.log(`      Created: ${artifact.created_at}`);
                if (artifact.metadata.summary) {
                    console.log(`      Summary: ${artifact.metadata.summary}`);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to get session status:', error.message);
            process.exit(1);
        }
    });

// List all sessions for a user
program
    .command('list-sessions')
    .description('List all research sessions for a user')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .action(async (options) => {
        try {
            console.log(`📋 Listing sessions for user: ${options.user}`);
            
            const sessions = await agentService.getUserSessions(options.user);
            
            if (sessions.length === 0) {
                console.log(`📭 No sessions found for user: ${options.user}`);
                return;
            }
            
            console.log(`\n📊 Found ${sessions.length} session(s):`);
            sessions.forEach((session, index) => {
                console.log(`\n${index + 1}. ${session.id}`);
                console.log(`   Topic: ${session.research_topic}`);
                console.log(`   Status: ${session.status}`);
                console.log(`   Created: ${session.created_at}`);
                console.log(`   Updated: ${session.updated_at}`);
            });
            
        } catch (error) {
            console.error('❌ Failed to list sessions:', error.message);
            process.exit(1);
        }
    });

// Stop a session
program
    .command('stop-session')
    .description('Stop all agents in a research session')
    .argument('<session-id>', 'Session ID')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .action(async (sessionId, options) => {
        try {
            console.log(`🛑 Stopping session: ${sessionId}`);
            
            await agentService.stopSession(sessionId, options.user);
            
            console.log(`✅ Session stopped successfully!`);
            console.log(`   All agents have been stopped`);
            console.log(`   Session status updated to 'stopped'`);
            
        } catch (error) {
            console.error('❌ Failed to stop session:', error.message);
            process.exit(1);
        }
    });

// Pause a session
program
    .command('pause-session')
    .description('Pause all agents in a research session')
    .argument('<session-id>', 'Session ID')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .action(async (sessionId, options) => {
        try {
            console.log(`⏸️ Pausing session: ${sessionId}`);
            
            await agentService.pauseSession(sessionId, options.user);
            
            console.log(`✅ Session paused successfully!`);
            console.log(`   All running agents have been paused`);
            console.log(`   Session status updated to 'paused'`);
            
        } catch (error) {
            console.error('❌ Failed to pause session:', error.message);
            process.exit(1);
        }
    });

// Get session artifacts
program
    .command('artifacts')
    .description('List artifacts generated by a research session')
    .argument('<session-id>', 'Session ID')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .option('-t, --type <type>', 'Filter by artifact type')
    .option('-d, --detailed', 'Show detailed content')
    .action(async (sessionId, options) => {
        try {
            console.log(`📄 Getting artifacts for session: ${sessionId}`);
            
            let artifacts = await agentService.getSessionArtifacts(sessionId, options.user);
            
            if (options.type) {
                artifacts = artifacts.filter(a => a.artifact_type === options.type);
            }
            
            if (artifacts.length === 0) {
                console.log(`📭 No artifacts found for session: ${sessionId}`);
                return;
            }
            
            console.log(`\n📊 Found ${artifacts.length} artifact(s):`);
            artifacts.forEach((artifact, index) => {
                console.log(`\n${index + 1}. ${artifact.artifact_type}`);
                console.log(`   ID: ${artifact.id}`);
                console.log(`   Agent: ${artifact.agent_id}`);
                console.log(`   Created: ${artifact.created_at}`);
                console.log(`   Status: ${artifact.status}`);
                
                if (artifact.metadata.summary) {
                    console.log(`   Summary: ${artifact.metadata.summary}`);
                }
                
                if (options.detailed && artifact.content) {
                    console.log(`   Content Preview:`);
                    const contentStr = JSON.stringify(artifact.content, null, 2);
                    const preview = contentStr.length > 500 
                        ? contentStr.substring(0, 500) + '...'
                        : contentStr;
                    console.log(`      ${preview}`);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to get artifacts:', error.message);
            process.exit(1);
        }
    });

// Provide feedback
program
    .command('feedback')
    .description('Provide feedback on a session or artifact')
    .argument('<session-id>', 'Session ID')
    .option('-u, --user <user-id>', 'User ID', 'default-user')
    .option('-a, --agent <agent-id>', 'Specific agent ID')
    .option('-r, --artifact <artifact-id>', 'Specific artifact ID')
    .option('-t, --type <type>', 'Feedback type', 'general')
    .option('-p, --priority <priority>', 'Priority level', 'medium')
    .option('-m, --message <message>', 'Feedback message', 'No message provided')
    .action(async (sessionId, options) => {
        try {
            console.log(`💬 Providing feedback for session: ${sessionId}`);
            
            const feedbackData = {
                agentId: options.agent,
                artifactId: options.artifact,
                type: options.type,
                priority: options.priority,
                feedback: {
                    message: options.message,
                    timestamp: new Date().toISOString()
                }
            };
            
            const result = await agentService.provideFeedback(sessionId, options.user, feedbackData);
            
            console.log(`✅ Feedback submitted successfully!`);
            console.log(`   Feedback ID: ${result.feedbackId}`);
            console.log(`   Type: ${feedbackData.type}`);
            console.log(`   Priority: ${feedbackData.priority}`);
            
        } catch (error) {
            console.error('❌ Failed to provide feedback:', error.message);
            process.exit(1);
        }
    });

// Interactive mode
program
    .command('interactive')
    .description('Start interactive agent management session')
    .action(async () => {
        console.log('🚀 VSI Agent System - Interactive Mode');
        console.log('=====================================\n');
        
        // This would implement an interactive CLI
        // For now, show available commands
        console.log('Available commands:');
        console.log('  create-session   - Create a new research session');
        console.log('  start-agents     - Start agents for a session');
        console.log('  session-status   - Check session status');
        console.log('  list-sessions    - List all sessions');
        console.log('  stop-session     - Stop a session');
        console.log('  pause-session    - Pause a session');
        console.log('  artifacts        - View session artifacts');
        console.log('  feedback         - Provide feedback');
        console.log('\nFor detailed help on any command, use: node agent-cli.js <command> --help');
    });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
