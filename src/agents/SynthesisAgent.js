const { BaseAgent } = require('./BaseAgent');

/**
 * SynthesisAgent - Creates coherent narratives from analyzed content
 * 
 * This agent takes fragmented content analysis results and creates
 * well-structured, coherent narratives and reports.
 */
class SynthesisAgent extends BaseAgent {
    constructor(agentId, sessionId, config = {}, apiClient, databaseService = null) {
        super(agentId, sessionId, config, apiClient, databaseService);
        this.agentType = 'synthesis';
        
        // Configuration options
        this.maxSynthesisLength = config.maxSynthesisLength || 5000;
        this.narrativeStyle = config.narrativeStyle || 'academic';
        this.includeReferences = config.includeReferences !== false;
        this.coherenceThreshold = config.coherenceThreshold || 0.8;
        this.structureTemplate = config.structureTemplate || 'research';
        
        // Processing state
        this.analysisArtifacts = [];
        this.sourceContent = [];
        this.synthesisOutline = null;
    }

    /**
     * Initialize the synthesis agent
     */
    async initialize() {
        try {
            await this.log('info', 'Initializing SynthesisAgent', {
                agentId: this.agentId,
                config: {
                    maxLength: this.maxSynthesisLength,
                    style: this.narrativeStyle,
                    template: this.structureTemplate
                }
            });

            // Load available content analysis artifacts
            await this.loadAnalysisArtifacts();
            
            // Load source content for reference
            await this.loadSourceContent();
            
            // Prepare synthesis templates
            this.prepareSynthesisTemplates();
            
            this.status = 'initialized';
            await this.log('info', 'SynthesisAgent initialized successfully');
            
        } catch (error) {
            await this.log('error', 'Failed to initialize SynthesisAgent', { error: error.message });
            this.status = 'error';
            throw error;
        }
    }

    /**
     * Execute the synthesis process
     */
    async execute() {
        try {
            this.status = 'running';
            await this.log('info', 'Starting synthesis execution');

            // Step 1: Gather and validate analysis data
            await this.gatherAnalysisData();
            
            // Step 2: Create narrative outline
            await this.createNarrativeOutline();
            
            // Step 3: Generate coherent synthesis
            await this.synthesizeContent();
            
            // Step 4: Validate and refine output
            await this.validateSynthesis();
            
            // Step 5: Create final artifact
            await this.createSynthesisArtifact();
            
            this.status = 'completed';
            await this.log('info', 'Synthesis execution completed successfully');
            
        } catch (error) {
            await this.log('error', 'Error during synthesis execution', { error: error.message });
            this.status = 'error';
            throw error;
        }
    }

    /**
     * Clean up synthesis agent resources
     */
    async cleanup() {
        try {
            await this.log('info', 'Cleaning up SynthesisAgent');
            
            // Store final synthesis artifacts
            await this.storeFinalArtifacts();
            
            // Update shared memory with synthesis results
            await this.updateSharedMemory();
            
            // Log completion metrics
            await this.logCompletionMetrics();
            
            await this.log('info', 'SynthesisAgent cleanup completed');
            
        } catch (error) {
            await this.log('error', 'Error during synthesis cleanup', { error: error.message });
        }
    }

    /**
     * Load content analysis artifacts from shared memory
     */
    async loadAnalysisArtifacts() {
        try {
            const sharedMemory = await this.getSharedMemory();
            const contentAnalysisData = sharedMemory.value?.contentAnalysis || {};
            
            this.analysisArtifacts = contentAnalysisData.artifacts || [];
            
            await this.log('info', 'Loaded analysis artifacts', {
                artifactCount: this.analysisArtifacts.length
            });
            
        } catch (error) {
            await this.log('warn', 'Could not load analysis artifacts', { error: error.message });
            this.analysisArtifacts = [];
        }
    }

    /**
     * Load source content for reference
     */
    async loadSourceContent() {
        try {
            const sharedMemory = await this.getSharedMemory();
            const sourceData = sharedMemory.value?.sourceDiscovery || {};
            
            this.sourceContent = sourceData.sources || [];
            
            await this.log('info', 'Loaded source content', {
                sourceCount: this.sourceContent.length
            });
            
        } catch (error) {
            await this.log('warn', 'Could not load source content', { error: error.message });
            this.sourceContent = [];
        }
    }

