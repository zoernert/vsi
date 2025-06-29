/**
 * VSI Agents Module
 * Handles autonomous agent research sessions and management
 */
class VSIAgentsModule {
    constructor(app) {
        this.app = app;
        this.currentSession = null;
        this.agentTemplates = [];
        this.eventSource = null;
        this.fullscreenRenderMode = 'rendered'; // Default render mode for fullscreen
    }

    /**
     * Initialize agents module
     */
    init() {
        this.loadAgentTemplates();
        this.initializeResultsHandlers();
    }

    /**
     * Initialize event handlers for results display features
     */
    initializeResultsHandlers() {
        // Expand to fullscreen button
        const expandBtn = document.getElementById('expandResultsBtn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => this.expandResultsToFullscreen());
        }

        // Copy results button
        const copyBtn = document.getElementById('copyResultsBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyResultsToClipboard());
        }

        // Fullscreen modal buttons
        const copyFullscreenBtn = document.getElementById('copyFullscreenResultsBtn');
        if (copyFullscreenBtn) {
            copyFullscreenBtn.addEventListener('click', () => this.copyFullscreenResultsToClipboard());
        }

        const toggleRenderBtn = document.getElementById('toggleRenderModeBtn');
        if (toggleRenderBtn) {
            toggleRenderBtn.addEventListener('click', () => this.toggleRenderMode());
        }

        // Save to collection button
        const saveToCollectionBtn = document.getElementById('saveToCollectionBtn');
        if (saveToCollectionBtn) {
            saveToCollectionBtn.addEventListener('click', () => this.showSaveToCollectionModal());
        }

        // Save to collection modal confirm button
        const confirmSaveBtn = document.getElementById('confirmSaveToCollection');
        if (confirmSaveBtn) {
            confirmSaveBtn.addEventListener('click', () => this.saveResearchToCollection());
        }
    }

    /**
     * Show agents view
     */
    async showAgents() {
        this.app.ui.showView('agents');
        this.app.ui.setActiveNav('agents');
        this.app.ui.setPageTitle('Research Agents');
        await this.loadSessions();
    }

    /**
     * Load agent templates
     */
    async loadAgentTemplates() {
        try {
            const response = await this.app.api.call('/api/agents/research-templates');
            if (response && response.success) {
                this.agentTemplates = response.data || [];
            } else {
                // Templates endpoint might not be implemented yet, that's OK
                this.agentTemplates = [];
                console.log('Agent templates not available yet');
            }
        } catch (error) {
            // Templates endpoint might not be implemented yet, that's OK
            console.log('Agent templates endpoint not available:', error.message);
            this.agentTemplates = [];
        }
    }

