const { GeminiService } = require('./geminiService');

class ReportAssemblyService {
    constructor() {
        this.gemini = new GeminiService();
        this.maxChunkSize = 8000; // Characters per chunk
        this.overlapSize = 500; // Overlap between chunks for context
    }

    /**
     * Assemble a large report from multiple artifacts and sources
     */
    async assembleComprehensiveReport(artifacts, metadata = {}) {
        try {
            console.log(`📋 Assembling comprehensive report from ${artifacts.length} artifacts`);
            
            // 1. Analyze and categorize artifacts
            const categorizedArtifacts = this.categorizeArtifacts(artifacts);
            
            // 2. Extract language configuration if available
            const languageConfig = this.extractLanguageConfig(artifacts);
            
            // 3. Create report structure
            const reportStructure = await this.createReportStructure(categorizedArtifacts, metadata, languageConfig);
            
            // 4. Generate each section with proper size management
            const sections = await this.generateSections(reportStructure, categorizedArtifacts, languageConfig);
            
            // 5. Assemble final report
            const finalReport = await this.assembleFinalReport(sections, metadata, languageConfig);
            
            // 6. Quality check and validation
            const qualityCheck = await this.performQualityCheck(finalReport, languageConfig);
            
            return {
                report: finalReport,
                metadata: {
                    ...metadata,
                    assemblyDate: new Date().toISOString(),
                    sectionsGenerated: sections.length,
                    totalLength: finalReport.length,
                    artifactsUsed: artifacts.length,
                    qualityCheck: qualityCheck,
                    language: languageConfig
                }
            };
        } catch (error) {
            console.error('❌ Error assembling comprehensive report:', error);
            throw error;
        }
    }

    /**
     * Categorize artifacts by type and relevance
     */
    categorizeArtifacts(artifacts) {
        const categories = {
            languageConfig: [],
            sourceEvaluation: [],
            themeAnalysis: [],
            contentAnalysis: [],
            researchNarrative: [],
            factVerification: [],
            synthesis: [],
            other: []
        };

        for (const artifact of artifacts) {
            const type = artifact.artifact_type || artifact.type;
            const content = artifact.content || {};
            
            switch (type) {
                case 'language_configuration':
                    categories.languageConfig.push(artifact);
                    break;
                case 'source_evaluation':
                case 'source_discovery':
                    categories.sourceEvaluation.push(artifact);
                    break;
                case 'theme_analysis':
                    categories.themeAnalysis.push(artifact);
                    break;
                case 'content_analysis':
                    categories.contentAnalysis.push(artifact);
                    break;
                case 'research_narrative':
                    categories.researchNarrative.push(artifact);
                    break;
                case 'fact_verification':
                case 'fact_checking':
                    categories.factVerification.push(artifact);
                    break;
                case 'synthesis':
                case 'research_synthesis':
                    categories.synthesis.push(artifact);
                    break;
                default:
                    categories.other.push(artifact);
            }
        }

        return categories;
    }

    /**
     * Extract language configuration from artifacts
     */
    extractLanguageConfig(artifacts) {
        const langArtifact = artifacts.find(a => 
            (a.artifact_type || a.type) === 'language_configuration'
        );

        if (langArtifact && langArtifact.content) {
            return langArtifact.content;
        }

        // Fallback: detect language from research topic or content
        let detectedLang = 'en';
        for (const artifact of artifacts) {
            const content = JSON.stringify(artifact.content || {});
            if (this.containsGerman(content)) {
                detectedLang = 'de';
                break;
            }
        }

        return {
            primaryLanguage: { code: detectedLang, name: detectedLang === 'de' ? 'German' : 'English' },
            instructions: detectedLang === 'de' 
                ? 'Alle Ausgaben müssen auf Deutsch sein. Verwenden Sie formelle deutsche Sprache.'
                : 'All outputs must be in English. Use professional English writing style.'
        };
    }

    /**
     * Simple German language detection
     */
    containsGerman(text) {
        const germanIndicators = /\b(der|die|das|und|oder|mit|von|zu|in|auf|für|ist|sind|wird|werden|kann|könnte|soll|sollte|muss|müssen|haben|hat|hatten|sein|war|waren|über|unter|zwischen|während|Schleupen|Bilanzierung|Einarbeitung|Schulung)\b/gi;
        const matches = text.match(germanIndicators) || [];
        return matches.length > 3; // More than 3 German indicators suggests German content
    }

