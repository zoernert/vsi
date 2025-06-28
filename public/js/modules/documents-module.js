/**
 * VSI Documents Module
 * Handles document management, file uploads, and document operations
 */
class VSIDocumentsModule {
    constructor(app) {
        this.app = app;
        this.bindEvents();
    }

    bindEvents() {
        // Create text form
        document.getElementById('createTextForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('textTitle').value;
            const content = document.getElementById('textContent').value;
            const type = document.getElementById('textType').value;
            await this.createTextDocument(title, content, type);
        });

        // Document type filter
        document.getElementById('documentTypeFilter')?.addEventListener('change', () => {
            this.loadCollectionDocuments();
        });
    }

    async loadCollectionDocuments() {
        if (!this.app.currentCollection) return;

        try {
            const typeFilter = document.getElementById('documentTypeFilter')?.value || '';
            const params = new URLSearchParams();
            if (typeFilter) params.append('type', typeFilter);

            console.log(`📋 Loading documents for collection ${this.app.currentCollection.id}${typeFilter ? ` (type: ${typeFilter})` : ''}`);
            
            const url = `/api/collections/${this.app.currentCollection.id}/documents${params.toString() ? '?' + params.toString() : ''}`;
            const response = await this.app.api.call(url);
            
            if (response && response.success) {
                this.renderDocuments(response.data || []);
            } else {
                console.error('Failed to load documents:', response);
                this.app.showNotification('Failed to load documents', 'error');
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            this.app.showNotification('Error loading documents', 'error');
        }
    }

    renderDocuments(documents) {
        const container = document.getElementById('documentsGrid');

        if (!documents || documents.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    ${this.app.ui.createEmptyState(
                        'file',
                        'No Documents',
                        'Upload your first document to get started.',
                        `<button class="btn btn-primary" onclick="app.documents.showUploadModal()">
                            <i class="fas fa-upload me-2"></i>Upload Files
                        </button>`
                    )}
                </div>
            `;
            return;
        }

        container.innerHTML = documents.map(doc => {
            const hasOriginalFile = doc.file_uuid && doc.hasOriginalFile !== false;
            const fileSize = doc.fileSize ? this.formatFileSize(doc.fileSize) : 'Unknown size';
            const uploadDate = new Date(doc.created_at).toLocaleDateString();

            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card document-card h-100">
                        <div class="card-body">
                            <div class="d-flex align-items-start mb-3">
                                <div class="file-icon me-3">
                                    <i class="fas fa-${this.getFileIcon(doc.file_type)} fa-2x text-primary"></i>
                                </div>
                                <div class="flex-grow-1">
                                    <h6 class="card-title mb-1" title="${doc.filename}">${this.truncateText(doc.filename, 30)}</h6>
                                    <small class="text-muted">${doc.file_type?.toUpperCase() || 'Unknown'} • ${fileSize}</small>
                                </div>
                            </div>
                            
                            <p class="card-text small text-muted mb-3" title="${doc.content_preview}">
                                ${this.truncateText(doc.content_preview || 'No preview available', 100)}
                            </p>
                            
                            <div class="document-meta mb-3">
                                <small class="text-muted">
                                    <i class="fas fa-calendar me-1"></i>Uploaded ${uploadDate}
                                </small>
                            </div>
                        </div>
                        
                        <div class="card-footer bg-transparent">
                            <div class="btn-group w-100" role="group">
                                ${hasOriginalFile ? `
                                    <button class="btn btn-outline-primary btn-sm" 
                                            onclick="app.documents.downloadDocument('${doc.file_uuid}', '${doc.filename}')"
                                            title="Download original file">
                                        <i class="fas fa-download"></i> Download
                                    </button>
                                ` : `
                                    <button class="btn btn-outline-secondary btn-sm" disabled
                                            title="Original file not available">
                                        <i class="fas fa-file-alt"></i> Text Only
                                    </button>
                                `}
                                
                                <button class="btn btn-outline-info btn-sm" 
                                        onclick="app.documents.viewDocument(${doc.id})"
                                        title="View document content">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                
                                <button class="btn btn-outline-danger btn-sm" 
                                        onclick="app.documents.deleteDocument(${doc.id}, '${doc.filename}')"
                                        title="Delete document">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async downloadDocument(fileUuid, filename) {
        if (!fileUuid) {
            this.app.showNotification('Download not available - no original file found', 'warning');
            return;
        }

        try {
            console.log(`📥 Downloading file: ${filename} (UUID: ${fileUuid})`);

            const token = this.app.token;
            if (!token) {
                this.app.showNotification('Authentication required', 'error');
                return;
            }

            // Use the correct endpoint from OpenAPI spec
            const downloadUrl = `/api/files/${fileUuid}`;

            const response = await fetch(downloadUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Download failed' }));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            const blob = await response.blob();

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;

            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            this.app.showNotification(`Downloaded: ${filename}`, 'success');
            console.log(`✅ Successfully downloaded: ${filename}`);

        } catch (error) {
            console.error('Download error:', error);
            this.app.showNotification(`Download failed: ${error.message}`, 'error');
        }
    }

    showUploadModal() {
        const modal = new bootstrap.Modal(document.getElementById('uploadModal'));
        modal.show();

        // Setup drag and drop
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');

        // Remove any existing event listeners to prevent duplicates
        const newUploadZone = uploadZone.cloneNode(true);
        uploadZone.parentNode.replaceChild(newUploadZone, uploadZone);

        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);

        // Get references to the new elements
        const freshUploadZone = document.getElementById('uploadZone');
        const freshFileInput = document.getElementById('fileInput');

        // Add click handler
        freshUploadZone.onclick = () => freshFileInput.click();

        // Add file input change handler
        freshFileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            console.log(`📁 Selected ${files.length} files:`, files.map(f => ({
                name: f.name,
                size: f.size,
                type: f.type
            })));
            this.uploadFiles(files);
        });

        // Add drag and drop handlers
        freshUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            freshUploadZone.style.borderColor = 'var(--primary-color)';
            freshUploadZone.classList.add('dragover');
        });

        freshUploadZone.addEventListener('dragleave', (e) => {
            // Only remove dragover if we're leaving the upload zone entirely
            if (!freshUploadZone.contains(e.relatedTarget)) {
                freshUploadZone.style.borderColor = '#cbd5e1';
                freshUploadZone.classList.remove('dragover');
            }
        });

        freshUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            freshUploadZone.style.borderColor = '#cbd5e1';
            freshUploadZone.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            console.log(`📁 Dropped ${files.length} files:`, files.map(f => ({
                name: f.name,
                size: f.size,
                type: f.type
            })));
            this.uploadFiles(files);
        });
    }

    async uploadFiles(files) {
        if (!files.length || !this.app.currentCollection) return;

        const progressContainer = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('uploadProgressBar');
        const statusDiv = document.getElementById('uploadStatus');
        progressContainer.classList.remove('hidden');

        let completedFiles = 0;
        const totalFiles = files.length;

        for (const file of files) {
            try {
                statusDiv.innerHTML = `
                    <div class="mb-2">
                        <strong>Processing: ${file.name}</strong>
                        <div class="small text-muted">File ${completedFiles + 1} of ${totalFiles}</div>
                    </div>
                    <div id="currentFileProgress">
                        <div class="small text-muted">Initializing...</div>
                        <div class="progress mt-1">
                            <div class="progress-bar" id="currentFileProgressBar" style="width: 0%"></div>
                        </div>
                    </div>
                `;

                const success = await this.uploadSingleFileWithProgress(file);

                if (success) {
                    completedFiles++;
                    const overallPercent = (completedFiles / totalFiles) * 100;
                    progressBar.style.width = overallPercent + '%';
                } else {
                    this.app.showNotification(`Failed to upload ${file.name}`, 'error');
                }

            } catch (error) {
                this.app.showNotification(`Error uploading ${file.name}: ${error.message}`, 'error');
            }
        }

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            this.loadCollectionDocuments();
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            if (completedFiles === totalFiles) {
                this.app.showNotification(`Successfully uploaded ${completedFiles} files!`, 'success');
            } else {
                this.app.showNotification(`Uploaded ${completedFiles}/${totalFiles} files`, 'warning');
            }
        }, 1000);
    }

    async uploadSingleFileWithProgress(file) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('file', file);
            
            // Based on the backend analysis, the working upload route just needs the file
            // The /api/upload/:collection route in uploadRoutes.js only expects 'file'
            // Remove the filePath and mimeType fields that were causing the error

            const currentFileProgressBar = document.getElementById('currentFileProgressBar');
            const currentFileProgress = document.getElementById('currentFileProgress');

            console.log(`📤 Starting upload for: ${file.name}`);
            console.log(`📤 File size: ${file.size} bytes`);
            console.log(`📤 File type: ${file.type}`);
            console.log(`📤 FormData contents:`, Array.from(formData.entries()));

            // Use the correct endpoint - the one that actually works in uploadRoutes.js
            fetch(`/api/upload/${this.app.currentCollection.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.app.token}`
                    // Don't set Content-Type - browser will set it automatically with boundary
                },
                body: formData
            }).then(async response => {
                console.log(`📡 Upload response status: ${response.status}`);
                
                if (!response.ok) {
                    // Try to get error details from response
                    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorData.error || errorMessage;
                        console.error('Upload error details:', errorData);
                    } catch (e) {
                        // If response is not JSON, use the status text
                        console.warn('Could not parse error response as JSON');
                    }
                    throw new Error(errorMessage);
                }

                return response.json();
            }).then(data => {
                console.log('✅ Upload completed:', data);
                currentFileProgress.innerHTML = `
                    <div class="small text-success">
                        ✅ Completed! ${data.message || 'Upload successful'}
                    </div>
                `;
                currentFileProgressBar.style.width = '100%';
                currentFileProgressBar.classList.add('bg-success');
                resolve(true);
            }).catch(error => {
                console.error('❌ Upload request failed:', error);
                currentFileProgress.innerHTML = `
                    <div class="small text-danger">❌ Upload failed: ${error.message}</div>
                `;
                currentFileProgressBar.classList.add('bg-danger');
                resolve(false);
            });
        });
    }

    async uploadFromUrl() {
        // Remove this functionality as the endpoint is not implemented according to OpenAPI spec
        this.app.showNotification('URL upload is not yet available in this version', 'warning');
        return;
    }

    showCreateTextModal() {
        const modal = new bootstrap.Modal(document.getElementById('createTextModal'));
        modal.show();
    }

    async createTextDocument(title, content, type) {
        if (!this.app.currentCollection) return;

        try {
            const response = await this.app.api.call(`/api/collections/${this.app.currentCollection.id}/documents/create-text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content, type })
            });

            if (response && response.success) {
                this.app.showNotification('Text document created successfully!', 'success');
                this.loadCollectionDocuments();
                bootstrap.Modal.getInstance(document.getElementById('createTextModal')).hide();
            }
        } catch (error) {
            this.app.showNotification('Failed to create text document', 'error');
        }
    }

    async deleteDocument(docId, filename) {
        if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

        try {
            console.log(`🗑️ Deleting document ${docId} from collection ${this.app.currentCollection.id}`);
            const response = await this.app.api.call(`/api/collections/${this.app.currentCollection.id}/documents/${docId}`, {
                method: 'DELETE'
            });

            if (response && response.success) {
                this.app.showNotification('Document deleted successfully!', 'success');
                this.loadCollectionDocuments();
            } else {
                this.app.showNotification(response?.message || 'Failed to delete document', 'error');
            }
        } catch (error) {
            console.error('Delete document error:', error);
            this.app.showNotification('Failed to delete document', 'error');
        }
    }

    async viewDocument(docId) {
        try {
            console.log(`👁️ Viewing document: ${docId}`);
            const response = await this.app.api.call(`/api/search/documents/${docId}`);
            
            if (response && response.success && response.data) {
                this.showDocumentModal(response.data);
            } else {
                throw new Error(response?.message || 'Failed to load document');
            }
        } catch (error) {
            console.error('Error viewing document:', error);
            this.app.showNotification(`Failed to view document: ${error.message}`, 'error');
        }
    }

    showDocumentModal(document) {
        const modal = new bootstrap.Modal(document.getElementById('documentViewModal') || this.createDocumentViewModal());
        document.getElementById('documentModalTitle').textContent = document.filename;
        document.getElementById('documentModalContent').innerHTML = `
            <div class="document-info mb-3">
                <div class="row">
                    <div class="col-md-6">
                        <strong>File Type:</strong> ${document.fileType?.toUpperCase() || 'Unknown'}
                    </div>
                    <div class="col-md-6">
                        <strong>Created:</strong> ${new Date(document.createdAt).toLocaleString()}
                    </div>
                    <div class="col-md-6">
                        <strong>Collection:</strong> ${document.collectionName || 'Unknown'}
                    </div>
                    <div class="col-md-6">
                        <strong>Updated:</strong> ${new Date(document.updatedAt).toLocaleString()}
                    </div>
                </div>
            </div>
            <div class="document-content">
                <h6>Content:</h6>
                <div class="border p-3 bg-light" style="max-height: 400px; overflow-y: auto;">
                    <pre style="white-space: pre-wrap; font-family: inherit;">${document.content || 'No content available'}</pre>
                </div>
            </div>
        `;
        modal.show();
    }

    createDocumentViewModal() {
        const modalHtml = `
            <div class="modal fade" id="documentViewModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="documentModalTitle">Document</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="documentModalContent">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        return document.getElementById('documentViewModal');
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    getFileIcon(fileType) {
        const iconMap = {
            'pdf': 'file-pdf',
            'docx': 'file-word',
            'doc': 'file-word',
            'txt': 'file-alt',
            'md': 'file-alt',
            'html': 'file-code',
            'htm': 'file-code',
            'xlsx': 'file-excel',
            'xls': 'file-excel',
            'jpg': 'file-image',
            'jpeg': 'file-image',
            'png': 'file-image',
            'gif': 'file-image'
        };
        return iconMap[fileType?.toLowerCase()] || 'file';
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength) + '...';
    }
}

window.VSIDocumentsModule = VSIDocumentsModule;