    /**
     * Load research sessions
     */
    async loadSessions() {
        try {
            const response = await this.app.api.call('/api/agents/sessions');
            if (response && (response.success || Array.isArray(response))) {
                const sessions = Array.isArray(response) ? response : (response.data || []);
                this.renderSessions(sessions);
            } else {
                this.renderSessions([]);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.app.ui.showNotification('Error loading research sessions', 'error');
            this.renderSessions([]);
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Render sessions in the UI
     */
    renderSessions(sessions) {
        const container = document.getElementById('sessionsGrid');
        if (!container) return;

        if (!sessions || sessions.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="card text-center">
                        <div class="card-body">
                            <i class="fas fa-robot fa-3x text-muted mb-3"></i>
                            <h5>No research sessions yet</h5>
                            <p class="text-muted">Create your first autonomous research session to get started.</p>
                            <button class="btn btn-primary" onclick="app.agents.showCreateSessionModal()">
                                <i class="fas fa-plus me-2"></i>Start Research
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${this.escapeHtml(session.research_topic || session.name || 'Research Session')}</h6>
                        <span class="badge ${this.getStatusBadgeClass(session.status)}">${session.status}</span>
                    </div>
                    <div class="card-body">
                        <p class="text-muted small">${this.escapeHtml(session.description || 'No description')}</p>
                        <div class="small text-muted mb-2">
                            <i class="fas fa-clock me-1"></i>
                            ${new Date(session.created_at).toLocaleDateString()}
                        </div>
                        ${session.progress ? `
                            <div class="progress mb-2" style="height: 8px;">
                                <div class="progress-bar" style="width: ${session.progress}%"></div>
                            </div>
                            <div class="small text-muted">${session.progress}% complete</div>
                        ` : ''}
                    </div>
                    <div class="card-footer">
                        <div class="btn-group w-100" role="group">
                            <button class="btn btn-sm btn-outline-primary" onclick="app.agents.viewSession('${session.id}')">
                                <i class="fas fa-eye"></i> View
                            </button>
                            ${session.status === 'running' ? `
                                <button class="btn btn-sm btn-outline-warning" onclick="app.agents.pauseSession('${session.id}')">
                                    <i class="fas fa-pause"></i> Pause
                                </button>
                            ` : session.status === 'paused' ? `
                                <button class="btn btn-sm btn-outline-success" onclick="app.agents.resumeSession('${session.id}')">
                                    <i class="fas fa-play"></i> Resume
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-outline-danger" onclick="app.agents.deleteSession('${session.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Get CSS class for status badge
     */
    getStatusBadgeClass(status) {
        const classes = {
            'running': 'bg-success',
            'paused': 'bg-warning',
            'completed': 'bg-primary',
            'failed': 'bg-danger',
            'error': 'bg-danger',
            'stopped': 'bg-secondary',
            'pending': 'bg-secondary',
            'created': 'bg-info'
        };
        return classes[status] || 'bg-secondary';
    }

    /**
     * Show create session modal
     */
    showCreateSessionModal() {
        // Populate agent templates dropdown
        const templateSelect = document.getElementById('agentTemplateSelect');
        if (templateSelect && this.agentTemplates.length > 0) {
            templateSelect.innerHTML = '<option value="">Choose a template...</option>' +
                this.agentTemplates.map(template => 
                    `<option value="${template.id}">${this.escapeHtml(template.name)}</option>`
                ).join('');
        }

        const modal = new bootstrap.Modal(document.getElementById('createSessionModal'));
        modal.show();
    }

    /**
     * Create a new research session
     */
    async createSession() {
        const form = document.getElementById('createSessionForm');
        const formData = new FormData(form);
        
        const sessionData = {
            researchTopic: formData.get('query'), // Backend expects 'researchTopic'
            preferences: {
                name: formData.get('name'),
                description: formData.get('description'),
                template_id: formData.get('template_id') || null
            }
        };

        // Add optional configuration to preferences
        const maxResults = formData.get('maxResults');
        const timeout = formData.get('timeout');
        if (maxResults) sessionData.preferences.maxResults = parseInt(maxResults);
        if (timeout) sessionData.preferences.timeout = parseInt(timeout);

        try {
            const response = await this.app.api.call('/api/agents/sessions', {
                method: 'POST',
                body: JSON.stringify(sessionData)
            });

            if (response && response.success) {
                this.app.ui.showNotification('Research session created successfully', 'success');
                bootstrap.Modal.getInstance(document.getElementById('createSessionModal')).hide();
                form.reset();
                await this.loadSessions();
                
                // Optionally start the session immediately
                if (confirm('Start the research session now?')) {
                    await this.startSession(response.data.id);
                }
            } else {
                this.app.ui.showNotification(response?.message || 'Failed to create session', 'error');
            }
        } catch (error) {
            console.error('Error creating session:', error);
            this.app.ui.showNotification('Error creating research session', 'error');
        }
    }

    /**
     * View session details
     */
    async viewSession(sessionId) {
        try {
            const response = await this.app.api.call(`/api/agents/sessions/${sessionId}`);
            if (response && response.success) {
                this.currentSession = response.data;
                this.showSessionDetail();
            }
        } catch (error) {
            console.error('Error loading session:', error);
            this.app.ui.showNotification('Error loading session details', 'error');
        }
    }

    /**
     * Show session detail view
     */
    showSessionDetail() {
        if (!this.currentSession) return;

        this.app.ui.showView('sessionDetail');
        this.app.ui.setPageTitle(`Research Session: ${this.currentSession.research_topic || this.currentSession.name || 'Session'}`);

        // Update session info
        document.getElementById('sessionDetailName').textContent = this.currentSession.research_topic || this.currentSession.name || 'Research Session';
        document.getElementById('sessionDetailDescription').textContent = this.currentSession.description || 'No description';
        document.getElementById('sessionDetailStatus').textContent = this.currentSession.status;
        document.getElementById('sessionDetailStatus').className = `badge ${this.getStatusBadgeClass(this.currentSession.status)}`;
        
        // Update button states based on session status
        this.updateSessionButtons();
        
        // Update progress
        const progressBar = document.getElementById('sessionProgressBar');
        const progressText = document.getElementById('sessionProgressText');
        if (this.currentSession.progress !== undefined) {
            progressBar.style.width = `${this.currentSession.progress}%`;
            progressText.textContent = `${this.currentSession.progress}% complete`;
        }

        // Clear any previous error details
        const errorContainer = document.getElementById('sessionErrorDetails');
        if (errorContainer) {
            errorContainer.style.display = 'none';
            errorContainer.innerHTML = '';
        }

        // Load session logs and results
        this.loadSessionLogs();
        this.loadSessionResults();

        // Start real-time updates if session is running
        if (this.currentSession.status === 'running') {
            this.startSessionUpdates();
        }
    }

    /**
     * Update session control buttons based on current status
     */
    updateSessionButtons() {
        const startBtn = document.getElementById('startSessionBtn');
        const pauseBtn = document.getElementById('pauseSessionBtn');
        const resumeBtn = document.getElementById('resumeSessionBtn');
        const stopBtn = document.getElementById('stopSessionBtn');

        if (!this.currentSession) return;

        const status = this.currentSession.status;

        // Reset all buttons
        [startBtn, pauseBtn, resumeBtn, stopBtn].forEach(btn => {
            if (btn) btn.style.display = 'none';
        });

        // Show appropriate buttons based on status
        switch (status) {
            case 'created':
                if (startBtn) startBtn.style.display = 'inline-block';
                break;
            case 'running':
                if (pauseBtn) pauseBtn.style.display = 'inline-block';
                if (stopBtn) stopBtn.style.display = 'inline-block';
                break;
            case 'paused':
                if (resumeBtn) resumeBtn.style.display = 'inline-block';
                if (stopBtn) stopBtn.style.display = 'inline-block';
                break;
            case 'error':
            case 'failed':
            case 'completed':
            case 'stopped':
                // No action buttons for terminal states
                break;
        }
    }

    /**
     * Load session execution logs
     */
    async loadSessionLogs() {
        try {
            const response = await this.app.api.call(`/api/agents/sessions/${this.currentSession.id}/logs`);
            if (response && response.success) {
                this.renderSessionLogs(response.data);
            }
        } catch (error) {
            console.error('Error loading session logs:', error);
        }
    }

    /**
     * Render session logs
     */
    renderSessionLogs(logs) {
        const container = document.getElementById('sessionLogs');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="text-muted">No execution logs yet.</p>';
            return;
        }

        container.innerHTML = logs.map(log => {
            // Map backend response to frontend expected format
            const agentType = this.extractAgentType(log.agent_id) || 'System';
            const level = log.log_level || 'info';
            const message = log.message;
            const timestamp = log.created_at;
            const details = log.details;
            
            return `
                <div class="log-entry ${level}" data-timestamp="${timestamp}">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <strong>${agentType}:</strong> ${this.escapeHtml(message)}
                        </div>
                        <small class="text-muted">${new Date(timestamp).toLocaleTimeString()}</small>
                    </div>
                    ${details && Object.keys(details).length > 0 ? `<pre class="mt-2 small"><code>${JSON.stringify(details, null, 2)}</code></pre>` : ''}
                </div>
            `;
        }).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Load session results
     */
    async loadSessionResults() {
        try {
            const response = await this.app.api.call(`/api/agents/sessions/${this.currentSession.id}/results`);
            if (response && response.success) {
                this.renderSessionResults(response.data);
            }
        } catch (error) {
            console.error('Error loading session results:', error);
        }
    }

    /**
     * Render session results
     */
    renderSessionResults(results) {
        const container = document.getElementById('sessionResults');
        if (!container) return;

        // Show/hide action buttons based on whether we have results
        const expandBtn = document.getElementById('expandResultsBtn');
        const copyBtn = document.getElementById('copyResultsBtn');
        
        if (!results || results.length === 0) {
            container.innerHTML = '<p class="text-muted">No results generated yet.</p>';
            if (expandBtn) expandBtn.style.display = 'none';
            if (copyBtn) copyBtn.style.display = 'none';
            // Clear stored markdown content
            container.removeAttribute('data-markdown-content');
            return;
        }

        // Show action buttons
        if (expandBtn) expandBtn.style.display = 'inline-block';
        if (copyBtn) copyBtn.style.display = 'inline-block';

        // Store results for fullscreen display and copying
        this.currentResults = results;

        // Extract and store all markdown content for saving
        const allMarkdownContent = this.extractAllMarkdownContent(results);
        container.setAttribute('data-markdown-content', allMarkdownContent);

        container.innerHTML = results.map(result => `
            <div class="result-card card mb-3">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${result.title || result.artifact_type || 'Result'}</h6>
                        <small class="text-muted">${new Date(result.created_at || result.createdAt).toLocaleString()}</small>
                    </div>
                </div>
                <div class="card-body">
                    ${this.renderResultContent(result)}
                </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render result content based on type and structure
     */
    renderResultContent(result) {
        // Handle research_summary type specifically
        if ((result.artifact_type === 'research_summary' || result.type === 'research_summary') && result.content && result.content.report) {
            const content = result.content;
            return `
                <div class="research-summary">
                    <div class="mb-3">
                        <h6 class="text-primary">Research Report</h6>
                        <div class="report-content" style="max-height: 400px; overflow-y: auto;">
                            <div class="research-report-content p-3 border rounded">
                                ${this.renderMarkdown(content.report)}
                            </div>
                        </div>
                    </div>
                    
                    ${content.quality ? `
                        <div class="mb-3">
                            <h6 class="text-info">Quality Metrics</h6>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${content.quality.coverageScore}%</div>
                                        <small class="text-muted">Coverage</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${content.quality.coherenceScore}%</div>
                                        <small class="text-muted">Coherence</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${Math.round(content.quality.confidenceScore * 100)}%</div>
                                        <small class="text-muted">Confidence</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${content.statistics ? `
                        <div class="mb-3">
                            <h6 class="text-success">Research Statistics</h6>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${content.statistics.totalAgents}</div>
                                        <small class="text-muted">Agents</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${content.statistics.totalArtifacts}</div>
                                        <small class="text-muted">Artifacts</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${content.statistics.completedAgents}</div>
                                        <small class="text-muted">Completed</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <div class="h5 mb-0">${Math.round(content.statistics.researchDuration / 1000)}s</div>
                                        <small class="text-muted">Duration</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${content.recommendations && content.recommendations.length > 0 ? `
                        <div class="mb-3">
                            <h6 class="text-warning">Recommendations</h6>
                            <div class="list-group list-group-flush">
                                ${content.recommendations.map(rec => `
                                    <div class="list-group-item border-0 px-0">
                                        <div class="d-flex justify-content-between align-items-start">
                                            <div class="flex-grow-1">
                                                <h6 class="mb-1">${this.escapeHtml(rec.title)}</h6>
                                                <p class="mb-1 text-muted">${this.escapeHtml(rec.description)}</p>
                                                <small class="text-muted">Priority: ${rec.priority} | Category: ${rec.category}</small>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Handle other artifact types
        if (result.content && typeof result.content === 'object') {
            return `<pre><code>${JSON.stringify(result.content, null, 2)}</code></pre>`;
        }
        
        // Handle simple text content
        if (result.content && typeof result.content === 'string') {
            return `<p>${this.escapeHtml(result.content)}</p>`;
        }
        
        // Fallback
        return `<p class="text-muted">No content available</p>`;
    }

    /**
     * Render markdown content as HTML
     */
    renderMarkdown(markdownText) {
        if (typeof marked === 'undefined') {
            // Fallback if marked.js is not loaded
            return `<pre class="markdown-fallback">${this.escapeHtml(markdownText)}</pre>`;
        }
        
        try {
            // Configure marked with safe options
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false, // We trust the content from our agents
                smartLists: true,
                smartypants: true
            });
            
            return marked.parse(markdownText);
        } catch (error) {
            console.error('Error rendering markdown:', error);
            return `<pre class="markdown-error">${this.escapeHtml(markdownText)}</pre>`;
        }
    }

    /**
     * Extract markdown content from results for copying
     */
    extractMarkdownContent() {
        if (!this.currentResults || this.currentResults.length === 0) {
            return '';
        }

        let markdownContent = '';
        
        for (const result of this.currentResults) {
            if ((result.artifact_type === 'research_summary' || result.type === 'research_summary') && result.content?.report) {
                markdownContent += `# ${result.title || result.artifact_type || 'Research Report'}\n\n`;
                markdownContent += `*Created: ${new Date(result.created_at || result.createdAt).toLocaleString()}*\n\n`;
                markdownContent += result.content.report + '\n\n';
                
                if (result.content.quality) {
                    markdownContent += '## Quality Metrics\n\n';
                    markdownContent += `- **Coverage:** ${result.content.quality.coverageScore}%\n`;
                    markdownContent += `- **Coherence:** ${result.content.quality.coherenceScore}%\n`;
                    markdownContent += `- **Confidence:** ${Math.round(result.content.quality.confidenceScore * 100)}%\n\n`;
                }
                
                if (result.content.statistics) {
                    markdownContent += '## Research Statistics\n\n';
                    markdownContent += `- **Agents:** ${result.content.statistics.totalAgents}\n`;
                    markdownContent += `- **Artifacts:** ${result.content.statistics.totalArtifacts}\n`;
                    markdownContent += `- **Completed:** ${result.content.statistics.completedAgents}\n`;
                    markdownContent += `- **Duration:** ${Math.round(result.content.statistics.researchDuration / 1000)}s\n\n`;
                }
            } else if (result.content) {
                markdownContent += `# ${result.title || result.artifact_type || 'Result'}\n\n`;
                markdownContent += `*Created: ${new Date(result.created_at || result.createdAt).toLocaleString()}*\n\n`;
                
                if (typeof result.content === 'string') {
                    markdownContent += result.content + '\n\n';
                } else {
                    markdownContent += '```json\n' + JSON.stringify(result.content, null, 2) + '\n```\n\n';
                }
            }
        }
        
        return markdownContent;
    }

    /**
     * Expand results to fullscreen modal
     */
    expandResultsToFullscreen() {
        if (!this.currentResults || this.currentResults.length === 0) {
            return;
        }

        const modal = document.getElementById('fullscreenResultsModal');
        const content = document.getElementById('fullscreenResultsContent');
        
        if (!modal || !content) {
            console.error('Fullscreen modal elements not found');
            return;
        }

        // Set initial render mode
        this.fullscreenRenderMode = 'rendered';
        
        // Render content in fullscreen
        this.renderFullscreenContent();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    /**
     * Render content in fullscreen modal
     */
    renderFullscreenContent() {
        const content = document.getElementById('fullscreenResultsContent');
        if (!content || !this.currentResults) return;

        if (this.fullscreenRenderMode === 'raw') {
            // Show raw markdown
            const markdownContent = this.extractMarkdownContent();
            content.innerHTML = `<pre class="bg-light p-3 border rounded" style="white-space: pre-wrap; font-family: 'Courier New', monospace;">${this.escapeHtml(markdownContent)}</pre>`;
        } else {
            // Show rendered HTML
            content.innerHTML = this.currentResults.map(result => `
                <div class="result-card mb-4">
                    <div class="border-bottom pb-3 mb-3">
                        <h3 class="text-primary">${result.title || result.artifact_type || 'Result'}</h3>
                        <small class="text-muted">Created: ${new Date(result.created_at || result.createdAt).toLocaleString()}</small>
                    </div>
                    <div class="result-content">
                        ${this.renderResultContentFullscreen(result)}
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Render result content for fullscreen (without size restrictions)
     */
    renderResultContentFullscreen(result) {
        // Handle research_summary type specifically
        if ((result.artifact_type === 'research_summary' || result.type === 'research_summary') && result.content && result.content.report) {
            const content = result.content;
            return `
                <div class="research-summary">
                    <div class="mb-4">
                        <div class="research-report-content">
                            ${this.renderMarkdown(content.report)}
                        </div>
                    </div>
                    
                    ${content.quality ? `
                        <div class="mb-4">
                            <h4 class="text-info">Quality Metrics</h4>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h2 class="card-title text-primary">${content.quality.coverageScore}%</h2>
                                            <p class="card-text">Coverage</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h2 class="card-title text-primary">${content.quality.coherenceScore}%</h2>
                                            <p class="card-text">Coherence</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h2 class="card-title text-primary">${Math.round(content.quality.confidenceScore * 100)}%</h2>
                                            <p class="card-text">Confidence</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${content.statistics ? `
                        <div class="mb-4">
                            <h4 class="text-success">Research Statistics</h4>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h3 class="card-title text-primary">${content.statistics.totalAgents}</h3>
                                            <p class="card-text">Agents</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h3 class="card-title text-primary">${content.statistics.totalArtifacts}</h3>
                                            <p class="card-text">Artifacts</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h3 class="card-title text-primary">${content.statistics.completedAgents}</h3>
                                            <p class="card-text">Completed</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h3 class="card-title text-primary">${Math.round(content.statistics.researchDuration / 1000)}s</h3>
                                            <p class="card-text">Duration</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${content.recommendations && content.recommendations.length > 0 ? `
                        <div class="mb-4">
                            <h4 class="text-warning">Recommendations</h4>
                            <div class="row">
                                ${content.recommendations.map(rec => `
                                    <div class="col-md-6 mb-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <h5 class="card-title">${this.escapeHtml(rec.title)}</h5>
                                                <p class="card-text">${this.escapeHtml(rec.description)}</p>
                                                <div class="d-flex justify-content-between">
                                                    <small class="text-muted">Priority: ${rec.priority}</small>
                                                    <small class="text-muted">Category: ${rec.category}</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Handle other artifact types
        if (result.content && typeof result.content === 'object') {
            return `<pre class="bg-light p-3 border rounded"><code>${JSON.stringify(result.content, null, 2)}</code></pre>`;
        }
        
        return `<p class="text-muted">No content available</p>`;
    }

    /**
     * Copy results to clipboard (from main card)
     */
    async copyResultsToClipboard() {
        try {
            const markdownContent = this.extractMarkdownContent();
            
            if (!markdownContent.trim()) {
                this.showCopyNotification('No content to copy', 'warning');
                return;
            }

            await navigator.clipboard.writeText(markdownContent);
            this.showCopyNotification('Results copied to clipboard!', 'success');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showCopyNotification('Failed to copy to clipboard', 'error');
        }
    }

    /**
     * Copy results to clipboard (from fullscreen modal)
     */
    async copyFullscreenResultsToClipboard() {
        try {
            const markdownContent = this.extractMarkdownContent();
            
            if (!markdownContent.trim()) {
                this.showCopyNotification('No content to copy', 'warning');
                return;
            }

            await navigator.clipboard.writeText(markdownContent);
            this.showCopyNotification('Results copied to clipboard!', 'success');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showCopyNotification('Failed to copy to clipboard', 'error');
        }
    }

    /**
     * Toggle between rendered and raw markdown in fullscreen
     */
    toggleRenderMode() {
        const toggleBtn = document.getElementById('toggleRenderModeBtn');
        
        if (this.fullscreenRenderMode === 'rendered') {
            this.fullscreenRenderMode = 'raw';
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i class="fas fa-eye me-1"></i>Rendered View';
                toggleBtn.title = 'Switch to rendered view';
            }
        } else {
            this.fullscreenRenderMode = 'rendered';
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i class="fas fa-code me-1"></i>Raw Markdown';
                toggleBtn.title = 'Switch to raw markdown view';
            }
        }
        
        this.renderFullscreenContent();
    }

    /**
     * Show copy notification
     */
    showCopyNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'danger'} position-fixed`;
        notification.style.cssText = `
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 250px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'} me-2"></i>
            ${message}
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Start session
     */
    async startSession(sessionId) {
        try {
            // Let the backend determine agent types based on template
            // Don't specify agentTypes - let template configuration handle it
            const requestBody = {};

            const response = await this.app.api.call(`/api/agents/sessions/${sessionId}/start`, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            if (response && response.success) {
                this.app.ui.showNotification('Research session started', 'success');
                await this.loadSessions();
                
                // If viewing this session, start real-time updates
                if (this.currentSession && this.currentSession.id === sessionId) {
                    this.currentSession.status = 'running';
                    this.startSessionUpdates();
                }
            }
        } catch (error) {
            console.error('Error starting session:', error);
            this.app.ui.showNotification('Error starting research session', 'error');
        }
    }

    /**
     * Pause session
     */
    async pauseSession(sessionId) {
        try {
            const response = await this.app.api.call(`/api/agents/sessions/${sessionId}/pause`, {
                method: 'POST'
            });

            if (response && response.success) {
                this.app.ui.showNotification('Research session paused', 'info');
                await this.loadSessions();
                this.stopSessionUpdates();
            }
        } catch (error) {
            console.error('Error pausing session:', error);
            this.app.ui.showNotification('Error pausing research session', 'error');
        }
    }

    /**
     * Resume session
     */
    async resumeSession(sessionId) {
        try {
            const response = await this.app.api.call(`/api/agents/sessions/${sessionId}/resume`, {
                method: 'POST'
            });

            if (response && response.success) {
                this.app.ui.showNotification('Research session resumed', 'success');
                await this.loadSessions();
                
                if (this.currentSession && this.currentSession.id === sessionId) {
                    this.startSessionUpdates();
                }
            }
        } catch (error) {
            console.error('Error resuming session:', error);
            this.app.ui.showNotification('Error resuming research session', 'error');
        }
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        if (!confirm('Are you sure you want to delete this research session? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await this.app.api.call(`/api/agents/sessions/${sessionId}`, {
                method: 'DELETE'
            });

            if (response && response.success) {
                this.app.ui.showNotification('Research session deleted', 'success');
                await this.loadSessions();
                
                // If we're viewing this session, go back to sessions list
                if (this.currentSession && this.currentSession.id === sessionId) {
                    this.showAgents();
                }
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            this.app.ui.showNotification('Error deleting research session', 'error');
        }
    }

    /**
     * Start real-time session updates
     */
    startSessionUpdates() {
        if (!this.currentSession || this.eventSource) return;

        // EventSource doesn't support Authorization headers, so pass token as query parameter
        const token = this.app.token;
        this.eventSource = new EventSource(`/api/agents/sessions/${this.currentSession.id}/events?token=${token}`);
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleSessionUpdate(data);
            } catch (error) {
                console.error('Error parsing session update:', error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('Session update stream error:', error);
            this.stopSessionUpdates();
        };
    }

    /**
     * Stop real-time session updates
     */
    stopSessionUpdates() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /**
     * Handle session update from stream
     */
    handleSessionUpdate(data) {
        if (data.type === 'progress') {
            const progressBar = document.getElementById('sessionProgressBar');
            const progressText = document.getElementById('sessionProgressText');
            if (progressBar && data.progress !== undefined) {
                progressBar.style.width = `${data.progress}%`;
                progressText.textContent = `${data.progress}% complete`;
            }
        } else if (data.type === 'log') {
            // Add new log entry
            this.appendLogEntry(data.log);
        } else if (data.type === 'result') {
            // Add new result
            this.appendResult(data.result);
        } else if (data.type === 'status') {
            // Update session status
            const statusBadge = document.getElementById('sessionDetailStatus');
            if (statusBadge) {
                statusBadge.textContent = data.status;
                statusBadge.className = `badge ${this.getStatusBadgeClass(data.status)}`;
            }
            
            // Handle error status with user notification
            if (data.status === 'error') {
                this.app.ui.showNotification(
                    `Session failed: ${data.message || data.error || 'Unknown error'}`, 
                    'error'
                );
                
                // Show error details in session view if available
                const errorContainer = document.getElementById('sessionErrorDetails');
                if (errorContainer && data.error) {
                    errorContainer.innerHTML = `
                        <div class="alert alert-danger mt-3">
                            <h6 class="alert-heading">Session Error</h6>
                            <p class="mb-1"><strong>Agent:</strong> ${data.agentId || 'Unknown'}</p>
                            <p class="mb-0"><strong>Error:</strong> ${this.escapeHtml(data.error)}</p>
                            ${data.timestamp ? `<small class="text-muted">Occurred at: ${new Date(data.timestamp).toLocaleString()}</small>` : ''}
                        </div>
                    `;
                    errorContainer.style.display = 'block';
                }
                
                this.stopSessionUpdates();
            } else if (data.status === 'completed') {
                this.app.ui.showNotification('Research session completed successfully', 'success');
                this.stopSessionUpdates();
            } else if (data.status === 'stopped') {
                this.app.ui.showNotification('Research session stopped', 'info');
                this.stopSessionUpdates();
            }
            
            // Update current session status if we're viewing it
            if (this.currentSession) {
                this.currentSession.status = data.status;
                this.updateSessionButtons();
            }
            
            // Refresh sessions list to show updated status
            this.loadSessions();
        }
    }

    /**
     * Append new log entry
     */
    appendLogEntry(log) {
        const container = document.getElementById('sessionLogs');
        if (!container) return;

        // Map the log data properly based on source (SSE vs API)
        const agentType = this.extractAgentType(log.agent_id || log.agentId) || log.agent_type || 'System';
        const level = log.log_level || log.level || 'info';
        const message = log.message;
        const timestamp = log.created_at || log.timestamp;
        const details = log.details || log.data;

        const logHtml = `
            <div class="log-entry ${level}" data-timestamp="${timestamp}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <strong>${agentType}:</strong> ${this.escapeHtml(message)}
                    </div>
                    <small class="text-muted">${new Date(timestamp).toLocaleTimeString()}</small>
                </div>
                ${details && Object.keys(details).length > 0 ? `<pre class="mt-2 small"><code>${JSON.stringify(details, null, 2)}</code></pre>` : ''}
            </div>
        `;

        container.insertAdjacentHTML('beforeend', logHtml);
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Append new result
     */
    appendResult(result) {
        const container = document.getElementById('sessionResults');
        if (!container) return;

        // Remove "no results" message if present
        if (container.querySelector('.text-muted')) {
            container.innerHTML = '';
        }

        const resultHtml = `
            <div class="result-card card mb-3">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${result.title || result.type || 'Result'}</h6>
                        <small class="text-muted">${new Date(result.createdAt || result.timestamp).toLocaleString()}</small>
                    </div>
                </div>
                <div class="card-body">
                    ${this.renderResultContent(result)}
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', resultHtml);
    }

    /**
     * Back to agents list
     */
    backToAgents() {
        this.stopSessionUpdates();
        this.currentSession = null;
        this.showAgents();
    }

    /**
     * Clean up when module is destroyed
     */
    destroy() {
        this.stopSessionUpdates();
    }

    /**
     * Extract agent type from agent ID for display purposes
     */
    extractAgentType(agentId) {
        if (!agentId) return null;
        
        // Extract the type from agent ID patterns like:
        // "sessionId-orchestrator" or "sessionId_source_discovery_timestamp"
        if (agentId.includes('orchestrator')) return 'Orchestrator';
        if (agentId.includes('source_discovery')) return 'Source Discovery';
        if (agentId.includes('content_analysis')) return 'Content Analysis';
        if (agentId.includes('synthesis')) return 'Synthesis';
        if (agentId.includes('fact_checking')) return 'Fact Checking';
        
        // Fallback: try to extract any agent type pattern
        const match = agentId.match(/-([\w_]+)(?:-\d+)?$/);
        if (match) {
            return match[1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        
        return 'Agent';
    }

    /**
     * Expand results to fullscreen mode
     */
    expandResultsToFullscreen() {
        if (!this.currentResults || this.currentResults.length === 0) {
            return;
        }

        const modal = document.getElementById('fullscreenResultsModal');
        const content = document.getElementById('fullscreenResultsContent');
        
        if (!modal || !content) {
            console.error('Fullscreen modal elements not found');
            return;
        }

        // Set initial render mode
        this.fullscreenRenderMode = 'rendered';
        
        // Render content in fullscreen
        this.renderFullscreenContent();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    /**
     * Copy results to clipboard
     */
    copyResultsToClipboard() {
        const resultsContainer = document.getElementById('sessionResults');
        if (!resultsContainer) return;

        // Get all result cards
        const resultCards = resultsContainer.querySelectorAll('.result-card');
        if (resultCards.length === 0) {
            this.app.ui.showNotification('No results to copy', 'info');
            return;
        }

        // Extract text content from result cards
        let resultsText = '';
        resultCards.forEach(card => {
            const title = card.querySelector('h6')?.innerText || '';
            const body = card.querySelector('.card-body')?.innerText || '';
            resultsText += `**${title}**\n${body}\n\n`;
        });

        // Copy to clipboard
        navigator.clipboard.writeText(resultsText).then(() => {
            this.app.ui.showNotification('Results copied to clipboard', 'success');
        }).catch(err => {
            console.error('Error copying results to clipboard:', err);
            this.app.ui.showNotification('Failed to copy results', 'error');
        });
    }

    /**
     * Copy fullscreen results to clipboard
     */
    copyFullscreenResultsToClipboard() {
        const fullscreenContainer = document.getElementById('fullscreenResultsContainer');
        if (!fullscreenContainer) return;

        // Get the current HTML content of the fullscreen results
        const content = fullscreenContainer.innerHTML;

        // Copy to clipboard
        navigator.clipboard.writeText(content).then(() => {
            this.app.ui.showNotification('Fullscreen results copied to clipboard', 'success');
        }).catch(err => {
            console.error('Error copying fullscreen results to clipboard:', err);
            this.app.ui.showNotification('Failed to copy fullscreen results', 'error');
        });
    }

    /**
     * Toggle render mode for results
     */
    toggleRenderMode() {
        const resultsContainer = document.getElementById('sessionResults');
        if (!resultsContainer) return;

        // Toggle between JSON and Markdown render modes
        const isJson = resultsContainer.classList.toggle('json-rendered');
        const isMarkdown = resultsContainer.classList.toggle('markdown-rendered');

        // Update button text
        const toggleBtn = document.getElementById('toggleRenderModeBtn');
        if (toggleBtn) {
            toggleBtn.innerHTML = isJson ? '<i class="fas fa-markdown"></i> Render as Markdown' : '<i class="fas fa-code"></i> Render as JSON';
        }

        // Render Markdown if enabled
        if (isMarkdown) {
            this.renderMarkdownResults(resultsContainer);
        } else {
            // Revert to JSON view
            this.revertJsonResults(resultsContainer);
        }
    }

    /**
     * Render Markdown content in results container
     */
    renderMarkdownResults(container) {
        const jsonContent = container.dataset.jsonContent;
        if (!jsonContent) return;

        // Convert JSON content to Markdown
        const markdownContent = this.jsonToMarkdown(JSON.parse(jsonContent));

        // Set the converted content
        container.innerHTML = markdownContent;

        // Optionally, highlight code blocks
        this.highlightCodeBlocks(container);
    }

    /**
     * Convert JSON object to Markdown format
     */
    jsonToMarkdown(json, indent = 0) {
        if (typeof json !== 'object' || json === null) {
            return this.escapeHtml(String(json));
        }

        let markdown = '';
        const padding = '  '.repeat(indent);

        if (Array.isArray(json)) {
            json.forEach(item => {
                markdown += `${padding}- ${this.jsonToMarkdown(item, indent + 1)}\n`;
            });
        } else {
            Object.keys(json).forEach(key => {
                const value = json[key];
                markdown += `${padding}**${this.escapeHtml(key)}**: ${this.jsonToMarkdown(value, indent + 1)}\n`;
            });
        }

        return markdown;
    }

    /**
     * Highlight code blocks in the container
     */
    highlightCodeBlocks(container) {
        // Find all preformatted text blocks
        const codeBlocks = container.querySelectorAll('pre');
        codeBlocks.forEach(block => {
            // Apply syntax highlighting (e.g., using highlight.js)
            hljs.highlightElement(block);
        });
    }

    /**
     * Revert results container to JSON view
     */
    revertJsonResults(container) {
        const jsonContent = container.dataset.jsonContent;
        if (!jsonContent) return;

        // Parse and stringify to format JSON content
        const jsonData = JSON.parse(jsonContent);
        const formattedJson = JSON.stringify(jsonData, null, 2);

        // Set the formatted JSON content
        container.innerHTML = `<pre><code>${this.escapeHtml(formattedJson)}</code></pre>`;
    }

    /**
     * Show save to collection modal
     */
    async showSaveToCollectionModal() {
        try {
            // Load user collections
            await this.loadUserCollections();
            
            // Pre-fill the document title
            const session = this.currentSession;
            if (session) {
                const titleField = document.getElementById('saveDocumentTitle');
                if (titleField) {
                    const sessionTopic = session.research_topic || 'Research Report';
                    const timestamp = new Date().toLocaleDateString();
                    titleField.value = `${sessionTopic} - ${timestamp}`;
                }
            }
            
            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('saveToCollectionModal'));
            modal.show();
        } catch (error) {
            console.error('Error showing save to collection modal:', error);
            this.app.showNotification('Failed to load collections', 'error');
        }
    }

    /**
     * Load user collections for the save modal
     */
    async loadUserCollections() {
        try {
            const collections = await this.app.api.getCollections();
            const selectElement = document.getElementById('saveCollectionSelect');
            
            if (!selectElement) return;

            // Clear existing options
            selectElement.innerHTML = '';

            // Handle response format
            let collectionsArray = [];
            if (Array.isArray(collections)) {
                collectionsArray = collections;
            } else if (collections && Array.isArray(collections.data)) {
                collectionsArray = collections.data;
            }

            if (collectionsArray.length === 0) {
                selectElement.innerHTML = '<option value="">No collections available</option>';
                return;
            }

            // Add default option
            selectElement.innerHTML = '<option value="">Select a collection...</option>';

            // Add collections as options
            collectionsArray.forEach(collection => {
                const option = document.createElement('option');
                option.value = collection.id;
                option.textContent = `${collection.name} (${collection.document_count || 0} documents)`;
                selectElement.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading collections:', error);
            const selectElement = document.getElementById('saveCollectionSelect');
            if (selectElement) {
                selectElement.innerHTML = '<option value="">Error loading collections</option>';
            }
        }
    }

    /**
     * Save research report to selected collection
     */
    async saveResearchToCollection() {
        try {
            const collectionId = document.getElementById('saveCollectionSelect').value;
            const title = document.getElementById('saveDocumentTitle').value.trim();
            const docType = document.getElementById('saveDocumentType').value;

            if (!collectionId) {
                this.app.showNotification('Please select a collection', 'warning');
                return;
            }

            if (!title) {
                this.app.showNotification('Please enter a document title', 'warning');
                return;
            }

            // Extract the markdown content from current results
            const markdownContent = this.extractMarkdownContent();
            
            if (!markdownContent.trim()) {
                this.app.showNotification('No research content available to save', 'warning');
                return;
            }

            // Show loading state
            const confirmBtn = document.getElementById('confirmSaveToCollection');
            const originalText = confirmBtn.innerHTML;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';
            confirmBtn.disabled = true;

            // Save to collection using the create-text endpoint
            const response = await this.app.api.call(`/api/collections/${collectionId}/documents/create-text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title,
                    content: markdownContent,
                    type: docType
                })
            });

            if (response && response.success) {
                // Success - close modal and show notification
                const modal = bootstrap.Modal.getInstance(document.getElementById('saveToCollectionModal'));
                modal.hide();
                
                this.app.showNotification(`Research report saved to collection successfully! ${response.chunksStored || 0} chunks stored.`, 'success');
                
                // Optionally show details
                if (response.document) {
                    console.log('Saved document:', response.document);
                }
            } else {
                throw new Error(response?.message || 'Failed to save document');
            }

        } catch (error) {
            console.error('Error saving to collection:', error);
            this.app.showNotification(`Failed to save research report: ${error.message}`, 'error');
        } finally {
            // Reset button state
            const confirmBtn = document.getElementById('confirmSaveToCollection');
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Report';
                confirmBtn.disabled = false;
            }
        }
    }

    /**
     * Extract markdown content from current session results
     */
    extractMarkdownContent() {
        if (!this.currentSession) return '';

        // Get all research summary artifacts
        const container = document.getElementById('sessionResults');
        if (!container) return '';

        // Try to get stored markdown content from last display
        const storedContent = container.dataset.markdownContent;
        if (storedContent) {
            return storedContent;
        }

        // Fallback: extract from current session data if available
        // This would need to be implemented based on how the session data is stored
        return this.buildMarkdownFromSession();
    }

    /**
     * Extract all markdown content from results array
     */
    extractAllMarkdownContent(results) {
        if (!results || results.length === 0) return '';

        let markdownContent = '';

        // Add session header
        if (this.currentSession) {
            markdownContent += `# ${this.currentSession.research_topic || 'Research Report'}\n\n`;
            markdownContent += `**Generated:** ${new Date().toLocaleString()}\n`;
            markdownContent += `**Session ID:** ${this.currentSession.id}\n\n`;

            if (this.currentSession.preferences) {
                markdownContent += `**Configuration:**\n`;
                Object.entries(this.currentSession.preferences).forEach(([key, value]) => {
                    markdownContent += `- ${key}: ${value}\n`;
                });
                markdownContent += '\n';
            }

            markdownContent += '---\n\n';
        }

        // Process each result
        results.forEach((result, index) => {
            const resultTitle = result.title || result.artifact_type || `Result ${index + 1}`;
            markdownContent += `## ${resultTitle}\n\n`;
            
            if (result.created_at || result.createdAt) {
                markdownContent += `**Created:** ${new Date(result.created_at || result.createdAt).toLocaleString()}\n\n`;
            }

            // Extract content based on type
            if ((result.artifact_type === 'research_summary' || result.type === 'research_summary') && result.content && result.content.report) {
                markdownContent += result.content.report + '\n\n';

                // Add quality metrics if available
                if (result.content.quality) {
                    markdownContent += `### Quality Metrics\n\n`;
                    markdownContent += `- **Coverage Score:** ${result.content.quality.coverageScore}%\n`;
                    markdownContent += `- **Coherence Score:** ${result.content.quality.coherenceScore}%\n`;
                    markdownContent += `- **Confidence Score:** ${Math.round(result.content.quality.confidenceScore * 100)}%\n\n`;
                }

                // Add statistics if available
                if (result.content.statistics) {
                    markdownContent += `### Research Statistics\n\n`;
                    markdownContent += `- **Total Agents:** ${result.content.statistics.totalAgents}\n`;
                    markdownContent += `- **Total Artifacts:** ${result.content.statistics.totalArtifacts}\n`;
                    markdownContent += `- **Research Duration:** ${Math.round(result.content.statistics.researchDuration / 1000)} seconds\n\n`;
                }
            } else if (result.content) {
                // Handle other content types
                if (typeof result.content === 'string') {
                    markdownContent += result.content + '\n\n';
                } else if (typeof result.content === 'object') {
                    markdownContent += '```json\n' + JSON.stringify(result.content, null, 2) + '\n```\n\n';
                }
            }

            if (index < results.length - 1) {
                markdownContent += '---\n\n';
            }
        });

        return markdownContent;
    }

    /**
     * Build markdown content from current session data
     */
    buildMarkdownFromSession() {
        if (!this.currentSession) return '';

        let markdown = `# ${this.currentSession.research_topic || 'Research Report'}\n\n`;
        markdown += `**Generated:** ${new Date().toLocaleString()}\n`;
        markdown += `**Session ID:** ${this.currentSession.id}\n\n`;

        // Add any other session metadata
        if (this.currentSession.preferences) {
            markdown += `**Configuration:**\n`;
            Object.entries(this.currentSession.preferences).forEach(([key, value]) => {
                markdown += `- ${key}: ${value}\n`;
            });
            markdown += '\n';
        }

        markdown += '**Note:** Full research content will be displayed when the session completes.\n\n';
        markdown += 'This is a placeholder that will be replaced with the actual research report content once generated by the agents.';

        return markdown;
    }
}
