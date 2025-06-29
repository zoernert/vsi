/**
 * VSI Agent System Frontend Interface
 * Provides UI components for managing research sessions and agents
 */

class AgentSystemUI {
    constructor() {
        this.apiBaseUrl = '/api/agents';
        this.currentSession = null;
        this.activeAgents = new Map();
        this.eventSource = null;
        
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        // Create main container
        const agentContainer = document.createElement('div');
        agentContainer.id = 'agent-system-container';
        agentContainer.className = 'agent-system-container';
        
        agentContainer.innerHTML = `
            <div class="agent-header">
                <h2>🤖 VSI Agent System</h2>
                <div class="agent-controls">
                    <button id="create-session-btn" class="btn btn-primary">
                        ➕ New Research Session
                    </button>
                    <button id="load-session-btn" class="btn btn-secondary">
                        📂 Load Session
                    </button>
                </div>
            </div>
            
            <div class="agent-main">
                <div class="session-panel">
                    <div id="session-info" class="session-info" style="display: none;">
                        <h3>📋 Current Session</h3>
                        <div class="session-details">
                            <div class="detail-item">
                                <label>Session ID:</label>
                                <span id="session-id">-</span>
                            </div>
                            <div class="detail-item">
                                <label>Research Topic:</label>
                                <span id="research-topic">-</span>
                            </div>
                            <div class="detail-item">
                                <label>Status:</label>
                                <span id="session-status" class="status-badge">-</span>
                            </div>
                            <div class="detail-item">
                                <label>Progress:</label>
                                <div class="progress-bar">
                                    <div id="progress-fill" class="progress-fill" style="width: 0%;"></div>
                                    <span id="progress-text" class="progress-text">0%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="session-actions">
                            <button id="start-agents-btn" class="btn btn-success">
                                ▶️ Start Agents
                            </button>
                            <button id="pause-session-btn" class="btn btn-warning">
                                ⏸️ Pause Session
                            </button>
                            <button id="stop-session-btn" class="btn btn-danger">
                                ⏹️ Stop Session
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="agents-panel">
                    <h3>🤖 Active Agents</h3>
                    <div id="agents-list" class="agents-list">
                        <div class="no-agents">No active agents</div>
                    </div>
                </div>
                
                <div class="artifacts-panel">
                    <h3>📄 Generated Artifacts</h3>
                    <div id="artifacts-list" class="artifacts-list">
                        <div class="no-artifacts">No artifacts generated yet</div>
                    </div>
                </div>
            </div>
            
            <div class="agent-footer">
                <div class="status-indicator">
                    <span id="connection-status" class="status-dot status-disconnected"></span>
                    <span id="connection-text">Disconnected</span>
                </div>
                <div class="action-log">
                    <button id="toggle-log-btn" class="btn btn-link">📜 Show Log</button>
                </div>
            </div>
            
            <div id="action-log" class="action-log-panel" style="display: none;">
                <div class="log-header">
                    <h4>📜 Action Log</h4>
                    <button id="clear-log-btn" class="btn btn-link">🗑️ Clear</button>
                </div>
                <div id="log-content" class="log-content"></div>
            </div>
        `;
        
        // Add to page (assumes there's a container with id 'main-content')
        const mainContent = document.getElementById('main-content') || document.body;
        mainContent.appendChild(agentContainer);
        
        // Add CSS
        this.addStyles();
    }