    /**
     * Prepare synthesis templates based on configuration
     */
    prepareSynthesisTemplates() {
        const templates = {
            research: {
                structure: ['introduction', 'methodology', 'findings', 'analysis', 'conclusion'],
                style: 'formal academic tone with proper citations'
            },
            report: {
                structure: ['executive_summary', 'background', 'key_findings', 'recommendations', 'conclusion'],
                style: 'professional business communication'
            },
            article: {
                structure: ['introduction', 'main_content', 'supporting_evidence', 'conclusion'],
                style: 'engaging journalistic narrative'
            }
        };
        
        this.synthesisTemplate = templates[this.structureTemplate] || templates.research;
        
        this.log('info', 'Synthesis template prepared', {
            template: this.structureTemplate,
            structure: this.synthesisTemplate.structure
        });
    }

    /**
     * Gather and validate analysis data
     */
    async gatherAnalysisData() {
        await this.log('info', 'Gathering analysis data for synthesis');
        
        // Validate we have sufficient data for synthesis
        if (this.analysisArtifacts.length === 0) {
            throw new Error('No content analysis artifacts available for synthesis');
        }
        
        // Extract key insights and themes
        this.keyInsights = this.extractKeyInsights();
        this.mainThemes = this.extractMainThemes();
        this.supportingEvidence = this.extractSupportingEvidence();
        
        await this.log('info', 'Analysis data gathered', {
            insights: this.keyInsights.length,
            themes: this.mainThemes.length,
            evidence: this.supportingEvidence.length
        });
    }

    /**
     * Create narrative outline
     */
    async createNarrativeOutline() {
        await this.log('info', 'Creating narrative outline');
        
        const outlinePrompt = this.buildOutlinePrompt();
        
        try {
            const geminiService = this.getGeminiService();
            const outlineResponse = await geminiService.generateContent(outlinePrompt);
            
            this.synthesisOutline = this.parseOutlineResponse(outlineResponse);
            
            await this.log('info', 'Narrative outline created', {
                sections: this.synthesisOutline.sections?.length || 0
            });
            
        } catch (error) {
            await this.log('error', 'Failed to create narrative outline', { error: error.message });
            // Create fallback outline
            this.synthesisOutline = this.createFallbackOutline();
        }
    }

