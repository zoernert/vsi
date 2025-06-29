const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    }

    async generateResponse(systemPrompt, userMessage, context = '', options = {}) {
        try {
            // Default generation configuration - remove token limits for complete responses
            const defaultConfig = {
                temperature: 0.7,
                // Remove maxOutputTokens limit - let the model generate complete responses
                // maxOutputTokens can be set in options if needed for specific use cases
            };
            
            // Merge default config with provided options
            const generationConfig = { ...defaultConfig, ...options };
            
            // Only set maxOutputTokens if explicitly provided
            if (options.maxOutputTokens) {
                generationConfig.maxOutputTokens = options.maxOutputTokens;
            }

            console.log('🤖 Gemini generation config:', generationConfig);
            
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig
            });

            // Combine system prompt, context, and user message
            const fullPrompt = `${systemPrompt}\n\nContext:\n${context}\n\nUser Question: ${userMessage}`;

            console.log('🔄 Sending request to Gemini...');
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            let text = response.text();

            console.log('✅ Gemini response received');
            console.log(`📏 Response length: ${text.length} characters`);

            // Check for truncation indicators
            const truncationCheck = this.detectTruncation(text, fullPrompt);
            if (truncationCheck.isTruncated) {
                console.log('⚠️ Detected truncated response, attempting to continue...');
                
                // Try to continue the generation
                const continuedText = await this.continueGeneration(text, fullPrompt, generationConfig);
                if (continuedText) {
                    text = continuedText;
                    console.log(`📏 Extended response length: ${text.length} characters`);
                }
            }

            return text;
        } catch (error) {
            console.error('Error generating response with Gemini:', error.message);
            throw error;
        }
    }

    async generateChat(messages, systemPrompt = null) {
        try {
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig: {
                    temperature: 0.7,
                    // Remove maxOutputTokens limit for chat as well
                }
            });

            // Convert messages to Gemini format
            let prompt = '';
            if (systemPrompt) {
                prompt += `System: ${systemPrompt}\n\n`;
            }

            messages.forEach(msg => {
                prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            // Check for truncation in chat responses too
            const truncationCheck = this.detectTruncation(text, prompt);
            if (truncationCheck.isTruncated) {
                console.log('⚠️ Detected truncated chat response, attempting to continue...');
                const continuedText = await this.continueGeneration(text, prompt, { temperature: 0.7 });
                if (continuedText) {
                    text = continuedText;
                }
            }
            
            return text;
        } catch (error) {
            console.error('Error generating chat with Gemini:', error.message);
            throw error;
        }
    }

    async checkHealth() {
        try {
            const model = this.genAI.getGenerativeModel({ model: this.model });
            const result = await model.generateContent('Hello');
            return { status: 'healthy', model: this.model };
        } catch (error) {
            console.error('Gemini health check failed:', error.message);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Detect if a response was truncated
     */
    detectTruncation(text, originalPrompt) {
        const indicators = {
            // Common truncation patterns
            endsAbruptly: /[a-zA-Z0-9][.,:;]?\s*$/.test(text) && !text.match(/[.!?]\s*$/),
            endsWithEllipsis: /\.{3,}\s*$/.test(text),
            endsWithDash: /-\s*$/.test(text),
            endsWithComma: /,\s*$/.test(text),
            endsWithIncompleteWord: /\b[a-zA-Z]+$/.test(text) && !text.match(/\b(and|or|the|in|on|at|to|for|with|by|from|up|about|into|through|during|before|after|above|below|between|among|against|over|under)\s*$/i),
            
            // Language-specific patterns
            endsWithIncompleteGerman: /\b[a-zA-ZäöüßÄÖÜ]+$/.test(text) && !text.match(/\b(und|oder|der|die|das|in|auf|mit|von|zu|für|durch|während|vor|nach|über|unter|zwischen)\s*$/i),
            
            // Structure indicators
            noProperEnding: !text.match(/[.!?]\s*$/) && text.length > 100,
            incompleteSection: text.match(/^\s*#+\s+[^#]+$/m) && !text.match(/[.!?]\s*$/), // Markdown header without content
            incompleteList: text.match(/[-*]\s+[^.!?]*$/),
            
            // Content indicators
            tooShort: text.length < 200 && originalPrompt.length > 100, // Very short response to long prompt
            repetitiveEnding: /(.{10,})\1{2,}\s*$/.test(text) // Repetitive pattern at end
        };

        const truncationIndicators = Object.keys(indicators).filter(key => indicators[key]);
        const isTruncated = truncationIndicators.length > 0;

        if (isTruncated) {
            console.log(`🔍 Truncation detected with indicators: ${truncationIndicators.join(', ')}`);
        }

        return {
            isTruncated,
            indicators: truncationIndicators,
            originalLength: text.length,
            confidence: Math.min(1.0, truncationIndicators.length * 0.3)
        };
    }

    /**
     * Attempt to continue a truncated generation
     */
    async continueGeneration(truncatedText, originalPrompt, genConfig, maxAttempts = 2) {
        try {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                console.log(`🔄 Continuation attempt ${attempt}/${maxAttempts}`);
                
                // Create a continuation prompt
                const continuationPrompt = `${originalPrompt}\n\nPREVIOUS PARTIAL RESPONSE:\n${truncatedText}\n\nPlease continue and complete the response from where it left off. Do not repeat the previous content, just continue naturally and provide a complete ending:`;

                const model = this.genAI.getGenerativeModel({ 
                    model: this.model,
                    generationConfig: genConfig
                });

                const result = await model.generateContent(continuationPrompt);
                const response = await result.response;
                const continuationText = response.text();

                // Combine the texts
                const fullText = truncatedText + ' ' + continuationText;
                
                // Check if this continuation is also truncated
                const newTruncationCheck = this.detectTruncation(continuationText, continuationPrompt);
                
                if (!newTruncationCheck.isTruncated || attempt === maxAttempts) {
                    return fullText;
                }
                
                // If still truncated, try again with the combined text
                truncatedText = fullText;
            }

            return truncatedText; // Return what we have if all attempts failed
        } catch (error) {
            console.error('❌ Error in continuation generation:', error);
            return truncatedText; // Return original truncated text on error
        }
    }

    /**
     * Detect the language of the given text
     */
    async detectLanguage(text) {
        if (!text || text.trim().length === 0) {
            return { language: 'unknown', confidence: 0 };
        }

        // Simple pattern-based detection for common languages
        const patterns = {
            german: {
                keywords: ['der', 'die', 'das', 'und', 'oder', 'aber', 'mit', 'von', 'zu', 'in', 'auf', 'für', 'über', 'unter', 'bei', 'nach', 'vor', 'durch', 'gegen', 'ohne', 'um', 'schleupen', 'einarbeitung', 'schulungsunterlage', 'erstelle', 'können', 'müssen', 'sollen', 'werden', 'haben', 'sein', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr'],
                patterns: [
                    /\b(der|die|das)\s+\w+/gi,
                    /\w+ung\b/gi,
                    /\w+keit\b/gi,
                    /\w+lich\b/gi,
                    /\w+isch\b/gi,
                    /ß/g
                ]
            },
            english: {
                keywords: ['the', 'and', 'or', 'but', 'with', 'from', 'to', 'in', 'on', 'for', 'over', 'under', 'at', 'after', 'before', 'through', 'against', 'without', 'around', 'create', 'comprehensive', 'training', 'materials', 'can', 'must', 'should', 'will', 'have', 'be', 'i', 'you', 'he', 'she', 'it', 'we', 'they'],
                patterns: [
                    /\b(the|a|an)\s+\w+/gi,
                    /\w+ing\b/gi,
                    /\w+ed\b/gi,
                    /\w+ly\b/gi,
                    /\w+tion\b/gi
                ]
            }
        };

        const scores = {};
        const textLower = text.toLowerCase();

        // Score based on keyword frequency
        for (const [lang, config] of Object.entries(patterns)) {
            let score = 0;
            let matches = 0;

            // Check keywords
            for (const keyword of config.keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const keywordMatches = (textLower.match(regex) || []).length;
                if (keywordMatches > 0) {
                    score += keywordMatches * 2; // Weight keywords higher
                    matches += keywordMatches;
                }
            }

            // Check patterns
            for (const pattern of config.patterns) {
                const patternMatches = (text.match(pattern) || []).length;
                if (patternMatches > 0) {
                    score += patternMatches;
                    matches += patternMatches;
                }
            }

            scores[lang] = {
                score,
                matches,
                confidence: Math.min(score / Math.max(text.split(' ').length, 1), 1)
            };
        }

        // Determine the most likely language
        const sortedLanguages = Object.entries(scores)
            .sort(([,a], [,b]) => b.score - a.score);

        if (sortedLanguages.length === 0 || sortedLanguages[0][1].score === 0) {
            return { language: 'unknown', confidence: 0, scores };
        }

        const [bestLanguage, bestScore] = sortedLanguages[0];
        return {
            language: bestLanguage,
            confidence: Math.min(bestScore.confidence, 0.95), // Cap confidence at 95%
            scores,
            matches: bestScore.matches
        };
    }

    /**
     * Generate language-appropriate instructions for LLM prompts
     */
    generateLanguageInstructions(detectedLanguage, userQuery) {
        const instructions = {
            german: {
                responseLanguage: 'Antworte auf Deutsch',
                formatting: 'Verwende deutsche Formatierung und Terminologie',
                context: 'Berücksichtige den deutschen Kontext und kulturelle Besonderheiten',
                completeness: 'Stelle sicher, dass die Antwort vollständig ist und nicht abgeschnitten wird'
            },
            english: {
                responseLanguage: 'Respond in English',
                formatting: 'Use English formatting and terminology',
                context: 'Consider English-speaking context and cultural aspects',
                completeness: 'Ensure the response is complete and not truncated'
            },
            unknown: {
                responseLanguage: 'Respond in the same language as the user query',
                formatting: 'Use appropriate formatting for the detected language',
                context: 'Maintain cultural and linguistic consistency',
                completeness: 'Ensure the response is complete and not truncated'
            }
        };

        const lang = instructions[detectedLanguage] || instructions.unknown;
        
        return `
IMPORTANT LANGUAGE INSTRUCTIONS:
- ${lang.responseLanguage}
- ${lang.formatting}
- ${lang.context}
- ${lang.completeness}

User query language appears to be: ${detectedLanguage}
Original query: "${userQuery}"

Please follow these language guidelines strictly throughout your entire response.
        `.trim();
    }
}

module.exports = { GeminiService };
