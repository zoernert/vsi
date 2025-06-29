const { BaseAgent } = require('./BaseAgent');

class LanguageAgent extends BaseAgent {
    constructor(agentId, sessionId, config, apiClient, databaseService = null) {
        super(agentId, sessionId, config, apiClient, databaseService);
        this.agentType = 'language';
        this.supportedLanguages = {
            'de': { name: 'German', patterns: /\b(der|die|das|und|oder|mit|von|zu|in|auf|für|ist|sind|wird|werden|kann|könnte|soll|sollte|muss|müssen|haben|hat|hatten|sein|war|waren)\b/gi },
            'en': { name: 'English', patterns: /\b(the|and|or|with|from|to|in|on|for|is|are|will|would|can|could|should|must|have|has|had|be|was|were)\b/gi },
            'fr': { name: 'French', patterns: /\b(le|la|les|et|ou|avec|de|du|à|dans|sur|pour|est|sont|sera|serait|peut|pourrait|doit|devrait|avoir|a|avait|être|était|étaient)\b/gi },
            'es': { name: 'Spanish', patterns: /\b(el|la|los|las|y|o|con|de|del|a|en|sobre|para|es|son|será|sería|puede|podría|debe|debería|tener|tiene|tenía|ser|era|eran)\b/gi }
        };
    }

    async performWork() {
        await this.log('info', 'Starting language detection and management', { progress: 10 });
        this.updateProgress(10, 'Analyzing research topic language');

        try {
            // 1. Detect language of research topic
            const researchTopic = this.config.inputs?.query || this.config.query || '';
            const detectedLanguage = await this.detectLanguage(researchTopic);
            
            await this.log('info', `Detected research topic language: ${detectedLanguage.name} (${detectedLanguage.code})`, {
                language: detectedLanguage,
                confidence: detectedLanguage.confidence
            });

            this.updateProgress(30, 'Analyzing available sources language');

            // 2. Analyze language of available sources
            const sourceLanguages = await this.analyzeSourceLanguages();
            
            this.updateProgress(50, 'Creating language strategy');

            // 3. Create language handling strategy
            const languageStrategy = await this.createLanguageStrategy(detectedLanguage, sourceLanguages);

            this.updateProgress(80, 'Storing language configuration');

            // 4. Store language configuration for other agents
            await this.storeMemory('language_config', {
                primaryLanguage: detectedLanguage,
                sourceLanguages: sourceLanguages,
                strategy: languageStrategy,
                instructions: this.generateLanguageInstructions(detectedLanguage, languageStrategy)
            });

            // 5. Create language artifact
            await this.createArtifact('language_configuration', {
                primaryLanguage: detectedLanguage,
                sourceLanguages: sourceLanguages,
                strategy: languageStrategy,
                instructions: languageStrategy.instructions,
                translationNeeded: languageStrategy.translationNeeded,
                qualityChecks: languageStrategy.qualityChecks
            }, {
                name: 'Language Configuration',
                description: 'Language detection and handling strategy for the research session'
            });

            this.updateProgress(100, 'Language analysis completed');
            await this.log('success', 'Language detection and configuration completed successfully');

        } catch (error) {
            await this.log('error', `Language agent execution failed: ${error.message}`, { error: error.stack });
            throw error;
        }
    }

    /**
     * Detect the primary language of the given text
     */
    async detectLanguage(text) {
        if (!text || text.trim().length === 0) {
            return { code: 'en', name: 'English', confidence: 0.5 }; // Default fallback
        }

        const scores = {};
        const textLower = text.toLowerCase();

        // Score each language based on pattern matches
        for (const [code, lang] of Object.entries(this.supportedLanguages)) {
            const matches = textLower.match(lang.patterns) || [];
            scores[code] = {
                code,
                name: lang.name,
                matches: matches.length,
                score: matches.length / text.split(/\s+/).length // Normalize by word count
            };
        }

        // Find the language with the highest score
        const detectedLang = Object.values(scores).reduce((best, current) => 
            current.score > best.score ? current : best
        );

        // Calculate confidence based on score difference
        const sortedScores = Object.values(scores).sort((a, b) => b.score - a.score);
        const confidence = sortedScores.length > 1 
            ? Math.min(0.95, Math.max(0.1, (sortedScores[0].score - sortedScores[1].score) + 0.3))
            : Math.min(0.95, detectedLang.score + 0.2);

        return {
            code: detectedLang.code,
            name: detectedLang.name,
            confidence: confidence,
            matches: detectedLang.matches,
            allScores: scores
        };
    }