    /**
     * Create a structured outline for the report
     */
    async createReportStructure(categorizedArtifacts, metadata, languageConfig) {
        const language = languageConfig.primaryLanguage?.code || 'en';
        const isGerman = language === 'de';

        // Base structure varies by language
        const structure = {
            title: metadata.researchTopic || (isGerman ? 'Forschungsbericht' : 'Research Report'),
            sections: []
        };

        // Add sections based on available artifacts
        if (categorizedArtifacts.sourceEvaluation.length > 0) {
            structure.sections.push({
                id: 'sources',
                title: isGerman ? 'Quellenanalyse und Bewertung' : 'Source Analysis and Evaluation',
                artifacts: categorizedArtifacts.sourceEvaluation,
                priority: 1
            });
        }

        if (categorizedArtifacts.themeAnalysis.length > 0 || categorizedArtifacts.contentAnalysis.length > 0) {
            structure.sections.push({
                id: 'analysis',
                title: isGerman ? 'Inhaltsanalyse und Themenerkennung' : 'Content Analysis and Theme Identification',
                artifacts: [...categorizedArtifacts.themeAnalysis, ...categorizedArtifacts.contentAnalysis],
                priority: 2
            });
        }

        if (categorizedArtifacts.researchNarrative.length > 0 || categorizedArtifacts.synthesis.length > 0) {
            structure.sections.push({
                id: 'findings',
                title: isGerman ? 'Forschungsergebnisse und Synthese' : 'Research Findings and Synthesis',
                artifacts: [...categorizedArtifacts.researchNarrative, ...categorizedArtifacts.synthesis],
                priority: 3
            });
        }

        if (categorizedArtifacts.factVerification.length > 0) {
            structure.sections.push({
                id: 'verification',
                title: isGerman ? 'Faktenprüfung und Validierung' : 'Fact Verification and Validation',
                artifacts: categorizedArtifacts.factVerification,
                priority: 4
            });
        }

        // Add conclusions section
        structure.sections.push({
            id: 'conclusions',
            title: isGerman ? 'Schlussfolgerungen und Empfehlungen' : 'Conclusions and Recommendations',
            artifacts: [], // Will be generated
            priority: 5
        });

        return structure;
    }

    /**
     * Generate each section of the report
     */
    async generateSections(structure, categorizedArtifacts, languageConfig) {
        const sections = [];
        const language = languageConfig.primaryLanguage?.code || 'en';
        const isGerman = language === 'de';

        for (const sectionSpec of structure.sections) {
            console.log(`📝 Generating section: ${sectionSpec.title}`);
            
            try {
                let sectionContent = '';
                
                if (sectionSpec.artifacts.length > 0) {
                    // Generate content from artifacts
                    sectionContent = await this.generateSectionFromArtifacts(
                        sectionSpec, 
                        languageConfig
                    );
                } else if (sectionSpec.id === 'conclusions') {
                    // Generate conclusions from all artifacts
                    sectionContent = await this.generateConclusionsSection(
                        categorizedArtifacts, 
                        languageConfig
                    );
                }

                sections.push({
                    id: sectionSpec.id,
                    title: sectionSpec.title,
                    content: sectionContent,
                    artifacts: sectionSpec.artifacts.length
                });

            } catch (error) {
                console.error(`❌ Error generating section ${sectionSpec.id}:`, error);
                // Add error placeholder
                sections.push({
                    id: sectionSpec.id,
                    title: sectionSpec.title,
                    content: isGerman 
                        ? `Fehler beim Generieren dieses Abschnitts: ${error.message}`
                        : `Error generating this section: ${error.message}`,
                    error: true
                });
            }
        }

        return sections;
    }

    /**
     * Generate content for a section from its artifacts
     */
    async generateSectionFromArtifacts(sectionSpec, languageConfig) {
        const artifacts = sectionSpec.artifacts;
        const isGerman = languageConfig.primaryLanguage?.code === 'de';
        
        // Combine artifact content
        let combinedContent = '';
        for (const artifact of artifacts) {
            const content = artifact.content || {};
            combinedContent += JSON.stringify(content, null, 2) + '\n\n';
        }

        // Check if content is too large for single LLM call
        if (combinedContent.length > this.maxChunkSize) {
            return await this.generateLargeSectionInChunks(
                sectionSpec, 
                combinedContent, 
                languageConfig
            );
        }

        // Generate section with single LLM call
        const systemPrompt = `You are creating a section of a comprehensive research report.
${languageConfig.instructions || ''}

Create a well-structured, detailed section titled "${sectionSpec.title}".
The content should be professional, comprehensive, and properly formatted with headers and subheadings.
Extract key insights, data, and findings from the provided artifacts.
Ensure proper citations and references where applicable.`;

        const userPrompt = `Create the "${sectionSpec.title}" section of the research report based on the following artifacts:

${combinedContent}

Requirements:
- Use markdown formatting with proper headers (##, ###)
- Be comprehensive and detailed
- Extract key insights and synthesize information
- Maintain professional academic tone
- Include specific data points and evidence
- ${isGerman ? 'Schreiben Sie auf Deutsch in formeller wissenschaftlicher Sprache' : 'Write in professional English'}`;

        return await this.gemini.generateResponse(systemPrompt, userPrompt, '', {
            temperature: 0.3 // Lower temperature for more factual content
        });
    }

