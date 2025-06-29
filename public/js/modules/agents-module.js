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
    }

    /**
     * Initialize agents module
     */
    init() {
        this.loadAgentTemplates();
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

        container.innerHTML = logs.map(log => `
            <div class="log-entry ${log.level}" data-timestamp="${log.timestamp}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <strong>${log.agent_type || 'System'}:</strong> ${this.escapeHtml(log.message)}
                    </div>
                    <small class="text-muted">${new Date(log.timestamp).toLocaleTimeString()}</small>
                </div>
                ${log.data ? `<pre class="mt-2 small"><code>${JSON.stringify(log.data, null, 2)}</code></pre>` : ''}
            </div>
        `).join('');

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

        if (!results || results.length === 0) {
            container.innerHTML = '<p class="text-muted">No results generated yet.</p>';
            return;
        }

        container.innerHTML = results.map(result => `
            <div class="result-card card mb-3">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${result.agent_type || 'Result'}</h6>
                        <small class="text-muted">${new Date(result.timestamp).toLocaleString()}</small>
                    </div>
                </div>
                <div class="card-body">
                    ${result.type === 'text' ? `
                        <p>${this.escapeHtml(result.content)}</p>
                    ` : result.type === 'data' ? `
                        <pre><code>${JSON.stringify(result.data, null, 2)}</code></pre>
                    ` : result.type === 'link' ? `
                        <a href="${result.url}" target="_blank" class="text-decoration-none">
                            <i class="fas fa-external-link-alt me-2"></i>${this.escapeHtml(result.title || result.url)}
                        </a>
                        ${result.summary ? `<p class="mt-2 text-muted">${this.escapeHtml(result.summary)}</p>` : ''}
                    ` : `
                        <p>${this.escapeHtml(result.content || 'Unknown result type')}</p>
                    `}
                </div>
            </div>
        `).join('');
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

        const logHtml = `
            <div class="log-entry ${log.level}" data-timestamp="${log.timestamp}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <strong>${log.agent_type || 'System'}:</strong> ${this.escapeHtml(log.message)}
                    </div>
                    <small class="text-muted">${new Date(log.timestamp).toLocaleTimeString()}</small>
                </div>
                ${log.data ? `<pre class="mt-2 small"><code>${JSON.stringify(log.data, null, 2)}</code></pre>` : ''}
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
                        <h6 class="mb-0">${result.agent_type || 'Result'}</h6>
                        <small class="text-muted">${new Date(result.timestamp).toLocaleString()}</small>
                    </div>
                </div>
                <div class="card-body">
                    ${result.type === 'text' ? `
                        <p>${this.escapeHtml(result.content)}</p>
                    ` : result.type === 'data' ? `
                        <pre><code>${JSON.stringify(result.data, null, 2)}</code></pre>
                    ` : result.type === 'link' ? `
                        <a href="${result.url}" target="_blank" class="text-decoration-none">
                            <i class="fas fa-external-link-alt me-2"></i>${this.escapeHtml(result.title || result.url)}
                        </a>
                        ${result.summary ? `<p class="mt-2 text-muted">${this.escapeHtml(result.summary)}</p>` : ''}
                    ` : `
                        <p>${this.escapeHtml(result.content || 'Unknown result type')}</p>
                    `}
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
}
