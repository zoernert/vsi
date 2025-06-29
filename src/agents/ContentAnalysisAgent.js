const { BaseAgent } = require('./BaseAgent');
const { ExternalContentService } = require('../services/externalContentService');

class ContentAnalysisAgent extends BaseAgent {
    constructor(agentId, sessionId, config, apiClient) {
        super(agentId, sessionId, config, apiClient);
        this.analysisFrameworks = config.analysisFrameworks || config.inputs?.analysisFrameworks || ['thematic', 'sentiment'];
        this.maxContextSize = config.maxContextSize || config.inputs?.maxContextSize || 4000;
        this.analyzedContent = [];
        this.themes = new Map();
        this.insights = [];
        
        // Initialize external content service if enabled
        if (config.useExternalSources) {
            console.log(`🌐 Initializing external content service for ContentAnalysisAgent`);
            this.externalContentService = new ExternalContentService(config.externalContent || {});
        }
    }

    async performWork() {
        console.log(`🔬 Starting content analysis with frameworks: ${this.analysisFrameworks.join(', ')}`);
        
        // Wait for source discovery to complete
        this.updateProgress(5, 'Waiting for source discovery');
        await this.waitForDependencies(['source_discovery']);
        
        this.updateProgress(15, 'Performing deep content analysis');
        await this.performDeepContentAnalysis();
        
        // External content analysis (if enabled)
        let externalAnalysis = null;
        if (this.externalContentService) {
            try {
                this.updateProgress(35, 'Analyzing external sources');
                
                // Check if external URLs were provided in the task
                const taskData = await this.getSharedMemory('current_task') || {};
                const externalUrls = taskData.externalUrls || [];
                
                // Discover additional external sources if none provided
                let urlsToAnalyze = [...externalUrls];
                if (urlsToAnalyze.length === 0 && taskData.query) {
                    const discoveredUrls = await this.discoverExternalSources(taskData.query, 3);
                    urlsToAnalyze = discoveredUrls;
                }
                
                if (urlsToAnalyze.length > 0) {
                    externalAnalysis = await this.analyzeExternalContent(urlsToAnalyze, taskData.analysisType);
                    
                    if (externalAnalysis && externalAnalysis.length > 0) {
                        console.log(`🌐 Successfully analyzed ${externalAnalysis.length} external sources`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ External content analysis failed, continuing with internal analysis only:`, error.message);
            }
        }
        
        this.updateProgress(50, 'Identifying key themes');
        await this.identifyKeyThemes();
        
        this.updateProgress(75, 'Extracting insights');
        await this.extractInsights();
        
        // Combine internal and external analysis if external data is available
        if (externalAnalysis && externalAnalysis.length > 0) {
            this.updateProgress(85, 'Combining internal and external analysis');
            const combinedResults = this.combineAnalysis({
                themes: Array.from(this.themes.values()),
                insights: this.insights,
                sources: this.analyzedContent.length - externalAnalysis.length
            }, externalAnalysis);
            
            console.log(`🔗 Combined analysis completed with ${combinedResults.sources.total} total sources (${combinedResults.sources.internal} internal, ${combinedResults.sources.external} external)`);
        }
        
        this.updateProgress(90, 'Creating analysis report');
        await this.createAnalysisReport();
        
        this.updateProgress(100, 'Content analysis completed');
        
        // Store completion signal for dependent agents
        await this.storeSharedMemory('content_analysis_completed', {
            status: 'completed',
            timestamp: new Date(),
            analysisCount: this.analyzedContent.length,
            themeCount: this.themes.size,
            insightCount: this.insights.length,
            externalSourcesAnalyzed: externalAnalysis ? externalAnalysis.length : 0
        });
    }

    async performDeepContentAnalysis() {
        try {
            console.log(`🔍 Performing deep content analysis`);
            
            // Get curated sources from source discovery agent
            const curatedSources = await this.getSharedMemory('curated_sources');
            if (!curatedSources || !curatedSources.value) {
                throw new Error('Curated sources not found. Ensure source discovery agent has completed.');
            }
            
            const sources = curatedSources.value;
            console.log(`📚 Analyzing ${sources.length} curated sources`);
            
            const analysisResults = [];
            
            for (let i = 0; i < sources.length; i++) {
                const source = sources[i];
                this.updateProgress(15 + (i / sources.length) * 30, `Analyzing source ${i + 1}/${sources.length}`);
                
                try {
                    // Generate smart context for detailed analysis
                    let context = null;
                    if (source.collectionId) {
                        const contextResponse = await this.generateSmartContext(
                            source.collectionId,
                            this.config.query || 'comprehensive analysis',
                            {
                                maxContextSize: this.maxContextSize,
                                strategy: 'relevance',
                                includeMetadata: true
                            }
                        );
                        
                        if (contextResponse.success) {
                            context = contextResponse.data;
                        }
                    }
                    
                    // Perform multi-framework analysis
                    const analysis = await this.analyzeContent(source, context, this.analysisFrameworks);
                    
                    analysisResults.push({
                        sourceId: source.id,
                        collectionId: source.collectionId,
                        collectionName: source.collectionName,
                        analysis: analysis,
                        themes: analysis.themes || [],
                        insights: analysis.insights || [],
                        sentiment: analysis.sentiment,
                        concepts: analysis.concepts || [],
                        quality: analysis.quality || {},
                        processedAt: new Date()
                    });
                    
                    console.log(`✅ Analyzed source ${source.id} - found ${analysis.themes?.length || 0} themes`);
                } catch (error) {
                    console.warn(`⚠️ Error analyzing source ${source.id}:`, error.message);
                    // Continue with other sources
                }
            }
            
            this.analyzedContent = analysisResults;
            
            // Store analysis results
            await this.storeMemory('content_analysis', {
                results: analysisResults,
                frameworks: this.analysisFrameworks,
                totalSources: sources.length,
                analyzedSources: analysisResults.length,
                analysisTimestamp: new Date(),
                statistics: this.calculateAnalysisStatistics(analysisResults)
            });
            
            console.log(`✅ Deep content analysis completed: ${analysisResults.length}/${sources.length} sources analyzed`);
            return analysisResults;
        } catch (error) {
            console.error(`❌ Error performing content analysis:`, error);
            throw error;
        }
    }

    async analyzeContent(source, context, frameworks) {
        const analysis = {
            sourceId: source.id,
            frameworks: frameworks,
            themes: [],
            insights: [],
            sentiment: null,
            concepts: [],
            quality: {},
            confidence: 0.0
        };
        
        // Use the source content or context for analysis
        const contentToAnalyze = context?.content || source.content || '';
        if (!contentToAnalyze) {
            console.warn(`⚠️ No content available for analysis of source ${source.id}`);
            return analysis;
        }
        
        // Apply each analysis framework
        for (const framework of frameworks) {
            try {
                const frameworkResult = await this.applyAnalysisFramework(framework, contentToAnalyze, source);
                
                // Merge results based on framework type
                switch (framework) {
                    case 'thematic':
                        analysis.themes.push(...frameworkResult.themes);
                        analysis.concepts.push(...frameworkResult.concepts);
                        break;
                    case 'sentiment':
                        analysis.sentiment = frameworkResult.sentiment;
                        break;
                    case 'conceptual':
                        analysis.concepts.push(...frameworkResult.concepts);
                        break;
                    case 'structural':
                        analysis.quality = { ...analysis.quality, ...frameworkResult.quality };
                        break;
                    case 'temporal':
                        analysis.insights.push(...frameworkResult.insights);
                        break;
                }
                
                // Aggregate insights
                if (frameworkResult.insights) {
                    analysis.insights.push(...frameworkResult.insights);
                }
            } catch (error) {
                console.warn(`⚠️ Error applying ${framework} framework:`, error.message);
            }
        }
        
        // Calculate overall confidence
        analysis.confidence = this.calculateAnalysisConfidence(analysis);
        
        return analysis;
    }

    async applyAnalysisFramework(framework, content, source) {
        switch (framework) {
            case 'thematic':
                return await this.performThematicAnalysis(content, source);
            case 'sentiment':
                return await this.performSentimentAnalysis(content, source);
            case 'conceptual':
                return await this.performConceptualAnalysis(content, source);
            case 'structural':
                return await this.performStructuralAnalysis(content, source);
            case 'temporal':
                return await this.performTemporalAnalysis(content, source);
            default:
                console.warn(`⚠️ Unknown analysis framework: ${framework}`);
                return { themes: [], insights: [], concepts: [] };
        }
    }

    async performThematicAnalysis(content, source) {
        console.log(`🎯 Performing thematic analysis`);
        
        // Extract themes through keyword analysis and pattern recognition
        const themes = [];
        const concepts = [];
        const insights = [];
        
        // Simple keyword-based theme extraction
        const themePatterns = this.getThemePatterns();
        const words = content.toLowerCase().match(/\b\w+\b/g) || [];
        const wordFreq = {};
        
        // Count word frequencies
        for (const word of words) {
            if (word.length > 3) { // Ignore short words
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        }
        
        // Identify themes based on patterns and frequency
        for (const [themeCategory, patterns] of Object.entries(themePatterns)) {
            let themeScore = 0;
            const matchedTerms = [];
            
            for (const pattern of patterns) {
                const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
                const matches = content.match(regex) || [];
                if (matches.length > 0) {
                    themeScore += matches.length;
                    matchedTerms.push(...matches);
                }
            }
            
            if (themeScore > 0) {
                themes.push({
                    category: themeCategory,
                    score: themeScore,
                    confidence: Math.min(1.0, themeScore / 10),
                    evidence: matchedTerms.slice(0, 5), // Top 5 pieces of evidence
                    frequency: themeScore / words.length
                });
            }
        }
        
        // Extract key concepts (most frequent meaningful terms)
        const sortedWords = Object.entries(wordFreq)
            .filter(([word, freq]) => freq > 1 && word.length > 4)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 20);
        
        for (const [word, frequency] of sortedWords) {
            concepts.push({
                term: word,
                frequency: frequency,
                relevance: frequency / words.length,
                type: 'keyword'
            });
        }
        
        // Generate thematic insights
        if (themes.length > 0) {
            const dominantTheme = themes.reduce((max, theme) => theme.score > max.score ? theme : max);
            insights.push({
                type: 'thematic',
                category: 'dominant_theme',
                content: `Dominant theme identified: ${dominantTheme.category} (confidence: ${(dominantTheme.confidence * 100).toFixed(0)}%)`,
                confidence: dominantTheme.confidence,
                evidence: dominantTheme.evidence
            });
            
            if (themes.length > 1) {
                insights.push({
                    type: 'thematic',
                    category: 'theme_diversity',
                    content: `Multiple themes detected (${themes.length} total), indicating rich content diversity`,
                    confidence: 0.8,
                    themes: themes.map(t => t.category)
                });
            }
        }
        
        return { themes, concepts, insights };
    }

    async performSentimentAnalysis(content, source) {
        console.log(`😊 Performing sentiment analysis`);
        
        // Simple sentiment analysis using word lists
        const positiveWords = ['good', 'great', 'excellent', 'positive', 'beneficial', 'effective', 'successful', 'improvement', 'advantage', 'opportunity', 'innovation', 'progress', 'growth', 'success'];
        const negativeWords = ['bad', 'poor', 'negative', 'problem', 'issue', 'challenge', 'difficulty', 'failure', 'decline', 'risk', 'threat', 'concern', 'limitation', 'weakness'];
        
        const words = content.toLowerCase().match(/\b\w+\b/g) || [];
        
        let positiveScore = 0;
        let negativeScore = 0;
        let neutralScore = 0;
        
        const sentimentEvidence = {
            positive: [],
            negative: [],
            neutral: []
        };
        
        for (const word of words) {
            if (positiveWords.includes(word)) {
                positiveScore++;
                sentimentEvidence.positive.push(word);
            } else if (negativeWords.includes(word)) {
                negativeScore++;
                sentimentEvidence.negative.push(word);
            } else {
                neutralScore++;
            }
        }
        
        const totalWords = words.length;
        const sentiment = {
            overall: this.calculateOverallSentiment(positiveScore, negativeScore, neutralScore),
            scores: {
                positive: positiveScore / totalWords,
                negative: negativeScore / totalWords,
                neutral: neutralScore / totalWords
            },
            confidence: Math.min(1.0, (positiveScore + negativeScore) / (totalWords * 0.1)),
            evidence: sentimentEvidence
        };
        
        const insights = [{
            type: 'sentiment',
            category: 'overall_tone',
            content: `Content sentiment: ${sentiment.overall} (${(sentiment.confidence * 100).toFixed(0)}% confidence)`,
            confidence: sentiment.confidence,
            sentiment: sentiment
        }];
        
        return { sentiment, insights };
    }

    async performConceptualAnalysis(content, source) {
        console.log(`💡 Performing conceptual analysis`);
        
        const concepts = [];
        const insights = [];
        
        // Extract noun phrases and entities
        const sentences = content.split(/[.!?]+/);
        const conceptTerms = new Set();
        
        // Simple noun phrase extraction
        for (const sentence of sentences) {
            const words = sentence.trim().split(/\s+/);
            
            // Look for capitalized words (potential entities/concepts)
            for (let i = 0; i < words.length; i++) {
                const word = words[i].replace(/[^\w]/g, '');
                if (word.length > 2 && word[0] === word[0].toUpperCase()) {
                    conceptTerms.add(word.toLowerCase());
                }
            }
            
            // Look for compound terms
            for (let i = 0; i < words.length - 1; i++) {
                const compound = `${words[i]} ${words[i + 1]}`.toLowerCase().replace(/[^\w\s]/g, '');
                if (compound.length > 5) {
                    conceptTerms.add(compound);
                }
            }
        }
        
        // Convert to concept objects
        for (const term of conceptTerms) {
            const frequency = (content.toLowerCase().match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
            if (frequency > 0) {
                concepts.push({
                    term: term,
                    frequency: frequency,
                    type: 'concept',
                    relevance: frequency / sentences.length
                });
            }
        }
        
        // Sort by relevance
        concepts.sort((a, b) => b.relevance - a.relevance);
        
        if (concepts.length > 0) {
            insights.push({
                type: 'conceptual',
                category: 'key_concepts',
                content: `Identified ${concepts.length} key concepts, with "${concepts[0].term}" being most prominent`,
                confidence: 0.7,
                concepts: concepts.slice(0, 10)
            });
        }
        
        return { concepts, insights };
    }

    async performStructuralAnalysis(content, source) {
        console.log(`🏗️ Performing structural analysis`);
        
        const quality = {};
        const insights = [];
        
        // Analyze content structure
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        const words = content.match(/\b\w+\b/g) || [];
        
        // Calculate readability metrics
        const avgWordsPerSentence = words.length / sentences.length;
        const avgSentencesPerParagraph = sentences.length / paragraphs.length;
        
        quality.wordCount = words.length;
        quality.sentenceCount = sentences.length;
        quality.paragraphCount = paragraphs.length;
        quality.avgWordsPerSentence = avgWordsPerSentence;
        quality.avgSentencesPerParagraph = avgSentencesPerParagraph;
        quality.readabilityScore = this.calculateReadabilityScore(avgWordsPerSentence, sentences);
        
        // Assess content completeness
        quality.completeness = this.assessContentCompleteness(content, source);
        
        // Generate structural insights
        if (quality.readabilityScore > 0.7) {
            insights.push({
                type: 'structural',
                category: 'readability',
                content: `Content has good readability (score: ${(quality.readabilityScore * 100).toFixed(0)}%)`,
                confidence: 0.8,
                score: quality.readabilityScore
            });
        } else if (quality.readabilityScore < 0.4) {
            insights.push({
                type: 'structural',
                category: 'readability',
                content: `Content may be difficult to read (score: ${(quality.readabilityScore * 100).toFixed(0)}%)`,
                confidence: 0.7,
                score: quality.readabilityScore
            });
        }
        
        return { quality, insights };
    }

    async performTemporalAnalysis(content, source) {
        console.log(`⏰ Performing temporal analysis`);
        
        const insights = [];
        
        // Look for temporal indicators
        const timePatterns = {
            recent: ['recent', 'recently', 'current', 'now', 'today', 'this year', '2024', '2025'],
            historical: ['past', 'previous', 'earlier', 'before', 'history', 'traditional'],
            future: ['future', 'upcoming', 'will', 'predict', 'forecast', 'expect', 'plan']
        };
        
        const temporalScores = {};
        
        for (const [period, patterns] of Object.entries(timePatterns)) {
            let score = 0;
            for (const pattern of patterns) {
                const matches = content.toLowerCase().match(new RegExp(`\\b${pattern}\\b`, 'g')) || [];
                score += matches.length;
            }
            temporalScores[period] = score;
        }
        
        // Determine temporal focus
        const dominantPeriod = Object.entries(temporalScores).reduce((max, [period, score]) => 
            score > max[1] ? [period, score] : max
        );
        
        if (dominantPeriod[1] > 0) {
            insights.push({
                type: 'temporal',
                category: 'time_focus',
                content: `Content has a ${dominantPeriod[0]} temporal focus`,
                confidence: Math.min(1.0, dominantPeriod[1] / 10),
                temporalScores
            });
        }
        
        // Check for date mentions
        const datePattern = /\b(19|20)\d{2}\b/g;
        const dates = content.match(datePattern) || [];
        if (dates.length > 0) {
            const uniqueDates = [...new Set(dates)].sort();
            insights.push({
                type: 'temporal',
                category: 'date_references',
                content: `References to specific years: ${uniqueDates.join(', ')}`,
                confidence: 0.9,
                dates: uniqueDates
            });
        }
        
        return { insights };
    }

    getThemePatterns() {
        return {
            technology: ['technology', 'digital', 'software', 'computer', 'internet', 'data', 'algorithm', 'artificial', 'intelligence', 'machine', 'learning'],
            business: ['business', 'market', 'economic', 'financial', 'revenue', 'profit', 'customer', 'strategy', 'management', 'organization'],
            innovation: ['innovation', 'creative', 'new', 'novel', 'breakthrough', 'advancement', 'development', 'research', 'discovery'],
            sustainability: ['sustainable', 'environment', 'green', 'climate', 'renewable', 'carbon', 'emissions', 'ecological', 'conservation'],
            social: ['social', 'community', 'people', 'human', 'society', 'culture', 'relationship', 'communication', 'collaboration'],
            education: ['education', 'learning', 'teaching', 'student', 'knowledge', 'training', 'skill', 'academic', 'university'],
            health: ['health', 'medical', 'healthcare', 'patient', 'treatment', 'therapy', 'wellness', 'disease', 'medicine']
        };
    }

    calculateOverallSentiment(positive, negative, neutral) {
        const total = positive + negative + neutral;
        if (total === 0) return 'neutral';
        
        const posRatio = positive / total;
        const negRatio = negative / total;
        
        if (posRatio > negRatio * 1.5) return 'positive';
        if (negRatio > posRatio * 1.5) return 'negative';
        return 'neutral';
    }

    calculateReadabilityScore(avgWordsPerSentence, sentences) {
        // Simple readability calculation
        // Ideal: 15-20 words per sentence
        const idealRange = avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25;
        const lengthScore = idealRange ? 1.0 : Math.max(0, 1.0 - Math.abs(avgWordsPerSentence - 17.5) / 17.5);
        
        // Check for sentence variety
        const lengths = sentences.map(s => s.split(/\s+/).length);
        const variance = this.calculateVariance(lengths);
        const varietyScore = Math.min(1.0, variance / 50); // Normalize variance
        
        return (lengthScore * 0.7) + (varietyScore * 0.3);
    }

    calculateVariance(numbers) {
        if (numbers.length === 0) return 0;
        const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
        const variance = numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
        return variance;
    }

    assessContentCompleteness(content, source) {
        // Assess how complete the content appears to be
        let completeness = 0.5; // Base score
        
        // Check for introduction/conclusion patterns
        if (content.toLowerCase().includes('introduction') || content.toLowerCase().includes('overview')) {
            completeness += 0.1;
        }
        
        if (content.toLowerCase().includes('conclusion') || content.toLowerCase().includes('summary')) {
            completeness += 0.1;
        }
        
        // Check for structured elements
        if (content.includes('\n') && content.split('\n').length > 3) {
            completeness += 0.1; // Has paragraphs
        }
        
        // Check for references or citations
        if (content.includes('http') || content.includes('www') || /\[\d+\]/.test(content)) {
            completeness += 0.1; // Has references
        }
        
        // Length-based completeness
        if (content.length > 1000) completeness += 0.1;
        if (content.length > 3000) completeness += 0.1;
        
        return Math.min(1.0, completeness);
    }

    calculateAnalysisConfidence(analysis) {
        let confidence = 0.0;
        let factors = 0;
        
        // Theme confidence
        if (analysis.themes.length > 0) {
            const avgThemeConfidence = analysis.themes.reduce((sum, t) => sum + (t.confidence || 0), 0) / analysis.themes.length;
            confidence += avgThemeConfidence;
            factors++;
        }
        
        // Sentiment confidence
        if (analysis.sentiment) {
            confidence += analysis.sentiment.confidence || 0;
            factors++;
        }
        
        // Concept confidence
        if (analysis.concepts.length > 0) {
            confidence += Math.min(1.0, analysis.concepts.length / 10); // Normalize by expected concept count
            factors++;
        }
        
        // Quality confidence
        if (analysis.quality && analysis.quality.completeness) {
            confidence += analysis.quality.completeness;
            factors++;
        }
        
        return factors > 0 ? confidence / factors : 0.5;
    }

    calculateAnalysisStatistics(results) {
        if (results.length === 0) return {};
        
        const stats = {
            totalSources: results.length,
            avgConfidence: results.reduce((sum, r) => sum + (r.analysis.confidence || 0), 0) / results.length,
            themeDistribution: {},
            sentimentDistribution: { positive: 0, negative: 0, neutral: 0 },
            conceptCount: 0,
            avgQuality: 0
        };
        
        // Theme distribution
        for (const result of results) {
            for (const theme of result.themes || []) {
                const category = theme.category || 'unknown';
                stats.themeDistribution[category] = (stats.themeDistribution[category] || 0) + 1;
            }
            
            // Sentiment distribution
            if (result.sentiment) {
                const sentiment = result.sentiment.overall || 'neutral';
                stats.sentimentDistribution[sentiment]++;
            }
            
            // Concept count
            stats.conceptCount += (result.concepts || []).length;
            
            // Quality
            if (result.analysis.quality && result.analysis.quality.completeness) {
                stats.avgQuality += result.analysis.quality.completeness;
            }
        }
        
        stats.avgQuality /= results.length;
        stats.avgConceptsPerSource = stats.conceptCount / results.length;
        
        return stats;
    }

    async identifyKeyThemes() {
        try {
            console.log(`🎨 Identifying key themes across all analyzed content`);
            
            const analysisData = await this.retrieveMemory('content_analysis');
            if (!analysisData || !analysisData.data.results) {
                throw new Error('Content analysis results not found');
            }
            
            const results = analysisData.data.results;
            
            // Aggregate themes across all sources
            const themeAggregation = new Map();
            
            for (const result of results) {
                for (const theme of result.themes || []) {
                    const category = theme.category;
                    if (!themeAggregation.has(category)) {
                        themeAggregation.set(category, {
                            category: category,
                            totalScore: 0,
                            occurrences: 0,
                            avgConfidence: 0,
                            sources: [],
                            evidence: []
                        });
                    }
                    
                    const aggregated = themeAggregation.get(category);
                    aggregated.totalScore += theme.score || 0;
                    aggregated.occurrences++;
                    aggregated.avgConfidence += theme.confidence || 0;
                    aggregated.sources.push(result.sourceId);
                    aggregated.evidence.push(...(theme.evidence || []));
                }
            }
            
            // Calculate final theme scores
            const keyThemes = [];
            for (const [category, data] of themeAggregation.entries()) {
                data.avgConfidence /= data.occurrences;
                data.avgScore = data.totalScore / data.occurrences;
                data.prevalence = data.occurrences / results.length;
                data.overallScore = (data.avgScore * 0.4) + (data.avgConfidence * 0.3) + (data.prevalence * 0.3);
                
                keyThemes.push(data);
            }
            
            // Sort by overall score
            keyThemes.sort((a, b) => b.overallScore - a.overallScore);
            
            // Identify cross-theme relationships
            const themeRelationships = this.identifyThemeRelationships(results);
            
            // Create theme analysis artifact
            const themeAnalysis = {
                keyThemes: keyThemes,
                themeRelationships: themeRelationships,
                statistics: {
                    totalThemes: keyThemes.length,
                    avgThemesPerSource: keyThemes.reduce((sum, t) => sum + t.occurrences, 0) / results.length,
                    dominantTheme: keyThemes.length > 0 ? keyThemes[0] : null,
                    themeConcentration: this.calculateThemeConcentration(keyThemes)
                },
                crossReferences: this.findThemeCrossReferences(results),
                analyzedAt: new Date()
            };
            
            await this.createArtifact('theme_analysis', themeAnalysis);
            
            // Store for other agents
            this.themes = themeAggregation;
            await this.storeSharedMemory('key_themes', keyThemes);
            
            console.log(`✅ Identified ${keyThemes.length} key themes`);
            return themeAnalysis;
        } catch (error) {
            console.error(`❌ Error identifying key themes:`, error);
            throw error;
        }
    }

    identifyThemeRelationships(results) {
        const relationships = [];
        const themeCooccurrence = new Map();
        
        // Analyze theme co-occurrence in sources
        for (const result of results) {
            const themes = (result.themes || []).map(t => t.category);
            
            for (let i = 0; i < themes.length; i++) {
                for (let j = i + 1; j < themes.length; j++) {
                    const pair = [themes[i], themes[j]].sort().join('|');
                    themeCooccurrence.set(pair, (themeCooccurrence.get(pair) || 0) + 1);
                }
            }
        }
        
        // Convert to relationship objects
        for (const [pair, count] of themeCooccurrence.entries()) {
            const [theme1, theme2] = pair.split('|');
            relationships.push({
                theme1,
                theme2,
                cooccurrence: count,
                strength: count / results.length,
                type: 'cooccurrence'
            });
        }
        
        return relationships.sort((a, b) => b.strength - a.strength);
    }

    calculateThemeConcentration(themes) {
        if (themes.length === 0) return 0;
        
        const totalOccurrences = themes.reduce((sum, t) => sum + t.occurrences, 0);
        const topThemeOccurrences = themes[0]?.occurrences || 0;
        
        return topThemeOccurrences / totalOccurrences;
    }

    findThemeCrossReferences(results) {
        const crossRefs = {};
        
        for (const result of results) {
            const sourceThemes = (result.themes || []).map(t => t.category);
            
            for (const theme of sourceThemes) {
                if (!crossRefs[theme]) {
                    crossRefs[theme] = {
                        sources: [],
                        relatedThemes: new Set()
                    };
                }
                
                crossRefs[theme].sources.push({
                    sourceId: result.sourceId,
                    collectionName: result.collectionName
                });
                
                // Add related themes from same source
                for (const relatedTheme of sourceThemes) {
                    if (relatedTheme !== theme) {
                        crossRefs[theme].relatedThemes.add(relatedTheme);
                    }
                }
            }
        }
        
        // Convert Sets to Arrays for serialization
        for (const theme of Object.keys(crossRefs)) {
            crossRefs[theme].relatedThemes = Array.from(crossRefs[theme].relatedThemes);
        }
        
        return crossRefs;
    }

    async extractInsights() {
        try {
            console.log(`💡 Extracting insights from analysis`);
            
            const analysisData = await this.retrieveMemory('content_analysis');
            const themeData = await this.retrieveMemory('theme_analysis');
            
            if (!analysisData || !themeData) {
                throw new Error('Required analysis data not found');
            }
            
            const results = analysisData.data.results;
            const insights = [];
            
            // Extract insights from individual analyses
            for (const result of results) {
                insights.push(...(result.insights || []));
            }
            
            // Generate cross-cutting insights
            const crossCuttingInsights = await this.generateCrossCuttingInsights(results, themeData.data);
            insights.push(...crossCuttingInsights);
            
            // Prioritize and rank insights
            const rankedInsights = this.rankInsights(insights);
            
            // Create insights artifact
            const insightsAnalysis = {
                totalInsights: insights.length,
                rankedInsights: rankedInsights,
                insightCategories: this.categorizeInsights(insights),
                keyFindings: rankedInsights.slice(0, 10), // Top 10 insights
                confidenceDistribution: this.calculateInsightConfidenceDistribution(insights),
                extractedAt: new Date()
            };
            
            await this.createArtifact('insights_analysis', insightsAnalysis);
            
            // Store for other agents
            this.insights = rankedInsights;
            await this.storeSharedMemory('extracted_insights', rankedInsights);
            
            console.log(`✅ Extracted ${insights.length} insights, ${rankedInsights.slice(0, 10).length} key findings identified`);
            return insightsAnalysis;
        } catch (error) {
            console.error(`❌ Error extracting insights:`, error);
            throw error;
        }
    }

    async generateCrossCuttingInsights(results, themeAnalysis) {
        const insights = [];
        
        // Insight about theme diversity
        if (themeAnalysis.keyThemes.length > 1) {
            insights.push({
                type: 'meta',
                category: 'theme_diversity',
                content: `Analysis reveals ${themeAnalysis.keyThemes.length} distinct themes, indicating rich content diversity`,
                confidence: 0.8,
                evidence: themeAnalysis.keyThemes.map(t => t.category),
                priority: 'high'
            });
        }
        
        // Insight about dominant patterns
        if (themeAnalysis.statistics.dominantTheme) {
            const dominantTheme = themeAnalysis.statistics.dominantTheme;
            insights.push({
                type: 'meta',
                category: 'dominant_pattern',
                content: `"${dominantTheme.category}" emerges as the dominant theme with ${(dominantTheme.prevalence * 100).toFixed(0)}% prevalence across sources`,
                confidence: dominantTheme.avgConfidence,
                evidence: [`Appeared in ${dominantTheme.occurrences} sources`],
                priority: 'high'
            });
        }
        
        // Insight about sentiment patterns
        const sentiments = results.map(r => r.sentiment?.overall).filter(s => s);
        if (sentiments.length > 0) {
            const sentimentCounts = sentiments.reduce((acc, s) => {
                acc[s] = (acc[s] || 0) + 1;
                return acc;
            }, {});
            
            const dominantSentiment = Object.entries(sentimentCounts).reduce((max, [sent, count]) => 
                count > max[1] ? [sent, count] : max
            );
            
            insights.push({
                type: 'meta',
                category: 'sentiment_pattern',
                content: `Overall sentiment is predominantly ${dominantSentiment[0]} (${(dominantSentiment[1] / sentiments.length * 100).toFixed(0)}% of sources)`,
                confidence: 0.7,
                evidence: [JSON.stringify(sentimentCounts)],
                priority: 'medium'
            });
        }
        
        // Insight about content quality
        const qualityScores = results.map(r => r.analysis.quality?.completeness).filter(q => q !== undefined);
        if (qualityScores.length > 0) {
            const avgQuality = qualityScores.reduce((sum, q) => sum + q, 0) / qualityScores.length;
            insights.push({
                type: 'meta',
                category: 'content_quality',
                content: `Content quality is ${avgQuality > 0.7 ? 'high' : avgQuality > 0.5 ? 'moderate' : 'low'} with average completeness of ${(avgQuality * 100).toFixed(0)}%`,
                confidence: 0.8,
                evidence: [`${qualityScores.length} sources analyzed`],
                priority: 'medium'
            });
        }
        
        return insights;
    }

    rankInsights(insights) {
        // Score insights based on confidence, priority, and uniqueness
        const scoredInsights = insights.map(insight => {
            let score = 0;
            
            // Confidence score (40% weight)
            score += (insight.confidence || 0.5) * 0.4;
            
            // Priority score (30% weight)
            const priorityScores = { high: 1.0, medium: 0.7, low: 0.4, info: 0.3 };
            score += (priorityScores[insight.priority] || 0.5) * 0.3;
            
            // Type score (20% weight) - prefer meta insights
            const typeScores = { meta: 1.0, thematic: 0.8, sentiment: 0.7, structural: 0.6, temporal: 0.6, conceptual: 0.5 };
            score += (typeScores[insight.type] || 0.5) * 0.2;
            
            // Evidence quality (10% weight)
            const evidenceScore = insight.evidence ? Math.min(1.0, insight.evidence.length / 3) : 0.3;
            score += evidenceScore * 0.1;
            
            return {
                ...insight,
                score: score
            };
        });
        
        return scoredInsights.sort((a, b) => b.score - a.score);
    }

    categorizeInsights(insights) {
        const categories = {};
        
        for (const insight of insights) {
            const category = insight.category || 'general';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(insight);
        }
        
        return categories;
    }

    calculateInsightConfidenceDistribution(insights) {
        const distribution = {
            high: 0,    // > 0.8
            medium: 0,  // 0.5-0.8
            low: 0      // < 0.5
        };
        
        for (const insight of insights) {
            const confidence = insight.confidence || 0.5;
            if (confidence > 0.8) {
                distribution.high++;
            } else if (confidence >= 0.5) {
                distribution.medium++;
            } else {
                distribution.low++;
            }
        }
        
        return distribution;
    }
}

module.exports = { ContentAnalysisAgent };