    /**
     * Generate large sections in chunks and combine them
     */
    async generateLargeSectionInChunks(sectionSpec, combinedContent, languageConfig) {
        const chunks = this.chunkContent(combinedContent);
        const sectionParts = [];
        
        for (let i = 0; i < chunks.length; i++) {
            console.log(`📝 Generating chunk ${i + 1}/${chunks.length} for section ${sectionSpec.title}`);
            
            const chunkPrompt = `Create part ${i + 1} of ${chunks.length} for the section "${sectionSpec.title}".
            
This is chunk ${i + 1} of the source data:
${chunks[i]}

${i === 0 ? 'Start with an introduction to this section.' : ''}
${i === chunks.length - 1 ? 'Conclude this section with a summary.' : 'This is a middle part, continue the analysis.'}

${languageConfig.instructions || ''}`;

            const systemPrompt = `You are creating part of a research report section. 
Maintain consistency with other parts and ensure smooth flow.
Use markdown formatting and professional language.`;

            const part = await this.gemini.generateResponse(systemPrompt, chunkPrompt, '', {
                temperature: 0.3
            });
            
            sectionParts.push(part);
        }

        // Combine all parts
        return sectionParts.join('\n\n');
    }

    /**
     * Generate conclusions section from all artifacts
     */
    async generateConclusionsSection(categorizedArtifacts, languageConfig) {
        const isGerman = languageConfig.primaryLanguage?.code === 'de';
        
        // Summarize key findings from all categories
        let keyFindings = '';
        for (const [category, artifacts] of Object.entries(categorizedArtifacts)) {
            if (artifacts.length > 0 && category !== 'languageConfig') {
                keyFindings += `${category}: ${artifacts.length} artifacts\n`;
                // Add brief summary of each artifact
                for (const artifact of artifacts.slice(0, 2)) { // Limit to prevent overload
                    const content = artifact.content || {};
                    const summary = JSON.stringify(content).substring(0, 200) + '...';
                    keyFindings += `  - ${summary}\n`;
                }
            }
        }

        const systemPrompt = `You are creating the conclusions section of a comprehensive research report.
${languageConfig.instructions || ''}

Synthesize the key findings, provide actionable insights, and make recommendations.
This should be the culminating section that ties everything together.`;

        const userPrompt = `Create a comprehensive conclusions and recommendations section based on all research findings:

Key Findings Summary:
${keyFindings}

Requirements:
- Synthesize the most important insights
- Provide actionable recommendations  
- Identify limitations and areas for future research
- Use clear, authoritative language
- Structure with appropriate headers
- ${isGerman ? 'Schreiben Sie auf Deutsch' : 'Write in English'}`;

        return await this.gemini.generateResponse(systemPrompt, userPrompt, '', {
            temperature: 0.4
        });
    }

    /**
     * Assemble the final report from all sections
     */
    async assembleFinalReport(sections, metadata, languageConfig) {
        const isGerman = languageConfig.primaryLanguage?.code === 'de';
        
        let report = '';
        
        // Add title and metadata
        report += `# ${metadata.researchTopic || (isGerman ? 'Forschungsbericht' : 'Research Report')}\n\n`;
        
        if (metadata.researchDate) {
            report += `**${isGerman ? 'Datum' : 'Date'}:** ${metadata.researchDate}\n`;
        }
        
        if (metadata.sessionId) {
            report += `**${isGerman ? 'Sitzungs-ID' : 'Session ID'}:** ${metadata.sessionId}\n`;
        }
        
        report += '\n---\n\n';

        // Add executive summary if we have enough content
        if (sections.length > 2) {
            const summaryContent = sections.map(s => s.content).join('\n\n').substring(0, 2000);
            
            const execSummary = await this.generateExecutiveSummary(summaryContent, languageConfig);
            report += `## ${isGerman ? 'Zusammenfassung' : 'Executive Summary'}\n\n${execSummary}\n\n`;
        }

        // Add table of contents
        report += `## ${isGerman ? 'Inhaltsverzeichnis' : 'Table of Contents'}\n\n`;
        for (const section of sections) {
            report += `- [${section.title}](#${section.id})\n`;
        }
        report += '\n';

        // Add all sections
        for (const section of sections) {
            report += `## ${section.title} {#${section.id}}\n\n`;
            report += section.content + '\n\n';
        }

        return report;
    }