    /**
     * Generate coherent synthesis
     */
    async synthesizeContent() {
        await this.log('info', 'Generating coherent synthesis');
        
        if (!this.synthesisOutline) {
            throw new Error('No synthesis outline available');
        }
        
        const synthesisPrompt = this.buildSynthesisPrompt();
        
        try {
            const geminiService = this.getGeminiService();
            const synthesisResponse = await geminiService.generateContent(synthesisPrompt);
            
            this.synthesizedNarrative = synthesisResponse.text || synthesisResponse;
            
            await this.log('info', 'Synthesis generated', {
                narrativeLength: this.synthesizedNarrative.length,
                wordCount: this.synthesizedNarrative.split(' ').length
            });
            
        } catch (error) {
            await this.log('error', 'Failed to generate synthesis', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate synthesis quality
     */
    async validateSynthesis() {
        await this.log('info', 'Validating synthesis quality');
        
        if (!this.synthesizedNarrative) {
            throw new Error('No synthesized narrative to validate');
        }
        
        // Calculate basic quality metrics
        const coherenceScore = await this.calculateCoherenceScore();
        const completenessScore = this.calculateCompletenessScore();
        const readabilityScore = this.calculateReadabilityScore();
        
        this.qualityMetrics = {
            coherence: coherenceScore,
            completeness: completenessScore,
            readability: readabilityScore,
            overall: (coherenceScore + completenessScore + readabilityScore) / 3
        };
        
        await this.log('info', 'Synthesis validation completed', this.qualityMetrics);
        
        // Check if quality meets threshold
        if (this.qualityMetrics.overall < this.coherenceThreshold) {
            await this.log('warn', 'Synthesis quality below threshold, attempting refinement');
            await this.refineSynthesis();
        }
    }

    /**
     * Create synthesis artifact
     */
    async createSynthesisArtifact() {
        const artifact = {
            artifact_type: 'synthesis_report',
            content: {
                narrative: this.synthesizedNarrative,
                structure: this.synthesisOutline,
                metadata: {
                    word_count: this.synthesizedNarrative.split(' ').length,
                    reading_time_minutes: Math.ceil(this.synthesizedNarrative.split(' ').length / 200),
                    complexity_score: this.qualityMetrics?.readability || 0.75,
                    coherence_score: this.qualityMetrics?.coherence || 0.8
                },
                source_integration: {
                    sources_referenced: this.sourceContent.length,
                    analysis_artifacts_used: this.analysisArtifacts.length,
                    key_themes_covered: this.mainThemes.length
                },
                quality_metrics: this.qualityMetrics || {}
            }
        };
        
        await this.persistArtifact(artifact);
        await this.log('info', 'Synthesis artifact created and persisted');
    }

    /**
     * Extract key insights from analysis artifacts
     */
    extractKeyInsights() {
        const insights = [];
        
        for (const artifact of this.analysisArtifacts) {
            if (artifact.content?.insights) {
                insights.push(...artifact.content.insights);
            }
            if (artifact.content?.themes) {
                insights.push(...artifact.content.themes.map(theme => theme.description));
            }
        }
        
        return [...new Set(insights)]; // Remove duplicates
    }

    /**
     * Extract main themes from analysis artifacts
     */
    extractMainThemes() {
        const themes = [];
        
        for (const artifact of this.analysisArtifacts) {
            if (artifact.content?.themes) {
                themes.push(...artifact.content.themes);
            }
        }
        
        return themes;
    }

    /**
     * Extract supporting evidence from sources
     */
    extractSupportingEvidence() {
        const evidence = [];
        
        for (const source of this.sourceContent) {
            if (source.content) {
                evidence.push({
                    source_id: source.id,
                    title: source.title,
                    excerpt: source.content.substring(0, 300),
                    relevance: source.relevance || 0.8
                });
            }
        }
        
        return evidence;
    }

    /**
     * Build outline prompt for LLM
     */
    buildOutlinePrompt() {
        const researchTopic = this.config.query || 'Research Topic';
        const template = this.synthesisTemplate;
        
        return `Create a detailed outline for a ${this.narrativeStyle} ${this.structureTemplate} on the topic: "${researchTopic}"

Key insights to incorporate:
${this.keyInsights.slice(0, 10).map(insight => `- ${insight}`).join('\n')}

Main themes to address:
${this.mainThemes.slice(0, 5).map(theme => `- ${theme.name || theme}: ${theme.description || ''}`).join('\n')}

Required structure sections: ${template.structure.join(', ')}

Style guidelines: ${template.style}

Please provide a detailed outline with:
1. Section titles and descriptions
2. Key points to cover in each section
3. Logical flow between sections
4. Suggested length for each section

Format the response as a structured outline that can be used to generate the final narrative.`;
    }

    /**
     * Build synthesis prompt for LLM
     */
    buildSynthesisPrompt() {
        const researchTopic = this.config.query || 'Research Topic';
        
        return `Write a comprehensive ${this.narrativeStyle} ${this.structureTemplate} on the topic: "${researchTopic}"

Follow this outline:
${JSON.stringify(this.synthesisOutline, null, 2)}

Key insights to incorporate:
${this.keyInsights.slice(0, 15).map(insight => `- ${insight}`).join('\n')}

Supporting evidence available:
${this.supportingEvidence.slice(0, 10).map(evidence => `- ${evidence.title}: ${evidence.excerpt}...`).join('\n')}

Requirements:
- Maximum length: ${this.maxSynthesisLength} words
- Style: ${this.synthesisTemplate.style}
- Include references: ${this.includeReferences ? 'Yes' : 'No'}
- Maintain coherent narrative flow
- Ensure factual accuracy
- Use markdown formatting for structure

Generate a well-structured, coherent narrative that synthesizes all the available information into a comprehensive report.`;
    }

    /**
     * Parse outline response from LLM
     */
    parseOutlineResponse(response) {
        try {
            // Try to parse as JSON first
            if (response.includes('{') && response.includes('}')) {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
            
            // Fallback: parse as structured text
            return this.parseTextOutline(response);
            
        } catch (error) {
            this.log('warn', 'Could not parse outline response, using fallback');
            return this.createFallbackOutline();
        }
    }

    /**
     * Create fallback outline if LLM fails
     */
    createFallbackOutline() {
        return {
            title: this.config.query || 'Research Report',
            sections: this.synthesisTemplate.structure.map(section => ({
                title: section.replace('_', ' ').toUpperCase(),
                description: `Content for ${section} section`,
                key_points: this.keyInsights.slice(0, 3)
            }))
        };
    }

    /**
     * Calculate coherence score (simplified implementation)
     */
    async calculateCoherenceScore() {
        if (!this.synthesizedNarrative) return 0;
        
        // Simple heuristics for coherence
        const paragraphs = this.synthesizedNarrative.split('\n\n');
        const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
        const hasTransitions = this.synthesizedNarrative.includes('however') || 
                              this.synthesizedNarrative.includes('furthermore') ||
                              this.synthesizedNarrative.includes('therefore');
        
        let score = 0.7; // Base score
        if (avgParagraphLength > 100 && avgParagraphLength < 500) score += 0.1;
        if (hasTransitions) score += 0.1;
        if (paragraphs.length >= 3) score += 0.1;
        
        return Math.min(score, 1.0);
    }

    /**
     * Calculate completeness score
     */
    calculateCompletenessScore() {
        if (!this.synthesizedNarrative) return 0;
        
        const requiredSections = this.synthesisTemplate.structure.length;
        const coveredSections = this.synthesisTemplate.structure.filter(section => 
            this.synthesizedNarrative.toLowerCase().includes(section.replace('_', ' '))
        ).length;
        
        return coveredSections / requiredSections;
    }

    /**
     * Calculate readability score (simplified)
     */
    calculateReadabilityScore() {
        if (!this.synthesizedNarrative) return 0;
        
        const words = this.synthesizedNarrative.split(' ').length;
        const sentences = this.synthesizedNarrative.split(/[.!?]+/).length;
        const avgWordsPerSentence = words / sentences;
        
        // Optimal range: 15-20 words per sentence
        if (avgWordsPerSentence >= 15 && avgWordsPerSentence <= 20) {
            return 0.9;
        } else if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25) {
            return 0.7;
        } else {
            return 0.5;
        }
    }

    /**
     * Refine synthesis if quality is below threshold
     */
    async refineSynthesis() {
        await this.log('info', 'Attempting to refine synthesis');
        
        const refinementPrompt = `Please improve the following text to make it more coherent and readable:

${this.synthesizedNarrative}

Focus on:
- Improving logical flow between paragraphs
- Adding appropriate transitions
- Ensuring consistent narrative voice
- Maintaining factual accuracy
- Keeping within ${this.maxSynthesisLength} words

Provide the refined version:`;
        
        try {
            const geminiService = this.getGeminiService();
            const refinedResponse = await geminiService.generateContent(refinementPrompt);
            
            this.synthesizedNarrative = refinedResponse.text || refinedResponse;
            
            // Recalculate quality metrics
            await this.validateSynthesis();
            
            await this.log('info', 'Synthesis refinement completed');
            
        } catch (error) {
            await this.log('warn', 'Synthesis refinement failed, using original', { error: error.message });
        }
    }

    /**
     * Update shared memory with synthesis results
     */
    async updateSharedMemory() {
        try {
            const sharedMemory = await this.getSharedMemory();
            
            if (!sharedMemory.value) {
                sharedMemory.value = {};
            }
            
            sharedMemory.value.synthesis = {
                status: 'completed',
                narrative: this.synthesizedNarrative,
                outline: this.synthesisOutline,
                qualityMetrics: this.qualityMetrics,
                artifactCount: 1,
                completedAt: new Date().toISOString()
            };
            
            await this.updateSharedMemory(sharedMemory);
            await this.log('info', 'Shared memory updated with synthesis results');
            
        } catch (error) {
            await this.log('error', 'Failed to update shared memory', { error: error.message });
        }
    }

    /**
     * Log completion metrics
     */
    async logCompletionMetrics() {
        const metrics = {
            synthesisLength: this.synthesizedNarrative?.length || 0,
            wordCount: this.synthesizedNarrative?.split(' ').length || 0,
            qualityScore: this.qualityMetrics?.overall || 0,
            sourcesUsed: this.sourceContent.length,
            analysisArtifactsUsed: this.analysisArtifacts.length,
            executionTime: Date.now() - this.startTime
        };
        
        await this.log('info', 'SynthesisAgent completion metrics', metrics);
    }

    /**
     * Get agent capabilities
     */
    getCapabilities() {
        return [
            'content_synthesis',
            'narrative_generation',
            'coherence_analysis',
            'multiple_formats',
            'quality_validation',
            'theme_integration',
            'reference_management'
        ];
    }

    /**
     * Check if agent can handle a specific task
     */
    canHandle(task) {
        if (!task || !task.type) {
            return false;
        }

        const supportedTypes = ['synthesis', 'narrative_generation', 'content_synthesis'];
        return supportedTypes.includes(task.type);
    }
}

module.exports = { SynthesisAgent };
