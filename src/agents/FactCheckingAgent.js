const { BaseAgent } = require('./BaseAgent');

/**
 * FactCheckingAgent - Verifies statements and claims for accuracy
 * 
 * This agent extracts factual claims from content and cross-references
 * them against reliable sources to verify accuracy and identify
 * potentially misleading information.
 */
class FactCheckingAgent extends BaseAgent {
    constructor(agentId, sessionId, config = {}, apiClient, databaseService = null) {
        super(agentId, sessionId, config, apiClient, databaseService);
        this.agentType = 'fact_checking';
        
        // Configuration options
        this.confidenceThreshold = config.confidenceThreshold || 0.7;
        this.maxClaimsToCheck = config.maxClaimsToCheck || 50;
        this.checkExternalSources = config.checkExternalSources || false;
        this.disputeThreshold = config.disputeThreshold || 0.3;
        this.verificationMethods = config.verificationMethods || ['source_cross_reference', 'statistical_validation'];
        
        // Processing state
        this.synthesisContent = null;
        this.extractedClaims = [];
        this.verificationResults = [];
        this.sourceDatabase = [];
    }

    /**
     * Initialize the fact-checking agent
     */
    async initialize() {
        try {
            await this.log('info', 'Initializing FactCheckingAgent', {
                agentId: this.agentId,
                config: {
                    confidenceThreshold: this.confidenceThreshold,
                    maxClaims: this.maxClaimsToCheck,
                    verificationMethods: this.verificationMethods
                }
            });

            // Load synthesis content to fact-check
            await this.loadSynthesisContent();
            
            // Load source database for verification
            await this.loadSourceDatabase();
            
            // Prepare fact-checking patterns and templates
            this.prepareFactCheckingPatterns();
            
            this.status = 'initialized';
            await this.log('info', 'FactCheckingAgent initialized successfully');
            
        } catch (error) {
            await this.log('error', 'Failed to initialize FactCheckingAgent', { error: error.message });
            this.status = 'error';
            throw error;
        }
    }

    /**
     * Execute the fact-checking process
     */
    async execute() {
        try {
            this.status = 'running';
            await this.log('info', 'Starting fact-checking execution');

            // Step 1: Extract factual claims from content
            await this.extractFactualClaims();
            
            // Step 2: Verify claims against sources
            await this.verifyClaimsAgainstSources();
            
            // Step 3: Calculate confidence scores
            await this.calculateConfidenceScores();
            
            // Step 4: Generate fact-checking report
            await this.generateFactCheckReport();
            
            // Step 5: Flag disputed claims
            await this.flagDisputedClaims();
            
            this.status = 'completed';
            await this.log('info', 'Fact-checking execution completed successfully');
            
        } catch (error) {
            await this.log('error', 'Error during fact-checking execution', { error: error.message });
            this.status = 'error';
            throw error;
        }
    }

    /**
     * Clean up fact-checking agent resources
     */
    async cleanup() {
        try {
            await this.log('info', 'Cleaning up FactCheckingAgent');
            
            // Store fact-checking artifacts
            await this.storeFactCheckingArtifacts();
            
            // Update content confidence scores
            await this.updateContentConfidenceScores();
            
            // Log verification metrics
            await this.logVerificationMetrics();
            
            await this.log('info', 'FactCheckingAgent cleanup completed');
            
        } catch (error) {
            await this.log('error', 'Error during fact-checking cleanup', { error: error.message });
        }
    }

    /**
     * Load synthesis content to fact-check
     */
    async loadSynthesisContent() {
        try {
            const sharedMemory = await this.getSharedMemory();
            const synthesisData = sharedMemory.value?.synthesis || {};
            
            this.synthesisContent = synthesisData.narrative || '';
            
            if (!this.synthesisContent) {
                // Fallback: load any available content analysis
                const analysisData = sharedMemory.value?.contentAnalysis || {};
                if (analysisData.artifacts && analysisData.artifacts.length > 0) {
                    this.synthesisContent = analysisData.artifacts
                        .map(artifact => artifact.content?.summary || '')
                        .join('\n\n');
                }
            }
            
            await this.log('info', 'Loaded synthesis content for fact-checking', {
                contentLength: this.synthesisContent.length
            });
            
        } catch (error) {
            await this.log('warn', 'Could not load synthesis content', { error: error.message });
            this.synthesisContent = '';
        }
    }

