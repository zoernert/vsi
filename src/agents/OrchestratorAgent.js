const { BaseAgent } = require('./BaseAgent');
const { GeminiService } = require('../services/geminiService');

class OrchestratorAgent extends BaseAgent {
    constructor(agentId, sessionId, config, apiClient, databaseService = null) {
        super(agentId, sessionId, config, apiClient, databaseService);
        this.geminiService = new GeminiService();
        this.researchPlan = null;
        this.specializedAgents = new Map();
        this.agentDependencies = new Map();
        this.completionStatus = new Map();
    }

    async performWork() {
        console.log(`🎯 Starting orchestration for research topic: ${this.config.preferences.researchTopic || 'Unknown'}`);
        
        this.updateProgress(10, 'Analyzing research scope');
        await this.analyzeResearchScope();
        
        this.updateProgress(30, 'Creating research plan');
        await this.createResearchPlan();
        
        this.updateProgress(50, 'Assigning specialized agents');
        await this.assignSpecializedAgents();
        
        this.updateProgress(70, 'Monitoring agent progress');
        await this.monitorAgentProgress();
        
        this.updateProgress(90, 'Finalizing research');
        await this.finalizeResearch();
        
        this.updateProgress(100, 'Research orchestration completed');
    }

    async analyzeResearchScope() {
        try {
            console.log(`🔍 Analyzing research scope for: ${this.config.preferences.researchTopic}`);
            
            // Get all available collections
            const collectionsResponse = await this.httpClient.get('/api/collections');
            // The collections API returns a raw array, not a wrapped response
            const collections = Array.isArray(collectionsResponse.data) ? collectionsResponse.data : [];
            console.log(`📚 Found ${collections.length} available collections`);
            
            // Find relevant collections using search across all collections
            const relevantCollections = await this.findRelevantCollections(this.config.preferences.researchTopic, collections);
            
            // Generate initial context across relevant collections
            const contexts = [];
            for (const collection of relevantCollections) {
                try {
                    const contextResponse = await this.generateSmartContext(
                        collection.id,
                        this.config.preferences.researchTopic,
                        {
                            maxContextSize: 2000,
                            strategy: 'relevance'
                        }
                    );
                    
                    if (contextResponse.success) {
                        contexts.push({
                            collection: collection,
                            context: contextResponse.data
                        });
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to generate context for collection ${collection.name}:`, error.message);
                }
            }
            
            const researchScope = {
                totalCollections: collections.length,
                relevantCollections: relevantCollections,
                contexts: contexts,
                complexity: this.assessComplexity(relevantCollections, contexts),
                estimatedDuration: this.estimateDuration(relevantCollections, contexts)
            };
            
            await this.storeMemory('research_scope', researchScope);
            console.log(`✅ Research scope analyzed: ${relevantCollections.length} relevant collections found`);
            
            return researchScope;
        } catch (error) {
            console.error(`❌ Error analyzing research scope:`, error);
            throw error;
        }
    }

    async findRelevantCollections(researchTopic, collections) {
        const relevantCollections = [];
        const minRelevanceScore = 0.3; // Threshold for relevance
        
        for (const collection of collections) {
            try {
                // Perform a search to assess relevance
                const searchResponse = await this.httpClient.post(
                    `/api/collections/${collection.id}/search`,
                    { 
                        query: researchTopic,
                        limit: 5
                    }
                );
                
                if (searchResponse.data.success && searchResponse.data.data) {
                    // Handle both formats: { data: { results: [...] } } and { data: [...] }
                    let results = searchResponse.data.data;
                    if (results.results) {
                        results = results.results;
                    }
                    const relevanceScore = this.calculateCollectionRelevance(results, researchTopic);
                    
                    if (relevanceScore >= minRelevanceScore) {
                        relevantCollections.push({
                            ...collection,
                            relevanceScore,
                            sampleResults: results.slice(0, 3) // Keep top 3 results as samples
                        });
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Error assessing relevance for collection ${collection.name}:`, error.message);
            }
        }
        
        // Sort by relevance score (highest first)
        return relevantCollections.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    calculateCollectionRelevance(searchResults, researchTopic) {
        if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
            return 0;
        }
        
        // Simple relevance calculation based on:
        // 1. Number of results
        // 2. Average score of top results
        // 3. Content similarity to research topic
        
        const resultCount = searchResults.length;
        const avgScore = searchResults.reduce((sum, result) => sum + (result.score || result.similarity || 0), 0) / resultCount;
        const topicKeywords = researchTopic.toLowerCase().split(/\s+/);
        
        let contentRelevance = 0;
        for (const result of searchResults.slice(0, 3)) { // Check top 3 results
            const content = (result.content || result.contentPreview || '').toLowerCase();
            const matchingKeywords = topicKeywords.filter(keyword => content.includes(keyword));
            contentRelevance += matchingKeywords.length / topicKeywords.length;
        }
        contentRelevance /= Math.min(3, resultCount);
        
        // Weighted combination
        return (avgScore * 0.4) + (contentRelevance * 0.4) + (Math.min(resultCount / 10, 1) * 0.2);
    }

    assessComplexity(relevantCollections, contexts) {
        // Assess research complexity based on:
        // 1. Number of relevant collections
        // 2. Diversity of content
        // 3. Volume of information
        
        const collectionCount = relevantCollections.length;
        const contextCount = contexts.length;
        const avgContextSize = contextCount > 0 ? 
            contexts.reduce((sum, ctx) => sum + (ctx.context?.length || 0), 0) / contextCount : 0;
        
        if (collectionCount <= 2 && avgContextSize < 1000) {
            return 'low';
        } else if (collectionCount <= 5 && avgContextSize < 3000) {
            return 'medium';
        } else {
            return 'high';
        }
    }

    estimateDuration(relevantCollections, contexts) {
        // Estimate research duration in minutes
        const baseTime = 10; // Base 10 minutes
        const collectionTime = relevantCollections.length * 5; // 5 minutes per collection
        const complexityMultiplier = contexts.length > 5 ? 1.5 : 1.0;
        
        return Math.ceil((baseTime + collectionTime) * complexityMultiplier);
    }

    async createResearchPlan() {
        try {
            console.log(`📋 Creating research plan`);
            
            const scope = await this.retrieveMemory('research_scope');
            console.log(`🔧 Retrieved scope from memory:`, scope);
            if (!scope) {
                throw new Error('Research scope not found in memory');
            }
            
            // Generate structured research plan
            const plan = await this.generateResearchPlan(scope);
            
            // Create task dependencies based on plan
            const taskPlan = this.createTaskPlan(plan, scope);
            
            await this.storeMemory('research_plan', plan);
            await this.storeMemory('task_plan', taskPlan);
            
            console.log(`✅ Research plan created with ${taskPlan.tasks.length} tasks`);
            return plan;
        } catch (error) {
            console.error(`❌ Error creating research plan:`, error);
            throw error;
        }
    }

    async generateResearchPlan(scope) {
        console.log(`🔧 Generating research plan with scope:`, JSON.stringify(scope, null, 2));
        
        // Ensure estimatedDuration exists, calculate it if missing
        const estimatedDuration = scope.estimatedDuration || this.estimateDuration(scope.relevantCollections || [], scope.contexts || []);
        
        // Create a structured research plan based on the scope
        const plan = {
            id: `plan_${this.sessionId}`,
            researchTopic: this.config.preferences.researchTopic,
            scope: scope,
            phases: [],
            expectedOutcome: this.config.preferences.outputFormat || 'research_report',
            estimatedDuration: estimatedDuration
        };
        
        // Phase 1: Source Discovery
        plan.phases.push({
            name: 'Source Discovery',
            description: 'Identify and evaluate relevant sources',
            agentType: 'source_discovery',
            priority: 'high',
            estimatedTime: Math.ceil(scope.estimatedDuration * 0.3),
            inputs: {
                collections: scope.relevantCollections,
                query: this.config.preferences.researchTopic,
                qualityThreshold: this.config.preferences.qualityThreshold || 0.6
            },
            outputs: ['source_evaluation', 'curated_sources']
        });
        
        // Phase 2: Content Analysis
        plan.phases.push({
            name: 'Content Analysis',
            description: 'Perform deep analysis of discovered content',
            agentType: 'content_analysis',
            priority: 'high',
            estimatedTime: Math.ceil(scope.estimatedDuration * 0.4),
            dependencies: ['source_discovery'],
            inputs: {
                analysisFrameworks: this.config.preferences.analysisFrameworks || ['thematic', 'sentiment'],
                maxContextSize: this.config.preferences.maxContextSize || 4000
            },
            outputs: ['content_analysis', 'theme_analysis', 'insights']
        });
        
        // Phase 3: Synthesis
        plan.phases.push({
            name: 'Synthesis',
            description: 'Create coherent narrative from analyzed content',
            agentType: 'synthesis',
            priority: 'medium',
            estimatedTime: Math.ceil(scope.estimatedDuration * 0.25),
            dependencies: ['source_discovery', 'content_analysis'],
            inputs: {
                outputTemplate: this.config.preferences.outputFormat || 'research_report',
                sections: this.config.preferences.sections || ['introduction', 'analysis', 'conclusion']
            },
            outputs: ['research_narrative', 'synthesis_report']
        });
        
        // Phase 4: Fact Checking (optional based on preferences)
        if (this.config.preferences.includeFactChecking !== false) {
            plan.phases.push({
                name: 'Fact Checking',
                description: 'Verify statements and assign confidence scores',
                agentType: 'fact_checking',
                priority: 'low',
                estimatedTime: Math.ceil(scope.estimatedDuration * 0.15),
                dependencies: ['synthesis'],
                inputs: {
                    confidenceThreshold: this.config.preferences.confidenceThreshold || 0.7
                },
                outputs: ['fact_verification', 'confidence_scores']
            });
        }
        
        return plan;
    }

    createTaskPlan(researchPlan, scope) {
        const tasks = [];
        const dependencies = {};
        
        for (const phase of researchPlan.phases) {
            const taskId = `task_${phase.agentType}_${Date.now()}`;
            
            const task = {
                id: taskId,
                type: phase.agentType,
                phase: phase.name,
                priority: phase.priority,
                estimatedTime: phase.estimatedTime,
                dependencies: phase.dependencies || [],
                inputs: phase.inputs,
                expectedOutputs: phase.outputs,
                status: 'pending',
                agentId: null // Will be assigned when agent is created
            };
            
            tasks.push(task);
            dependencies[taskId] = phase.dependencies || [];
        }
        
        return {
            tasks,
            dependencies,
            totalEstimatedTime: researchPlan.estimatedDuration,
            createdAt: new Date()
        };
    }

    async assignSpecializedAgents() {
        try {
            console.log(`👥 Assigning specialized agents`);
            
            const taskPlan = await this.retrieveMemory('task_plan');
            if (!taskPlan) {
                throw new Error('Task plan not found');
            }
            
            // Access tasks from the value property (memory structure: { key, value, metadata })
            const tasks = taskPlan.value?.tasks || taskPlan.tasks || [];
            console.log(`🔧 Found ${tasks.length} tasks in task plan`);
            
            // Create and start agents for each task
            for (const task of tasks) {
                const agentId = await this.createSpecializedAgent(task.type, task);
                task.agentId = agentId;
                
                // Store agent reference
                this.specializedAgents.set(agentId, {
                    task,
                    status: 'created',
                    startTime: null,
                    endTime: null
                });
                
                // Set up dependencies tracking
                this.agentDependencies.set(agentId, task.dependencies);
                this.completionStatus.set(agentId, 'pending');
            }
            
            // Update task plan with agent assignments
            await this.storeMemory('task_plan', taskPlan.data);
            
            console.log(`✅ Assigned ${this.specializedAgents.size} specialized agents`);
            return Array.from(this.specializedAgents.keys());
        } catch (error) {
            console.error(`❌ Error assigning specialized agents:`, error);
            throw error;
        }
    }

    async createSpecializedAgent(agentType, task) {
        // This would integrate with the AgentService to create specialized agents
        // For now, we'll simulate the agent creation
        const agentId = `${this.sessionId}_${agentType}_${Date.now()}`;
        
        console.log(`🔧 Creating ${agentType} agent: ${agentId}`);
        
        // In a real implementation, this would:
        // 1. Get the appropriate agent class for the type
        // 2. Create agent configuration based on task inputs
        // 3. Register and start the agent via AgentService
        
        return agentId;
    }

    async monitorAgentProgress() {
        try {
            console.log(`📊 Monitoring specialized agent progress`);
            
            const maxWaitTime = (this.config.timeout || 1800) * 1000; // Default 30 minutes
            const startTime = Date.now();
            const checkInterval = 10000; // Check every 10 seconds
            
            while (Date.now() - startTime < maxWaitTime) {
                const allCompleted = await this.checkAllAgentsCompleted();
                
                if (allCompleted) {
                    console.log(`✅ All specialized agents completed`);
                    break;
                }
                
                // Update overall progress based on agent progress
                await this.updateOverallProgress();
                
                // Wait before next check
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
            
            const completedAgents = Array.from(this.completionStatus.values()).filter(status => status === 'completed').length;
            const totalAgents = this.completionStatus.size;
            
            if (completedAgents < totalAgents) {
                console.warn(`⚠️ Timeout reached. ${completedAgents}/${totalAgents} agents completed`);
            }
            
            return { completed: completedAgents, total: totalAgents };
        } catch (error) {
            console.error(`❌ Error monitoring agent progress:`, error);
            throw error;
        }
    }

    async checkAllAgentsCompleted() {
        // Check completion status of all agents
        for (const [agentId, status] of this.completionStatus.entries()) {
            if (status === 'pending' || status === 'running') {
                // In a real implementation, this would check the actual agent status
                // via the AgentService
                const isCompleted = await this.checkAgentCompletion(agentId);
                if (isCompleted) {
                    this.completionStatus.set(agentId, 'completed');
                    console.log(`✅ Agent ${agentId} completed`);
                }
            }
        }
        
        // Check if all agents are completed
        return Array.from(this.completionStatus.values()).every(status => status === 'completed');
    }

    async checkAgentCompletion(agentId) {
        // Simulate agent completion check
        // In real implementation, this would query the AgentService
        return Math.random() > 0.7; // 30% chance of completion per check
    }

    async updateOverallProgress() {
        const completedAgents = Array.from(this.completionStatus.values()).filter(status => status === 'completed').length;
        const totalAgents = this.completionStatus.size;
        
        if (totalAgents > 0) {
            const agentProgress = (completedAgents / totalAgents) * 80; // Agents account for 80% of total progress
            const currentProgress = 70 + agentProgress; // Base 70% from orchestration setup
            
            this.updateProgress(Math.min(90, currentProgress), `${completedAgents}/${totalAgents} agents completed`);
        }
    }

    async finalizeResearch() {
        try {
            console.log(`🎯 Finalizing research`);
            
            // Collect all artifacts from specialized agents
            const artifacts = await this.collectAgentArtifacts();
            
            // Create final research summary
            const summary = await this.createResearchSummary(artifacts);
            
            // Store final artifacts
            await this.createArtifact('research_summary', summary, {
                type: 'orchestrator_output',
                artifactCount: artifacts.length,
                completedAgents: Array.from(this.completionStatus.values()).filter(status => status === 'completed').length
            });
            
            console.log(`✅ Research finalization completed`);
            return summary;
        } catch (error) {
            console.error(`❌ Error finalizing research:`, error);
            throw error;
        }
    }

    async collectAgentArtifacts() {
        const artifacts = [];
        
        // In a real implementation, this would collect artifacts from the database
        // For now, we'll simulate artifact collection
        for (const [agentId, agentInfo] of this.specializedAgents.entries()) {
            if (this.completionStatus.get(agentId) === 'completed') {
                const simulatedArtifacts = await this.getSimulatedArtifacts(agentId, agentInfo.task.type);
                artifacts.push(...simulatedArtifacts);
            }
        }
        
        return artifacts;
    }

    async getSimulatedArtifacts(agentId, agentType) {
        // Simulate artifacts for different agent types
        const baseArtifact = {
            agentId,
            agentType,
            createdAt: new Date(),
            sessionId: this.sessionId
        };
        
        switch (agentType) {
            case 'source_discovery':
                return [
                    {
                        ...baseArtifact,
                        type: 'source_evaluation',
                        content: {
                            totalSources: 25,
                            curatedSources: 18,
                            qualityScore: 0.72
                        }
                    }
                ];
            case 'content_analysis':
                return [
                    {
                        ...baseArtifact,
                        type: 'theme_analysis',
                        content: {
                            keyThemes: ['innovation', 'technology', 'sustainability'],
                            insights: ['Emerging trend in sustainable technology', 'Growing focus on innovation'],
                            confidence: 0.85
                        }
                    }
                ];
            case 'synthesis':
                return [
                    {
                        ...baseArtifact,
                        type: 'research_narrative',
                        content: {
                            sections: ['introduction', 'analysis', 'conclusion'],
                            wordCount: 2500,
                            coherenceScore: 0.88
                        }
                    }
                ];
            case 'fact_checking':
                return [
                    {
                        ...baseArtifact,
                        type: 'fact_verification',
                        content: {
                            verifiedStatements: 45,
                            flaggedStatements: 3,
                            overallConfidence: 0.92
                        }
                    }
                ];
            default:
                return [];
        }
    }

    async createResearchSummary(artifacts) {
        console.log(`📝 Generating final research report using LLM...`);
        
        // Collect key findings from all artifacts
        const findings = this.extractKeyFindings(artifacts);
        
        // Generate comprehensive research report using LLM
        const researchReport = await this.generateResearchReport(findings);
        
        const summary = {
            sessionId: this.sessionId,
            researchTopic: this.config.preferences.researchTopic,
            completedAt: new Date(),
            report: researchReport, // The actual LLM-generated report
            artifacts: artifacts.map(a => ({ id: a.id, type: a.type, agentType: a.agentType })),
            statistics: {
                totalAgents: this.specializedAgents.size,
                completedAgents: Array.from(this.completionStatus.values()).filter(status => status === 'completed').length,
                totalArtifacts: artifacts.length,
                researchDuration: Date.now() - this.startTime
            },
            quality: {
                coverageScore: this.calculateCoverageScore(artifacts),
                coherenceScore: this.calculateCoherenceScore(artifacts),
                confidenceScore: this.calculateOverallConfidence(artifacts)
            },
            recommendations: this.generateRecommendations(artifacts)
        };
        
        return summary;
    }

    extractKeyFindings(artifacts) {
        const findings = {
            sources: [],
            themes: [],
            insights: [],
            factChecks: []
        };
        
        artifacts.forEach(artifact => {
            switch (artifact.type) {
                case 'source_evaluation':
                case 'source_bibliography':
                    if (artifact.content.sources) {
                        findings.sources = findings.sources.concat(artifact.content.sources);
                    }
                    break;
                case 'thematic_analysis':
                    if (artifact.content.themes) {
                        findings.themes = findings.themes.concat(artifact.content.themes);
                    }
                    break;
                case 'research_narrative':
                case 'synthesis_report':
                    if (artifact.content.insights) {
                        findings.insights = findings.insights.concat(artifact.content.insights);
                    }
                    if (artifact.content.narrative) {
                        findings.insights.push({
                            type: 'narrative',
                            content: artifact.content.narrative
                        });
                    }
                    break;
                case 'fact_verification':
                    if (artifact.content.verifications) {
                        findings.factChecks = findings.factChecks.concat(artifact.content.verifications);
                    }
                    break;
            }
        });
        
        return findings;
    }

    async generateResearchReport(findings) {
        try {
            console.log(`🤖 Calling LLM to generate comprehensive research report...`);
            
            const prompt = `# Research Report Generation

## Research Topic: ${this.config.preferences.researchTopic}

## Available Research Data:

### Sources (${findings.sources.length} found):
${findings.sources.map(source => `- ${source.filename || source.title}: ${source.contentPreview || source.description || ''}`).join('\n')}

### Key Themes (${findings.themes.length} identified):
${findings.themes.map(theme => `- ${theme.name || theme.theme}: ${theme.description || theme.summary || ''}`).join('\n')}

### Research Insights (${findings.insights.length} generated):
${findings.insights.map(insight => `- ${insight.title || insight.type}: ${insight.content || insight.summary || ''}`).join('\n')}

### Fact Checks (${findings.factChecks.length} performed):
${findings.factChecks.map(check => `- ${check.claim}: ${check.status} (${check.confidence || 'unknown confidence'})`).join('\n')}

## Instructions:
Generate a comprehensive research report that:
1. Provides an executive summary of the research topic
2. Synthesizes the key findings from all sources
3. Identifies the main themes and patterns
4. Presents actionable insights and conclusions
5. Includes limitations and areas for further research
6. Is well-structured and professional

Please generate a detailed, well-organized research report based on the above data.`;

            const response = await this.geminiService.generateResponse(
                'You are a research report generator. Create comprehensive, well-structured research reports.',
                prompt
            );

            console.log(`✅ LLM research report generated (${response.length} characters)`);
            return response;
        } catch (error) {
            console.error(`❌ Error generating research report:`, error);
            
            // Fallback to structured summary if LLM fails
            return this.generateFallbackReport(findings);
        }
    }

    generateFallbackReport(findings) {
        return `# Research Report: ${this.config.preferences.researchTopic}

## Executive Summary
This research was conducted using automated agents across ${findings.sources.length} sources, identifying ${findings.themes.length} key themes and generating ${findings.insights.length} insights.

## Key Sources
${findings.sources.map(source => `- ${source.filename || source.title}`).join('\n')}

## Main Themes
${findings.themes.map(theme => `- ${theme.name || theme.theme}`).join('\n')}

## Key Insights
${findings.insights.map(insight => `- ${insight.title || insight.type}: ${insight.content || insight.summary || ''}`).join('\n')}

## Fact Verification
${findings.factChecks.map(check => `- ${check.claim}: ${check.status}`).join('\n')}

## Conclusion
This research provides a foundation for understanding ${this.config.preferences.researchTopic}. Further analysis may be needed for deeper insights.

*Note: This is an automated research summary. LLM generation was unavailable.*`;
    }

    /**
     * Calculate coverage score based on findings
     */
    calculateCoverageScore(findings) {
        try {
            let totalScore = 0;
            let weightSum = 0;

            // Weight factors for different types of findings
            const weights = {
                sources: 0.3,
                themes: 0.25,
                synthesis: 0.25,
                factChecks: 0.2
            };

            // Source coverage (0-100 based on number and quality)
            if (findings.sources && findings.sources.length > 0) {
                const sourceScore = Math.min(100, (findings.sources.length / 10) * 100);
                totalScore += sourceScore * weights.sources;
                weightSum += weights.sources;
            }

            // Theme coverage (0-100 based on theme diversity)
            if (findings.themes && findings.themes.length > 0) {
                const themeScore = Math.min(100, (findings.themes.length / 5) * 100);
                totalScore += themeScore * weights.themes;
                weightSum += weights.themes;
            }

            // Synthesis coverage (0-100 based on synthesis depth)
            if (findings.synthesis && findings.synthesis.length > 0) {
                const synthesisScore = Math.min(100, (findings.synthesis.length / 3) * 100);
                totalScore += synthesisScore * weights.synthesis;
                weightSum += weights.synthesis;
            }

            // Fact check coverage (0-100 based on verification completeness)
            if (findings.factChecks && findings.factChecks.length > 0) {
                const factScore = Math.min(100, (findings.factChecks.length / 5) * 100);
                totalScore += factScore * weights.factChecks;
                weightSum += weights.factChecks;
            }

            // Return weighted average, or 0 if no valid weights
            return weightSum > 0 ? Math.round(totalScore / weightSum) : 0;
        } catch (error) {
            console.error('❌ Error calculating coverage score:', error);
            return 0;
        }
    }

    /**
     * Calculate coherence score based on findings consistency
     */
    calculateCoherenceScore(artifacts) {
        try {
            // Simple coherence calculation based on theme consistency and content overlap
            let coherenceScore = 75; // Base score
            
            // Check for theme consistency across artifacts
            const themes = [];
            artifacts.forEach(artifact => {
                if (artifact.content && artifact.content.themes) {
                    themes.push(...artifact.content.themes);
                }
            });
            
            // Higher coherence if themes are consistent
            const uniqueThemes = [...new Set(themes.map(t => t.name || t.theme))];
            if (themes.length > 0) {
                const themeConsistency = (themes.length - uniqueThemes.length) / themes.length;
                coherenceScore += themeConsistency * 20;
            }
            
            return Math.min(100, Math.max(0, Math.round(coherenceScore)));
        } catch (error) {
            console.error('❌ Error calculating coherence score:', error);
            return 75; // Default score
        }
    }

    /**
     * Calculate overall confidence score based on all artifacts
     */
    calculateOverallConfidence(artifacts) {
        try {
            let totalConfidence = 0;
            let confidenceCount = 0;

            artifacts.forEach(artifact => {
                if (artifact.content) {
                    // Check for confidence in different artifact types
                    if (artifact.content.confidence) {
                        totalConfidence += artifact.content.confidence;
                        confidenceCount++;
                    }
                    if (artifact.content.overallConfidence) {
                        totalConfidence += artifact.content.overallConfidence;
                        confidenceCount++;
                    }
                    if (artifact.content.qualityScore) {
                        totalConfidence += artifact.content.qualityScore;
                        confidenceCount++;
                    }
                }
            });

            if (confidenceCount === 0) {
                return 0.75; // Default confidence
            }

            return Math.round((totalConfidence / confidenceCount) * 100) / 100;
        } catch (error) {
            console.error('❌ Error calculating overall confidence:', error);
            return 0.75; // Default confidence
        }
    }

    /**
     * Generate recommendations based on research findings
     */
    generateRecommendations(artifacts) {
        try {
            const recommendations = [];

            // Basic recommendations based on artifact types and quality
            const hasSourceEvaluation = artifacts.some(a => a.type === 'source_evaluation');
            const hasContentAnalysis = artifacts.some(a => a.type === 'content_analysis' || a.type === 'thematic_analysis');
            const hasSynthesis = artifacts.some(a => a.type === 'synthesis_report' || a.type === 'research_narrative');
            const hasFactChecking = artifacts.some(a => a.type === 'fact_verification');

            if (!hasSourceEvaluation) {
                recommendations.push({
                    priority: 'high',
                    category: 'research_quality',
                    title: 'Expand Source Discovery',
                    description: 'Consider expanding the source discovery process to include additional collections or external sources.'
                });
            }

            if (!hasContentAnalysis) {
                recommendations.push({
                    priority: 'medium',
                    category: 'analysis_depth',
                    title: 'Enhance Content Analysis',
                    description: 'Implement deeper content analysis using additional analytical frameworks.'
                });
            }

            if (!hasSynthesis) {
                recommendations.push({
                    priority: 'medium',
                    category: 'synthesis',
                    title: 'Improve Synthesis Process',
                    description: 'Develop more comprehensive synthesis capabilities to create coherent narratives.'
                });
            }

            if (!hasFactChecking) {
                recommendations.push({
                    priority: 'low',
                    category: 'verification',
                    title: 'Add Fact Verification',
                    description: 'Include fact-checking processes to verify claims and statements.'
                });
            }

            // Add general recommendations
            recommendations.push({
                priority: 'medium',
                category: 'follow_up',
                title: 'Regular Updates',
                description: 'Schedule regular updates to incorporate new information and maintain currency.'
            });

            return recommendations;
        } catch (error) {
            console.error('❌ Error generating recommendations:', error);
            return [{
                priority: 'low',
                category: 'general',
                title: 'Review Results',
                description: 'Review the research results and consider additional analysis if needed.'
            }];
        }
    }

    // Override cleanup to stop specialized agents
    async cleanupResources() {
        console.log(`🧹 Cleaning up orchestrator and specialized agents`);
        
        // In a real implementation, this would stop all specialized agents
        for (const agentId of this.specializedAgents.keys()) {
            try {
                console.log(`🛑 Stopping agent: ${agentId}`);
                // await this.agentService.stopAgent(agentId);
            } catch (error) {
                console.warn(`⚠️ Error stopping agent ${agentId}:`, error.message);
            }
        }
        
        return true;
    }
}

module.exports = { OrchestratorAgent };
