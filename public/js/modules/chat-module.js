/**
 * VSI Chat Module
 * Handles AI chat functionality and conversation management
 */
class VSIChatModule {
    constructor(app) {
        this.app = app;
        this.currentCollectionId = null;
        this.bindEvents();
    }

    bindEvents() {
        // Chat input     
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });
    }

    initializeChatTab() {
        // Check if we're switching to a different collection
        const newCollectionId = this.app.currentCollection?.id;
        const isNewCollection = this.currentCollectionId !== newCollectionId;
        
        if (isNewCollection) {
            this.currentCollectionId = newCollectionId;
            this.clearChatMessages();
        }
        
        // Show welcome message if chat is empty
        const chatContainer = document.getElementById('chatMessages');
        if (chatContainer && !chatContainer.querySelector('.message')) {
            this.showWelcomeMessage();
        }
    }

    showWelcomeMessage() {
        const chatContainer = document.getElementById('chatMessages');
        chatContainer.innerHTML = `
            <div class="text-center text-muted p-4">
                <i class="fas fa-comments fa-2x mb-3"></i>
                <p>Start a conversation about your documents in the <strong>${this.app.currentCollection?.name}</strong> collection!</p>
                <div class="mt-3">
                    <small class="text-muted">Try asking:</small>
                    <ul class="list-unstyled small text-muted mt-2">
                        <li>• "What are the main topics in these documents?"</li>
                        <li>• "Summarize the key findings"</li>
                        <li>• "What does the document say about [topic]?"</li>
                    </ul>
                </div>
            </div>
        `;
    }

    clearChatMessages() {
        const chatContainer = document.getElementById('chatMessages');
        // Remove all message elements but keep welcome message functionality
        const messages = chatContainer.querySelectorAll('.message');
        messages.forEach(message => message.remove());
        
        // Clear any existing welcome message too
        const welcomeMsg = chatContainer.querySelector('.text-center.text-muted');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const question = input.value.trim();
        if (!question || !this.app.currentCollection) return;
        
        const sendBtn = document.getElementById('chatSendBtn');
        const originalText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
        
        // Add user message to chat
        this.addChatMessage(question, 'user');
        input.value = '';
        
        try {
            const maxResults = document.getElementById('chatMaxResults')?.value || 5;
            const systemPrompt = document.getElementById('chatSystemPrompt')?.value.trim();
            
            const requestBody = {
                question,
                maxResults: parseInt(maxResults)
            };
            
            if (systemPrompt) {
                requestBody.systemPrompt = systemPrompt;
            }
            
            console.log(`🤖 Sending chat request to collection ${this.app.currentCollection.id}:`, requestBody);
            
            const response = await this.app.api.askQuestion(this.app.currentCollection.id, question, requestBody);
            
            console.log('🤖 Chat response received:', response);
            
            if (response && response.success && response.data) {
                this.addChatMessage(response.data.answer, 'assistant', response.data.sources);
                
                // Show context information if available
                if (response.data.contextUsed && response.data.sources?.length > 0) {
                    this.app.showNotification(`Found ${response.data.sources.length} relevant sources`, 'info');
                }
            } else {
                this.addChatMessage('Sorry, I encountered an error while processing your question. Please try again.', 'assistant');
                this.app.showNotification(response?.message || 'AI chat request failed', 'error');
            }
        } catch (error) {
            console.error('AI chat error:', error);
            this.addChatMessage('Sorry, I encountered a network error while processing your question. Please check your connection and try again.', 'assistant');
            this.app.showNotification('AI chat failed - network error', 'error');
        } finally {
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
            input.focus(); // Return focus to input for better UX
        }
    }

    addChatMessage(message, type, sources = null) {
        const container = document.getElementById('chatMessages');
        
        // Remove welcome message if it exists
        const welcomeMsg = container.querySelector('.text-center.text-muted');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        let content = `<div class="message-content">${this.formatMessageContent(message)}</div>`;
        
        if (sources && sources.length > 0) {
            content += `
                <div class="message-sources mt-2">
                    <small><strong><i class="fas fa-book me-1"></i>Sources (${sources.length}):</strong></small>
                    <div class="sources-list mt-1">
                        ${sources.map((source, index) => {
                            // Use a more reliable ID for the chunk
                            const chunkId = source.chunkId || source.id || source.pointId || `chunk_${index}`;
                            // Escape quotes in filename for onclick handler
                            const escapedFilename = (source.filename || 'Unknown').replace(/'/g, "\\'");
                            
                            return `
                                <div class="source-item small clickable-source" 
                                     onclick="app.chat.showSourcePreview('${chunkId}', '${escapedFilename}', this)"
                                     style="cursor: pointer;">
                                    <i class="fas fa-file-alt me-1"></i>
                                    <strong>${source.filename || 'Unknown Document'}</strong> 
                                    <span class="text-muted">(${(source.similarity * 100).toFixed(1)}% match)</span>
                                    <i class="fas fa-eye ms-2 text-primary" title="Click to preview snippet"></i>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // Add timestamp
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        content += `<div class="message-time small text-muted mt-1">${timestamp}</div>`;
        
        messageDiv.innerHTML = content;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
        
        // Add fade-in animation
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        setTimeout(() => {
            messageDiv.style.transition = 'all 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 50);
    }

    async showSourcePreview(chunkId, filename, sourceElement) {
        if (!chunkId || !this.app.currentCollection) {
            console.warn('Missing chunkId or collection for source preview');
            this.app.showNotification('Cannot preview source: missing information', 'warning');
            return;
        }
        
        // Store original content before modification
        const originalContent = sourceElement.innerHTML;
        
        try {
            console.log(`📄 Loading snippet preview for chunk ${chunkId} in collection ${this.app.currentCollection.id}`);
            
            // Show loading state
            sourceElement.innerHTML = `
                <i class="fas fa-file-alt me-1"></i>
                <strong>${filename}</strong>
                <i class="fas fa-spinner fa-spin ms-2 text-primary"></i>
            `;
            
            // Fetch snippet content - Note: This endpoint may not exist yet
            const response = await this.app.api.getSnippetContent(this.app.currentCollection.id, chunkId);
            
            console.log('📄 Snippet response:', response);
            
            if (response && response.success && response.data) {
                this.displaySourceModal(response.data, filename);
            } else {
                console.warn('Snippet API returned unsuccessful response:', response);
                this.showFallbackSourceInfo(chunkId, filename);
            }
        } catch (error) {
            console.error('Error loading snippet:', error);
            
            // Check if it's a 404 or similar error (HTML response)
            if (error.message && error.message.includes('Unexpected token')) {
                console.warn('Snippet endpoint not found, showing fallback');
                this.showFallbackSourceInfo(chunkId, filename);
            } else {
                this.app.showNotification('Failed to load snippet content', 'error');
            }
        } finally {
            // Restore original content with a slight delay
            setTimeout(() => {
                if (sourceElement && sourceElement.parentNode) {
                    sourceElement.innerHTML = originalContent;
                }
            }, 500);
        }
    }

    showFallbackSourceInfo(chunkId, filename) {
        // Show a fallback modal when the snippet endpoint isn't available
        let modal = document.getElementById('sourcePreviewModal');
        if (!modal) {
            modal = this.createSourceModal();
        }
        
        document.getElementById('sourceModalTitle').textContent = `Source: ${filename}`;
        document.getElementById('sourceModalContent').innerHTML = `
            <div class="snippet-preview">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Source Information</strong>
                </div>
                <div class="mb-3">
                    <h6 class="text-muted">Document:</h6>
                    <p><strong>${filename}</strong></p>
                </div>
                <div class="mb-3">
                    <h6 class="text-muted">Chunk ID:</h6>
                    <code>${chunkId}</code>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <small>Snippet preview is not available yet. The backend endpoint <code>/api/collections/{id}/snippets/{chunkId}</code> needs to be implemented.</small>
                </div>
            </div>
        `;
        
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    }

    displaySourceModal(snippetData, filename) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('sourcePreviewModal');
        if (!modal) {
            modal = this.createSourceModal();
        }
        
        // Update modal content
        document.getElementById('sourceModalTitle').textContent = `Source: ${filename}`;
        document.getElementById('sourceModalContent').innerHTML = `
            <div class="snippet-preview">
                <div class="mb-3">
                    <h6 class="text-muted">Document Snippet:</h6>
                    <div class="border rounded p-3 bg-light">
                        <pre class="mb-0" style="white-space: pre-wrap; font-family: inherit;">${this.escapeHtml(snippetData.text || snippetData.content || 'No content available')}</pre>
                    </div>
                </div>
                ${snippetData.metadata ? `
                    <div class="mb-3">
                        <h6 class="text-muted">Metadata:</h6>
                        <div class="small">
                            ${Object.entries(snippetData.metadata).map(([key, value]) => 
                                `<div><strong>${key}:</strong> ${this.escapeHtml(String(value))}</div>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
                ${snippetData.chunkIndex !== undefined ? `
                    <div class="text-muted small">
                        <i class="fas fa-cube me-1"></i>Chunk ${snippetData.chunkIndex + 1} of document
                    </div>
                ` : ''}
            </div>
        `;
        
        // Show modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    }

    createSourceModal() {
        const modalHtml = `
            <div class="modal fade" id="sourcePreviewModal" tabindex="-1" aria-labelledby="sourceModalTitle">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="sourceModalTitle">Source Preview</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="sourceModalContent">
                                <!-- Content will be populated dynamically -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        return document.getElementById('sourcePreviewModal');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatMessageContent(content) {
        // Basic markdown-like formatting for better readability
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/\n/g, '<br>') // Line breaks
            .replace(/`(.*?)`/g, '<code>$1</code>'); // Inline code
    }

    insertQuickPrompt(prompt) {
        const input = document.getElementById('chatInput');
        input.value = prompt;
        input.focus();
    }

    clearChatHistory() {
        this.clearChatMessages();
        this.showWelcomeMessage();
    }
}

window.VSIChatModule = VSIChatModule;