    /**
     * Load source database for verification
     */
    async loadSourceDatabase() {
        try {
            const sharedMemory = await this.getSharedMemory();
            const sourceData = sharedMemory.value?.sourceDiscovery || {};
            
            this.sourceDatabase = sourceData.sources || [];
            
            await this.log('info', 'Loaded source database for verification', {
                sourceCount: this.sourceDatabase.length
            });
            
        } catch (error) {
            await this.log('warn', 'Could not load source database', { error: error.message });
            this.sourceDatabase = [];
        }
    }

    /**
     * Prepare fact-checking patterns and templates
     */
    prepareFactCheckingPatterns() {
        // Patterns to identify factual claims
        this.claimPatterns = [
            // Statistical claims
            /(\d+(?:\.\d+)?)\s*(%|percent|percentage)/gi,
            // Numerical facts
            /(?:there are|contains?|includes?|has|have)\s+(\d+)/gi,
            // Temporal claims
            /(?:in|during|since|from)\s+(\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi,
            // Categorical statements
            /(?:is|are|was|were)\s+(?:the\s+)?(?:first|largest|smallest|most|least|only)/gi,
            // Causal claims
            /(?:causes?|results? in|leads? to|due to|because of)/gi
        ];

        // Templates for verification prompts
        this.verificationTemplates = {
            statistical: "Verify this statistical claim: '{claim}'. Check if the numbers and percentages are accurate based on available sources.",
            temporal: "Verify this temporal claim: '{claim}'. Check if the dates and timeframes are correct.",
            categorical: "Verify this categorical claim: '{claim}'. Check if the superlatives or categories are accurate.",
            causal: "Verify this causal claim: '{claim}'. Check if the cause-and-effect relationship is supported by evidence."
        };

        this.log('info', 'Fact-checking patterns prepared', {
            patternCount: this.claimPatterns.length,
            templateCount: Object.keys(this.verificationTemplates).length
        });
    }

    /**
     * Extract factual claims from content using NLP patterns
     */
    async extractFactualClaims() {
        await this.log('info', 'Extracting factual claims from content');
        
        if (!this.synthesisContent) {
            await this.log('warn', 'No content available for claim extraction');
            return;
        }

        // Split content into sentences
        const sentences = this.synthesisContent.split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 10);

        this.extractedClaims = [];
        let claimId = 1;

        for (const sentence of sentences) {
            // Check each pattern
            for (const pattern of this.claimPatterns) {
                const matches = sentence.match(pattern);
                if (matches) {
                    const claim = {
                        claim_id: `claim_${claimId++}`,
                        statement: sentence,
                        claim_type: this.categorizeClaimType(sentence, pattern),
                        extraction_confidence: this.calculateExtractionConfidence(sentence, matches),
                        verification_status: 'pending',
                        supporting_evidence: [],
                        contradicting_evidence: []
                    };
                    
                    this.extractedClaims.push(claim);
                    
                    // Limit number of claims to check
                    if (this.extractedClaims.length >= this.maxClaimsToCheck) {
                        break;
                    }
                }
            }
            
            if (this.extractedClaims.length >= this.maxClaimsToCheck) {
                break;
            }
        }

        await this.log('info', 'Factual claims extracted', {
            totalClaims: this.extractedClaims.length,
            claimTypes: this.getClaimTypeDistribution()
        });
    }

    /**
     * Verify claims against available sources
     */
    async verifyClaimsAgainstSources() {
        await this.log('info', 'Verifying claims against sources');
        
        for (const claim of this.extractedClaims) {
            try {
                await this.verifySingleClaim(claim);
                await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
            } catch (error) {
                await this.log('warn', `Failed to verify claim ${claim.claim_id}`, { error: error.message });
                claim.verification_status = 'error';
            }
        }

        await this.log('info', 'Claim verification completed', {
            verified: this.extractedClaims.filter(c => c.verification_status === 'verified').length,
            disputed: this.extractedClaims.filter(c => c.verification_status === 'disputed').length,
            unverified: this.extractedClaims.filter(c => c.verification_status === 'unverified').length
        });
    }