    addStyles() {
        const styles = `
            .agent-system-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .agent-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #e1e5e9;
            }
            
            .agent-header h2 {
                margin: 0;
                color: #2c3e50;
            }
            
            .agent-controls {
                display: flex;
                gap: 10px;
            }
            
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            .btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .btn-primary { background: #3498db; color: white; }
            .btn-secondary { background: #95a5a6; color: white; }
            .btn-success { background: #27ae60; color: white; }
            .btn-warning { background: #f39c12; color: white; }
            .btn-danger { background: #e74c3c; color: white; }
            .btn-link { background: transparent; color: #3498db; border: 1px solid #3498db; }
            
            .agent-main {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: auto auto;
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .session-panel {
                grid-column: 1 / -1;
            }
            
            .session-info {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e1e5e9;
            }
            
            .session-details {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .detail-item {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .detail-item label {
                font-weight: 600;
                color: #7f8c8d;
                font-size: 12px;
                text-transform: uppercase;
            }
            
            .status-badge {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                width: fit-content;
            }
            
            .status-created { background: #ecf0f1; color: #7f8c8d; }
            .status-running { background: #d5f4e6; color: #27ae60; }
            .status-paused { background: #fef9e7; color: #f39c12; }
            .status-completed { background: #d5f4e6; color: #27ae60; }
            .status-error { background: #fadbd8; color: #e74c3c; }
            
            .progress-bar {
                position: relative;
                background: #ecf0f1;
                border-radius: 10px;
                height: 20px;
                overflow: hidden;
            }
            
            .progress-fill {
                background: linear-gradient(90deg, #3498db, #2ecc71);
                height: 100%;
                transition: width 0.3s ease;
            }
            
            .progress-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 11px;
                font-weight: 600;
                color: #2c3e50;
            }
            
            .session-actions {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .agents-panel, .artifacts-panel {
                background: white;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e1e5e9;
                height: fit-content;
            }
            
            .agents-list, .artifacts-list {
                margin-top: 15px;
            }
            
            .agent-item, .artifact-item {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 10px;
                border-left: 4px solid #3498db;
            }
            
            .agent-item.running { border-left-color: #27ae60; }
            .agent-item.paused { border-left-color: #f39c12; }
            .agent-item.error { border-left-color: #e74c3c; }
            .agent-item.completed { border-left-color: #2ecc71; }
            
            .agent-item h4, .artifact-item h4 {
                margin: 0 0 8px 0;
                font-size: 14px;
                color: #2c3e50;
            }
            
            .agent-item p, .artifact-item p {
                margin: 0;
                font-size: 12px;
                color: #7f8c8d;
            }
            
            .no-agents, .no-artifacts {
                text-align: center;
                color: #bdc3c7;
                font-style: italic;
                padding: 40px 20px;
            }
            
            .agent-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 0;
                border-top: 1px solid #e1e5e9;
            }
            
            .status-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }
            
            .status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            
            .status-connected { background: #27ae60; }
            .status-disconnected { background: #e74c3c; }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            .action-log-panel {
                background: #2c3e50;
                color: #ecf0f1;
                border-radius: 8px;
                margin-top: 20px;
                max-height: 300px;
                overflow: hidden;
            }
            
            .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid #34495e;
            }
            
            .log-header h4 {
                margin: 0;
                font-size: 14px;
            }
            
            .log-content {
                padding: 0;
                max-height: 250px;
                overflow-y: auto;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
                line-height: 1.4;
            }
            
            .log-entry {
                padding: 8px 20px;
                border-bottom: 1px solid rgba(52, 73, 94, 0.5);
                display: flex;
                gap: 10px;
            }
            
            .log-entry:last-child {
                border-bottom: none;
            }
            
            .log-timestamp {
                color: #bdc3c7;
                flex-shrink: 0;
            }
            
            .log-level {
                flex-shrink: 0;
                font-weight: 600;
                width: 50px;
            }
            
            .log-level.info { color: #3498db; }
            .log-level.success { color: #27ae60; }
            .log-level.warning { color: #f39c12; }
            .log-level.error { color: #e74c3c; }
            
            .log-message {
                flex: 1;
            }
            
            @media (max-width: 768px) {
                .agent-main {
                    grid-template-columns: 1fr;
                }
                
                .agent-header {
                    flex-direction: column;
                    gap: 15px;
                    align-items: stretch;
                }
                
                .session-details {
                    grid-template-columns: 1fr;
                }
                
                .session-actions {
                    justify-content: center;
                }
            }
            
            /* External Content Configuration Styles */
            .external-sources-section {
                border-top: 1px solid #e1e5e9;
                padding-top: 20px;
                margin-top: 20px;
            }
            
            .external-sources-section h4 {
                margin: 0 0 10px 0;
                color: #2c3e50;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .help-text {
                color: #7f8c8d;
                font-size: 14px;
                margin: 0 0 15px 0;
                line-height: 1.4;
            }
            
            .config-group {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                border: 1px solid #e1e5e9;
            }
            
            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 10px;
                cursor: pointer;
                font-size: 14px;
            }
            
            .checkbox-label input[type="checkbox"] {
                margin: 0;
            }
            
            .nested-config {
                margin-left: 20px;
                padding: 15px;
                background: white;
                border-radius: 4px;
                border: 1px solid #dee2e6;
                margin-top: 10px;
            }
            
            .config-row {
                display: flex;
                gap: 20px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .input-group {
                flex: 1;
                min-width: 200px;
            }
            
            .input-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                font-size: 14px;
                color: #495057;
            }
            
            .form-control {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-size: 14px;
                transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            }
            
            .form-control:focus {
                border-color: #80bdff;
                outline: 0;
                box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
            }
            
            textarea.form-control {
                resize: vertical;
                min-height: 80px;
            }
            
            .warning-box {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                padding: 12px;
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 4px;
                margin-top: 15px;
                font-size: 13px;
                line-height: 1.4;
            }
            
            .warning-icon {
                color: #856404;
                font-size: 16px;
                flex-shrink: 0;
            }
            
            .warning-box span:not(.warning-icon) {
                color: #856404;
            }
            
            small.help-text {
                display: block;
                margin-top: 5px;
                font-size: 12px;
                color: #6c757d;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    setupEventListeners() {
        // Create Session button
        document.getElementById('create-session-btn').addEventListener('click', () => {
            this.showCreateSessionDialog();
        });

        // Load Session button
        document.getElementById('load-session-btn').addEventListener('click', () => {
            this.showLoadSessionDialog();
        });

        // Start Agents button
        document.getElementById('start-agents-btn').addEventListener('click', () => {
            this.startAgents();
        });

        // Pause Session button
        document.getElementById('pause-session-btn').addEventListener('click', () => {
            this.pauseSession();
        });

        // Stop Session button
        document.getElementById('stop-session-btn').addEventListener('click', () => {
            this.stopSession();
        });

        // Toggle Log button
        document.getElementById('toggle-log-btn').addEventListener('click', () => {
            this.toggleLog();
        });

        // Clear Log button
        document.getElementById('clear-log-btn').addEventListener('click', () => {
            this.clearLog();
        });
    }

    showCreateSessionDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🆕 Create New Research Session</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-session-form">
                        <div class="form-group">
                            <label for="research-topic-input">Research Topic:</label>
                            <input type="text" id="research-topic-input" 
                                   placeholder="e.g., AI in Healthcare, Climate Change Solutions..."
                                   required>
                        </div>
                        <div class="form-group">
                            <label for="max-sources-input">Maximum Sources:</label>
                            <input type="number" id="max-sources-input" value="50" min="10" max="200">
                        </div>
                        <div class="form-group">
                            <label for="analysis-frameworks">Analysis Frameworks:</label>
                            <div class="checkbox-group">
                                <label><input type="checkbox" value="thematic" checked> Thematic Analysis</label>
                                <label><input type="checkbox" value="sentiment" checked> Sentiment Analysis</label>
                                <label><input type="checkbox" value="trend"> Trend Analysis</label>
                                <label><input type="checkbox" value="comparative"> Comparative Analysis</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="output-format">Output Format:</label>
                            <select id="output-format">
                                <option value="comprehensive_report">Comprehensive Report</option>
                                <option value="executive_summary">Executive Summary</option>
                                <option value="data_analysis">Data Analysis</option>
                                <option value="literature_review">Literature Review</option>
                            </select>
                        </div>
                        
                        <!-- External Content Sources Configuration -->
                        <div class="form-group external-sources-section">
                            <h4>🌐 External Content Sources</h4>
                            <p class="help-text">Enable external web sources to enhance research with current information</p>
                            
                            <div class="config-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="enableExternalSources"> 
                                    <span>Enable external sources for research</span>
                                </label>
                                
                                <div id="externalSourcesConfig" class="nested-config" style="display:none;">
                                    <div class="config-row">
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="enableWebSearch"> 
                                            <span>Web Search (DuckDuckGo)</span>
                                        </label>
                                        
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="enableWebBrowsing"> 
                                            <span>Web Page Content Analysis</span>
                                        </label>
                                    </div>
                                    
                                    <div class="config-row">
                                        <div class="input-group">
                                            <label for="maxExternalSources">Max External Sources:</label>
                                            <input type="number" id="maxExternalSources" value="5" min="1" max="20" class="form-control">
                                        </div>
                                        
                                        <div class="input-group">
                                            <label for="searchProvider">Search Provider:</label>
                                            <select id="searchProvider" class="form-control">
                                                <option value="duckduckgo">DuckDuckGo</option>
                                                <option value="google">Google</option>
                                                <option value="bing">Bing</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div class="input-group">
                                        <label for="externalUrls">Additional URLs (optional):</label>
                                        <textarea id="externalUrls" placeholder="https://example.com&#10;https://another-site.com" rows="3" class="form-control"></textarea>
                                        <small class="help-text">One URL per line. These will be analyzed in addition to web search results.</small>
                                    </div>
                                    
                                    <div class="warning-box">
                                        <span class="warning-icon">⚠️</span>
                                        <span>External sources may increase research time and require internet access. Content will be processed according to our privacy policy.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Create Session
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Form submission
        document.getElementById('create-session-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const topic = document.getElementById('research-topic-input').value;
            const maxSources = parseInt(document.getElementById('max-sources-input').value);
            const frameworks = Array.from(document.querySelectorAll('#analysis-frameworks input:checked'))
                .map(cb => cb.value);
            const outputFormat = document.getElementById('output-format').value;
            
            // Collect external content configuration
            const enableExternalSources = document.getElementById('enableExternalSources').checked;
            const externalContentConfig = {};
            
            if (enableExternalSources) {
                externalContentConfig.enableExternalSources = true;
                externalContentConfig.enableWebSearch = document.getElementById('enableWebSearch').checked;
                externalContentConfig.enableWebBrowsing = document.getElementById('enableWebBrowsing').checked;
                externalContentConfig.maxExternalSources = parseInt(document.getElementById('maxExternalSources').value);
                externalContentConfig.searchProvider = document.getElementById('searchProvider').value;
                
                // Parse additional URLs
                const externalUrls = document.getElementById('externalUrls').value.trim();
                if (externalUrls) {
                    externalContentConfig.externalUrls = externalUrls.split('\n')
                        .map(url => url.trim())
                        .filter(url => url.length > 0);
                }
            }
            
            await this.createSession(topic, {
                maxSources,
                analysisFrameworks: frameworks,
                outputFormat,
                ...externalContentConfig
            });
            
            dialog.remove();
        });

        // Close button
        dialog.querySelector('.modal-close').addEventListener('click', () => {
            dialog.remove();
        });
        
        // External content configuration handlers
        const enableExternalSourcesCheckbox = document.getElementById('enableExternalSources');
        const externalSourcesConfig = document.getElementById('externalSourcesConfig');
        
        enableExternalSourcesCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                externalSourcesConfig.style.display = 'block';
                // Enable web search by default when external sources are enabled
                document.getElementById('enableWebSearch').checked = true;
            } else {
                externalSourcesConfig.style.display = 'none';
                // Reset all nested options
                document.getElementById('enableWebSearch').checked = false;
                document.getElementById('enableWebBrowsing').checked = false;
                document.getElementById('maxExternalSources').value = 5;
                document.getElementById('searchProvider').value = 'duckduckgo';
                document.getElementById('externalUrls').value = '';
            }
        });
        
        // Add tooltips for external content options
        this.addExternalContentTooltips(dialog);
        
        // Add modal styles
        this.addModalStyles();
    }
    
    addExternalContentTooltips(dialog) {
        // Add tooltips for better user experience
        const tooltips = [
            {
                selector: '#enableWebSearch',
                text: 'Search the web for current information related to your research topic'
            },
            {
                selector: '#enableWebBrowsing', 
                text: 'Analyze specific web pages and extract relevant content using AI'
            },
            {
                selector: '#maxExternalSources',
                text: 'Maximum number of external sources to include in analysis (1-20)'
            },
            {
                selector: '#searchProvider',
                text: 'Choose your preferred search engine provider'
            },
            {
                selector: '#externalUrls',
                text: 'Specific URLs to analyze in addition to search results'
            }
        ];
        
        tooltips.forEach(({ selector, text }) => {
            const element = dialog.querySelector(selector);
            if (element) {
                element.title = text;
                element.setAttribute('data-tooltip', text);
            }
        });
    }
    
    addModalStyles() {
        if (document.getElementById('modal-styles')) return;
        
        const styles = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .modal-content {
                background: white;
                border-radius: 8px;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #e1e5e9;
            }
            
            .modal-header h3 {
                margin: 0;
                color: #2c3e50;
            }
            
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #7f8c8d;
            }
            
            .modal-body {
                padding: 20px;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
                color: #2c3e50;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                box-sizing: border-box;
            }
            
            .checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .checkbox-group label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: normal;
                margin-bottom: 0;
            }
            
            .checkbox-group input[type="checkbox"] {
                width: auto;
            }
            
            .form-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                padding-top: 20px;
                border-top: 1px solid #e1e5e9;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'modal-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    async createSession(topic, preferences) {
        try {
            this.log('info', `Creating session for topic: ${topic}`);
            
            const response = await fetch(`${this.apiBaseUrl}/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: 'current-user', // In real app, get from auth
                    researchTopic: topic,
                    preferences
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const session = await response.json();
            this.currentSession = session;
            this.updateSessionDisplay();
            this.setupEventSource();
            
            this.log('success', `Session created: ${session.id}`);
        } catch (error) {
            this.log('error', `Failed to create session: ${error.message}`);
            alert(`Failed to create session: ${error.message}`);
        }
    }

    updateSessionDisplay() {
        if (!this.currentSession) {
            document.getElementById('session-info').style.display = 'none';
            return;
        }
        
        document.getElementById('session-info').style.display = 'block';
        document.getElementById('session-id').textContent = this.currentSession.id;
        document.getElementById('research-topic').textContent = this.currentSession.research_topic;
        
        const statusElement = document.getElementById('session-status');
        statusElement.textContent = this.currentSession.status;
        statusElement.className = `status-badge status-${this.currentSession.status}`;
    }

    async startAgents() {
        if (!this.currentSession) {
            alert('No active session');
            return;
        }
        
        try {
            this.log('info', 'Starting agents...');
            
            const response = await fetch(`${this.apiBaseUrl}/sessions/${this.currentSession.id}/agents/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: 'current-user',
                    agentTypes: ['orchestrator', 'source_discovery', 'content_analysis']
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.log('success', `Started ${result.agents.length} agents`);
            
        } catch (error) {
            this.log('error', `Failed to start agents: ${error.message}`);
            alert(`Failed to start agents: ${error.message}`);
        }
    }

    setupEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource(`${this.apiBaseUrl}/sessions/${this.currentSession.id}/events`);
        
        this.eventSource.onopen = () => {
            this.updateConnectionStatus(true);
            this.log('info', 'Connected to agent system');
        };
        
        this.eventSource.onerror = () => {
            this.updateConnectionStatus(false);
            this.log('warning', 'Lost connection to agent system');
        };
        
        this.eventSource.addEventListener('agent_started', (event) => {
            const data = JSON.parse(event.data);
            this.log('success', `Agent started: ${data.agentId}`);
            this.updateAgentsList();
        });
        
        this.eventSource.addEventListener('agent_completed', (event) => {
            const data = JSON.parse(event.data);
            this.log('success', `Agent completed: ${data.agentId}`);
            this.updateAgentsList();
        });
        
        this.eventSource.addEventListener('artifact_created', (event) => {
            const data = JSON.parse(event.data);
            this.log('info', `New artifact: ${data.artifactType}`);
            this.updateArtifactsList();
        });
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (connected) {
            statusDot.className = 'status-dot status-connected';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'status-dot status-disconnected';
            statusText.textContent = 'Disconnected';
        }
    }

    async updateAgentsList() {
        // Fetch and display current agents
        // Implementation would fetch agents for current session
    }

    async updateArtifactsList() {
        // Fetch and display artifacts
        // Implementation would fetch artifacts for current session
    }

    log(level, message) {
        const logContent = document.getElementById('log-content');
        const timestamp = new Date().toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level ${level}">${level.toUpperCase()}</span>
            <span class="log-message">${message}</span>
        `;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    toggleLog() {
        const logPanel = document.getElementById('action-log');
        const toggleBtn = document.getElementById('toggle-log-btn');
        
        if (logPanel.style.display === 'none') {
            logPanel.style.display = 'block';
            toggleBtn.textContent = '📜 Hide Log';
        } else {
            logPanel.style.display = 'none';
            toggleBtn.textContent = '📜 Show Log';
        }
    }

    clearLog() {
        document.getElementById('log-content').innerHTML = '';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.agentSystemUI = new AgentSystemUI();
});