    /**
     * Analyze the languages of available sources
     */
    async analyzeSourceLanguages() {
        try {
            await this.log('info', 'Analyzing source languages across collections');
            
            // Get collections and sample content
            const collections = await this.searchCollections(this.config.query || 'sample', { limit: 10 });
            const sourceLanguages = {};

            for (const collectionResult of collections.data || []) {
                const collection = collectionResult.collection;
                const results = collectionResult.results || [];

                for (const result of results.slice(0, 3)) { // Sample first 3 results
                    const content = result.content || result.contentPreview || '';
                    if (content.length > 50) { // Only analyze substantial content
                        const detectedLang = await this.detectLanguage(content);
                        
                        if (!sourceLanguages[detectedLang.code]) {
                            sourceLanguages[detectedLang.code] = {
                                ...detectedLang,
                                count: 0,
                                collections: new Set()
                            };
                        }
                        
                        sourceLanguages[detectedLang.code].count++;
                        sourceLanguages[detectedLang.code].collections.add(collection.name);
                    }
                }
            }

            // Convert sets to arrays for serialization
            for (const lang of Object.values(sourceLanguages)) {
                lang.collections = Array.from(lang.collections);
            }

            await this.log('info', `Found ${Object.keys(sourceLanguages).length} languages in sources`, { sourceLanguages });
            return sourceLanguages;

        } catch (error) {
            await this.log('warning', `Error analyzing source languages: ${error.message}`);
            return {}; // Return empty object on error
        }
    }

    /**
     * Create a language handling strategy
     */
    async createLanguageStrategy(primaryLanguage, sourceLanguages) {
        const strategy = {
            primaryLanguage: primaryLanguage.code,
            sourceLanguages: Object.keys(sourceLanguages),
            translationNeeded: false,
            instructions: '',
            qualityChecks: [],
            mixedLanguageHandling: 'maintain_primary'
        };

        // Determine if translation is needed
        const hasNonPrimaryLangSources = Object.keys(sourceLanguages)
            .some(lang => lang !== primaryLanguage.code);

        if (hasNonPrimaryLangSources) {
            strategy.translationNeeded = true;
            strategy.mixedLanguageHandling = 'translate_and_indicate';
        }

        // Generate specific instructions
        strategy.instructions = this.generateLanguageInstructions(primaryLanguage, strategy);

        // Define quality checks
        strategy.qualityChecks = [
            {
                type: 'language_consistency',
                description: `Ensure output is primarily in ${primaryLanguage.name}`,
                pattern: primaryLanguage.code === 'de' ? 'german_patterns' : 'english_patterns'
            },
            {
                type: 'terminology_consistency',
                description: 'Maintain consistent technical terminology',
                action: 'check_technical_terms'
            }
        ];

        if (strategy.translationNeeded) {
            strategy.qualityChecks.push({
                type: 'translation_accuracy',
                description: 'Verify translation accuracy for key concepts',
                action: 'validate_translations'
            });
        }

        return strategy;
    }

    /**
     * Generate language-specific instructions for other agents
     */
    generateLanguageInstructions(primaryLanguage, strategy) {
        const langCode = primaryLanguage.code;
        const langName = primaryLanguage.name;

        let instructions = `LANGUAGE REQUIREMENTS:\n`;
        instructions += `- Primary language: ${langName} (${langCode})\n`;
        instructions += `- ALL outputs, reports, and communications must be in ${langName}\n`;
        
        if (langCode === 'de') {
            instructions += `- Use formal German language style (Sie-Form)\n`;
            instructions += `- Maintain German technical terminology where appropriate\n`;
            instructions += `- Use German date and number formats\n`;
            instructions += `- Follow German academic/professional writing conventions\n`;
        } else if (langCode === 'en') {
            instructions += `- Use professional English writing style\n`;
            instructions += `- Maintain consistent terminology throughout\n`;
            instructions += `- Use clear, academic language structure\n`;
        }

        if (strategy.translationNeeded) {
            instructions += `- When incorporating content from other languages, translate it to ${langName}\n`;
            instructions += `- Indicate original language when referencing non-${langName} sources\n`;
            instructions += `- Preserve technical terms that are commonly used in their original language\n`;
        }

        instructions += `- Ensure cultural and linguistic appropriateness for ${langName} speakers\n`;
        instructions += `- Double-check that no text remains in other languages\n`;

        return instructions;
    }

    /**
     * Validate that text is in the expected language
     */
    async validateLanguage(text, expectedLanguage) {
        const detected = await this.detectLanguage(text);
        const isCorrectLanguage = detected.code === expectedLanguage && detected.confidence > 0.3;
        
        return {
            isValid: isCorrectLanguage,
            detected: detected,
            expected: expectedLanguage,
            confidence: detected.confidence,
            issues: isCorrectLanguage ? [] : [`Text appears to be in ${detected.name} but expected ${this.supportedLanguages[expectedLanguage]?.name || expectedLanguage}`]
        };
    }

    /**
     * Get language instructions for a specific agent type
     */
    getLanguageInstructionsForAgent(agentType) {
        // This could be called by other agents to get specific language guidance
        const sharedMemory = this.getSharedMemory('language_config');
        if (sharedMemory && sharedMemory.value) {
            return sharedMemory.value.instructions;
        }
        return 'Please maintain language consistency throughout your work.';
    }
}

module.exports = { LanguageAgent };