    /**
     * Verify a single claim against sources
     */
    async verifySingleClaim(claim) {
        // Search for relevant sources
        const relevantSources = this.findRelevantSources(claim.statement);
        
        if (relevantSources.length === 0) {
            claim.verification_status = 'unverified';
            claim.fact_check_notes = 'No relevant sources found for verification';
            return;
        }

        // Use LLM to verify claim against sources
        const verificationPrompt = this.buildVerificationPrompt(claim, relevantSources);
        
        try {
            const geminiService = this.getGeminiService();
            const verificationResponse = await geminiService.generateContent(verificationPrompt);
            
            this.parseVerificationResponse(claim, verificationResponse, relevantSources);
            
        } catch (error) {
            claim.verification_status = 'error';
            claim.fact_check_notes = `Verification failed: ${error.message}`;
        }
    }

    /**
     * Find relevant sources for a claim
     */
    findRelevantSources(claimStatement) {
        const relevantSources = [];
        const claimKeywords = this.extractKeywords(claimStatement);
        
        for (const source of this.sourceDatabase) {
            const sourceText = `${source.title || ''} ${source.content || ''}`.toLowerCase();
            let relevanceScore = 0;
            
            // Calculate relevance based on keyword overlap
            for (const keyword of claimKeywords) {
                if (sourceText.includes(keyword.toLowerCase())) {
                    relevanceScore += 1;
                }
            }
            
            if (relevanceScore > 0) {
                relevantSources.push({
                    ...source,
                    relevance_score: relevanceScore / claimKeywords.length
                });
            }
        }
        
        // Sort by relevance and return top sources
        return relevantSources
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, 5);
    }

    /**
     * Build verification prompt for LLM
     */
    buildVerificationPrompt(claim, sources) {
        const template = this.verificationTemplates[claim.claim_type] || this.verificationTemplates.statistical;
        
        return `${template.replace('{claim}', claim.statement)}

Available sources for verification:
${sources.map((source, idx) => `
Source ${idx + 1}: ${source.title || 'Untitled'}
Content: ${(source.content || '').substring(0, 500)}...
Relevance: ${Math.round(source.relevance_score * 100)}%
`).join('')}

Please analyze this claim against the provided sources and respond with:
1. VERIFICATION_STATUS: verified|disputed|unverified
2. CONFIDENCE_SCORE: 0.0-1.0
3. SUPPORTING_EVIDENCE: List any evidence that supports the claim
4. CONTRADICTING_EVIDENCE: List any evidence that contradicts the claim
5. FACT_CHECK_NOTES: Additional context or caveats

Format your response clearly with these labeled sections.`;
    }

    /**
     * Parse verification response from LLM
     */
    parseVerificationResponse(claim, response, sources) {
        const responseText = response.text || response;
        
        // Extract verification status
        const statusMatch = responseText.match(/VERIFICATION_STATUS:\s*(verified|disputed|unverified)/i);
        claim.verification_status = statusMatch ? statusMatch[1].toLowerCase() : 'unverified';
        
        // Extract confidence score
        const confidenceMatch = responseText.match(/CONFIDENCE_SCORE:\s*([0-9.]+)/i);
        claim.confidence_score = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
        
        // Extract supporting evidence
        const supportMatch = responseText.match(/SUPPORTING_EVIDENCE:\s*(.*?)(?=CONTRADICTING_EVIDENCE:|FACT_CHECK_NOTES:|$)/is);
        if (supportMatch) {
            claim.supporting_evidence = this.parseEvidenceList(supportMatch[1], sources);
        }
        
        // Extract contradicting evidence
        const contradictMatch = responseText.match(/CONTRADICTING_EVIDENCE:\s*(.*?)(?=FACT_CHECK_NOTES:|$)/is);
        if (contradictMatch) {
            claim.contradicting_evidence = this.parseEvidenceList(contradictMatch[1], sources);
        }
        
        // Extract fact-check notes
        const notesMatch = responseText.match(/FACT_CHECK_NOTES:\s*(.*?)$/is);
        claim.fact_check_notes = notesMatch ? notesMatch[1].trim() : '';
    }

    /**
     * Parse evidence list from response text
     */
    parseEvidenceList(evidenceText, sources) {
        const evidence = [];
        const lines = evidenceText.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            if (line.includes('-') || line.includes('•')) {
                const sourceRef = line.match(/Source (\d+)/i);
                const sourceIndex = sourceRef ? parseInt(sourceRef[1]) - 1 : 0;
                
                if (sources[sourceIndex]) {
                    evidence.push({
                        source_id: sources[sourceIndex].id,
                        source_title: sources[sourceIndex].title,
                        relevance_score: sources[sourceIndex].relevance_score,
                        quote: line.replace(/^[-•]\s*/, '').replace(/Source \d+:?\s*/i, '').trim()
                    });
                }
            }
        }
        
        return evidence;
    }

    /**
     * Calculate confidence scores for all claims
     */
    async calculateConfidenceScores() {
        await this.log('info', 'Calculating confidence scores');
        
        for (const claim of this.extractedClaims) {
            if (!claim.confidence_score) {
                // Calculate based on available evidence
                const supportingWeight = claim.supporting_evidence.length * 0.3;
                const contradictingPenalty = claim.contradicting_evidence.length * 0.2;
                const baseScore = claim.extraction_confidence || 0.5;
                
                claim.confidence_score = Math.max(0, Math.min(1, 
                    baseScore + supportingWeight - contradictingPenalty
                ));
            }
        }
    }

    /**
     * Generate comprehensive fact-checking report
     */
    async generateFactCheckReport() {
        await this.log('info', 'Generating fact-checking report');
        
        const verifiedClaims = this.extractedClaims.filter(c => c.verification_status === 'verified');
        const disputedClaims = this.extractedClaims.filter(c => c.verification_status === 'disputed');
        const unverifiedClaims = this.extractedClaims.filter(c => c.verification_status === 'unverified');
        
        const overallAccuracy = {
            verified_claims: verifiedClaims.length,
            disputed_claims: disputedClaims.length,
            unverified_claims: unverifiedClaims.length,
            total_claims: this.extractedClaims.length,
            accuracy_percentage: this.extractedClaims.length > 0 
                ? Math.round((verifiedClaims.length / this.extractedClaims.length) * 100)
                : 0
        };
        
        const recommendations = this.generateRecommendations(disputedClaims, unverifiedClaims);
        
        const artifact = {
            artifact_type: 'fact_check_report',
            content: {
                claims_analyzed: this.extractedClaims,
                overall_accuracy: overallAccuracy,
                recommendations: recommendations,
                verification_summary: {
                    sources_used: this.sourceDatabase.length,
                    verification_methods: this.verificationMethods,
                    confidence_threshold: this.confidenceThreshold,
                    processing_time: Date.now() - this.startTime
                }
            }
        };
        
        await this.persistArtifact(artifact);
        await this.log('info', 'Fact-checking report generated and persisted');
    }

    /**
     * Generate recommendations based on fact-checking results
     */
    generateRecommendations(disputedClaims, unverifiedClaims) {
        const recommendations = [];
        
        if (disputedClaims.length > 0) {
            recommendations.push(`Review ${disputedClaims.length} disputed claims for accuracy`);
            recommendations.push('Consider removing or qualifying disputed statements');
        }
        
        if (unverifiedClaims.length > 0) {
            recommendations.push(`Seek additional sources for ${unverifiedClaims.length} unverified claims`);
            recommendations.push('Add disclaimers for statements that cannot be verified');
        }
        
        const lowConfidenceClaims = this.extractedClaims.filter(c => 
            c.confidence_score < this.confidenceThreshold
        );
        
        if (lowConfidenceClaims.length > 0) {
            recommendations.push(`Review ${lowConfidenceClaims.length} claims with low confidence scores`);
        }
        
        if (recommendations.length === 0) {
            recommendations.push('All factual claims appear to be well-supported');
        }
        
        return recommendations;
    }

    /**
     * Flag disputed claims for attention
     */
    async flagDisputedClaims() {
        const disputedClaims = this.extractedClaims.filter(c => 
            c.verification_status === 'disputed' || 
            c.confidence_score < this.disputeThreshold
        );
        
        if (disputedClaims.length > 0) {
            await this.log('warn', 'Disputed claims identified', {
                disputedCount: disputedClaims.length,
                claims: disputedClaims.map(c => ({
                    id: c.claim_id,
                    statement: c.statement.substring(0, 100),
                    confidence: c.confidence_score
                }))
            });
        }
    }

    /**
     * Get agent capabilities
     */
    getCapabilities() {
        return [
            'claim_extraction',
            'fact_verification',
            'source_cross_reference',
            'confidence_scoring',
            'dispute_detection',
            'reliability_assessment',
            'verification_reporting'
        ];
    }

    /**
     * Check if agent can handle a specific task
     */
    canHandle(task) {
        if (!task || !task.type) {
            return false;
        }

        const supportedTypes = ['fact_checking', 'claim_verification', 'accuracy_validation'];
        return supportedTypes.includes(task.type);
    }

    /**
     * Categorize claim type based on content and pattern
     */
    categorizeClaimType(sentence, pattern) {
        const patternString = pattern.source || pattern.toString();
        
        if (patternString.includes('percent') || patternString.includes('%')) {
            return 'statistical';
        } else if (patternString.includes('\\d{4}') || patternString.includes('since')) {
            return 'temporal';
        } else if (patternString.includes('first|largest|most')) {
            return 'categorical';
        } else if (patternString.includes('causes|results')) {
            return 'causal';
        }
        
        return 'general';
    }

    /**
     * Calculate extraction confidence for a claim
     */
    calculateExtractionConfidence(sentence, matches) {
        let confidence = 0.6; // Base confidence
        
        // Higher confidence for specific patterns
        if (matches.some(match => /\d+/.test(match))) confidence += 0.2;
        if (sentence.length > 50 && sentence.length < 200) confidence += 0.1;
        if (sentence.includes('study') || sentence.includes('research')) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Get distribution of claim types
     */
    getClaimTypeDistribution() {
        const distribution = {};
        for (const claim of this.extractedClaims) {
            distribution[claim.claim_type] = (distribution[claim.claim_type] || 0) + 1;
        }
        return distribution;
    }

    /**
     * Extract keywords from text
     */
    extractKeywords(text) {
        // Simple keyword extraction
        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by']);
        
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
            .slice(0, 10); // Limit to top 10 keywords
    }

    /**
     * Update shared memory with fact-checking results
     */
    async updateContentConfidenceScores() {
        try {
            const sharedMemory = await this.getSharedMemory();
            
            if (!sharedMemory.value) {
                sharedMemory.value = {};
            }
            
            sharedMemory.value.factChecking = {
                status: 'completed',
                totalClaims: this.extractedClaims.length,
                verifiedClaims: this.extractedClaims.filter(c => c.verification_status === 'verified').length,
                disputedClaims: this.extractedClaims.filter(c => c.verification_status === 'disputed').length,
                overallAccuracy: this.extractedClaims.length > 0 
                    ? this.extractedClaims.filter(c => c.verification_status === 'verified').length / this.extractedClaims.length
                    : 1.0,
                completedAt: new Date().toISOString()
            };
            
            await this.updateSharedMemory(sharedMemory);
            await this.log('info', 'Shared memory updated with fact-checking results');
            
        } catch (error) {
            await this.log('error', 'Failed to update shared memory', { error: error.message });
        }
    }

    /**
     * Log verification metrics
     */
    async logVerificationMetrics() {
        const metrics = {
            totalClaims: this.extractedClaims.length,
            verifiedClaims: this.extractedClaims.filter(c => c.verification_status === 'verified').length,
            disputedClaims: this.extractedClaims.filter(c => c.verification_status === 'disputed').length,
            unverifiedClaims: this.extractedClaims.filter(c => c.verification_status === 'unverified').length,
            averageConfidence: this.extractedClaims.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / this.extractedClaims.length,
            sourcesUsed: this.sourceDatabase.length,
            executionTime: Date.now() - this.startTime
        };
        
        await this.log('info', 'FactCheckingAgent completion metrics', metrics);
    }
}

module.exports = { FactCheckingAgent };