    /**
     * Generate an executive summary
     */
    async generateExecutiveSummary(contentSample, languageConfig) {
        const isGerman = languageConfig.primaryLanguage?.code === 'de';
        
        const systemPrompt = `Create a concise executive summary of the research report.
${languageConfig.instructions || ''}
The summary should highlight the most important findings and conclusions.`;

        const userPrompt = `Create an executive summary based on this sample of the full report content:

${contentSample}

Make it ${isGerman ? 'prägnant und informativ auf Deutsch' : 'concise and informative in English'}.
Highlight the most crucial findings and recommendations.`;

        return await this.gemini.generateResponse(systemPrompt, userPrompt, '', {
            temperature: 0.3,
            maxOutputTokens: 500 // Keep summary concise
        });
    }

    /**
     * Perform quality check on the final report
     */
    async performQualityCheck(report, languageConfig) {
        const isGerman = languageConfig.primaryLanguage?.code === 'de';
        
        const checks = {
            length: report.length,
            hasProperStructure: /^#\s+.+$/m.test(report), // Has main title
            hasSections: (report.match(/^##\s+/gm) || []).length,
            hasConclusions: isGerman 
                ? /schluss|empfehlung|fazit/i.test(report)
                : /conclusion|recommendation|summary/i.test(report),
            languageConsistency: this.checkLanguageConsistency(report, languageConfig),
            completeness: report.length > 1000 && !this.detectTruncation(report)
        };

        return {
            score: this.calculateQualityScore(checks),
            checks: checks,
            recommendations: this.generateQualityRecommendations(checks, isGerman)
        };
    }

    /**
     * Check language consistency
     */
    checkLanguageConsistency(report, languageConfig) {
        const expectedLang = languageConfig.primaryLanguage?.code || 'en';
        
        if (expectedLang === 'de') {
            // Check for German indicators
            const germanIndicators = (report.match(/\b(der|die|das|und|oder|mit|von|zu|in|auf|für|ist|sind|wird|werden)\b/gi) || []).length;
            const englishIndicators = (report.match(/\b(the|and|or|with|from|to|in|on|for|is|are|will|would)\b/gi) || []).length;
            
            return germanIndicators > englishIndicators;
        } else {
            // Check for English indicators
            const englishIndicators = (report.match(/\b(the|and|or|with|from|to|in|on|for|is|are|will|would)\b/gi) || []).length;
            const germanIndicators = (report.match(/\b(der|die|das|und|oder|mit|von|zu|in|auf|für|ist|sind|wird|werden)\b/gi) || []).length;
            
            return englishIndicators > germanIndicators;
        }
    }

    /**
     * Simple truncation detection for final report
     */
    detectTruncation(report) {
        return report.endsWith('...') || 
               /[a-zA-Z][.,:;]?\s*$/.test(report) && !report.match(/[.!?]\s*$/);
    }

    /**
     * Calculate quality score
     */
    calculateQualityScore(checks) {
        let score = 0;
        const weights = {
            hasProperStructure: 20,
            hasSections: 25,
            hasConclusions: 20,
            languageConsistency: 15,
            completeness: 20
        };

        for (const [check, weight] of Object.entries(weights)) {
            if (checks[check]) {
                score += weight;
            }
        }

        return score;
    }

    /**
     * Generate quality recommendations
     */
    generateQualityRecommendations(checks, isGerman) {
        const recommendations = [];
        
        if (!checks.hasProperStructure) {
            recommendations.push(isGerman 
                ? 'Fügen Sie eine klare Hauptüberschrift hinzu'
                : 'Add a clear main title'
            );
        }
        
        if (checks.hasSections < 3) {
            recommendations.push(isGerman 
                ? 'Erwägen Sie die Hinzufügung weiterer Abschnitte für bessere Struktur'
                : 'Consider adding more sections for better structure'
            );
        }
        
        if (!checks.hasConclusions) {
            recommendations.push(isGerman 
                ? 'Fügen Sie einen Schlussfolgerungs- oder Empfehlungsabschnitt hinzu'
                : 'Add a conclusions or recommendations section'
            );
        }
        
        if (!checks.languageConsistency) {
            recommendations.push(isGerman 
                ? 'Überprüfen Sie die Sprachkonsistenz im gesamten Bericht'
                : 'Review language consistency throughout the report'
            );
        }
        
        if (!checks.completeness) {
            recommendations.push(isGerman 
                ? 'Der Bericht scheint unvollständig oder abgeschnitten zu sein'
                : 'The report appears to be incomplete or truncated'
            );
        }

        return recommendations;
    }

    /**
     * Split content into manageable chunks
     */
    chunkContent(content) {
        const chunks = [];
        let currentChunk = '';
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (currentChunk.length + line.length > this.maxChunkSize) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    // Start new chunk with overlap
                    const overlapLines = currentChunk.split('\n').slice(-5); // Last 5 lines for context
                    currentChunk = overlapLines.join('\n') + '\n' + line;
                } else {
                    // Single line is too long, split it
                    chunks.push(line);
                    currentChunk = '';
                }
            } else {
                currentChunk += line + '\n';
            }
        }
        
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }
}

module.exports = { ReportAssemblyService };
