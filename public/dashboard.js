let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let isAdmin = localStorage.getItem('isAdmin') === 'true';
const API_BASE_URL = '/api/v1';

document.addEventListener('DOMContentLoaded', async function() {
    if (!token) {
        window.location.href = '/login';
        return;
    }
    
    // Ensure token is stored in localStorage
    if (token && !localStorage.getItem('token')) {
        localStorage.setItem('token', token);
    }
    
    document.getElementById('username-display').textContent = username;
    const apiKeyElement = document.getElementById('api-key');
    if (apiKeyElement) {
        apiKeyElement.value = token;
    }
    
    // Update API examples with actual token and base URL
    updateApiExamples();
    
    // Show admin badge and panel if user is admin
    if (isAdmin) {
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) {
            adminPanel.style.display = 'block';
            loadSystemStatus();
            loadUsers();
        }
    }
    
    loadCollections();

    // Clipboard paste handler for files and text
    document.addEventListener('paste', async function(event) {
        const collection = document.getElementById('upload-collection')?.value;
        if (!collection) {
            return;
        }

        // Handle pasted files (images, pdf, office, etc.)
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
            for (const file of event.clipboardData.files) {
                await uploadPastedFile(file, collection);
            }
            event.preventDefault();
            return;
        }

        // Handle pasted text (create text document)
        const text = event.clipboardData?.getData('text/plain');
        if (text && text.trim().length > 0) {
            await uploadPastedText(text, collection);
            event.preventDefault();
        }
    });
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
}

function updateApiExamples() {
    const fullBaseUrl = `${window.location.origin}${API_BASE_URL}`;
    // Update HTTP examples
    const httpExamples = document.getElementById('http-examples');
    if (httpExamples) {
        httpExamples.textContent = `// Using fetch
fetch('${fullBaseUrl}/collections', {
  headers: {
    'Authorization': 'Bearer ${token}'
  }
});

// Using axios
axios.get('${fullBaseUrl}/collections', {
  headers: {
    'Authorization': 'Bearer ${token}'
  }
});`;
    }
    
    // Update Qdrant examples
    const qdrantExamples = document.getElementById('qdrant-examples');
    if (qdrantExamples) {
        qdrantExamples.textContent = `# List collections
curl -X GET "${fullBaseUrl}/collections" \\
  -H "Authorization: Bearer ${token}"

# Create collection
curl -X PUT "${fullBaseUrl}/collections/my_docs" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"vectors":{"size":768,"distance":"Cosine"}}'

# Search vectors
curl -X POST "${fullBaseUrl}/collections/my_docs/points/search" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"vector":[0.1,0.2,0.3],"limit":5,"with_payload":true}'

# Upsert points
curl -X PUT "${fullBaseUrl}/collections/my_docs/points" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"points":[{"id":"doc1","vector":[0.1,0.2,0.3],"payload":{"text":"Hello"}}]}'`;
    }
    
    // Update VSI examples
    const vsiExamples = document.getElementById('vsi-examples');
    if (vsiExamples) {
        vsiExamples.textContent = `# Upload file
curl -X POST "${fullBaseUrl}/collections/my_docs/documents/upload" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document.txt"

# Create text document
curl -X POST "${fullBaseUrl}/collections/my_docs/create-text" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Note","content":"This is my document content"}'

# Semantic search
curl -X POST "${fullBaseUrl}/collections/my_docs/search" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"machine learning","limit":10}'

# List documents
curl -X GET "${fullBaseUrl}/collections/my_docs/documents" \\
  -H "Authorization: Bearer ${token}"`;
    }
}

function copyApiKey() {
    const apiKeyInput = document.getElementById('api-key');
    apiKeyInput.select();
    document.execCommand('copy');
    
    // Visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 2000);
    
    // Update examples when token is copied (in case it changed)
    updateApiExamples();
}

async function apiCall(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    // HACK: The backend's admin routes are not yet versioned.
    // This sends admin calls to /api/admin/* instead of /api/v1/admin/*
    const endpoint = url.startsWith('/admin/') ? `/api${url}` : `${API_BASE_URL}${url}`;
    
    try {
        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        
        if (response.status === 401 || response.status === 403) {
            console.error('Authentication failed, redirecting to login');
            logout();
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function loadCollections() {
    try {
        const response = await apiCall('/collections');
        
        if (!response) {
            console.log('No response received (likely authentication failed)');
            return;
        }
        
        if (!response.ok) {
            console.error('Failed to load collections:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        console.log('Collections data:', data); // Debug log
        
        const collectionsList = document.getElementById('collections-list');
        collectionsList.innerHTML = '';
        
        // Handle both possible response structures
        let collections = [];
        if (data.collections) {
            collections = data.collections;
        } else if (data.result && data.result.collections) {
            collections = data.result.collections;
        }
        
        if (collections && collections.length > 0) {
            collections.forEach(collection => {
                const div = document.createElement('div');
                div.className = 'collection-item';
                div.innerHTML = `
                    <span>${collection.name}</span>
                    <div>
                        <button onclick="reindexCollection('${collection.name}')" class="btn btn-small btn-secondary">Re-index</button>
                        <button onclick="deleteCollection('${collection.name}')" class="btn btn-small btn-danger">Delete</button>
                    </div>
                `;
                collectionsList.appendChild(div);
            });
        } else {
            collectionsList.innerHTML = '<p>No collections found. Create one to get started.</p>';
        }
        
        updateCollectionSelects();
    } catch (error) {
        console.error('Error loading collections:', error);
        document.getElementById('collections-list').innerHTML = '<p>Error loading collections. Please try again.</p>';
    }
}

async function createCollection() {
    const name = document.getElementById('new-collection-name').value.trim();
    if (!name) return;
    
    try {
        const response = await apiCall(`/collections/${name}`, {
            method: 'PUT',
            body: JSON.stringify({
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            })
        });
        
        if (response && response.ok) {
            document.getElementById('new-collection-name').value = '';
            loadCollections();
        } else if (response) {
            const error = await response.json();
            alert('Error creating collection: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating collection:', error);
        alert('Error creating collection. Please try again.');
    }
}

async function deleteCollection(name) {
    if (!confirm(`Are you sure you want to delete collection "${name}"?`)) return;
    
    try {
        const response = await apiCall(`/collections/${name}`, {
            method: 'DELETE'
        });
        
        if (response && response.ok) {
            loadCollections();
        } else if (response) {
            const error = await response.json();
            alert('Error deleting collection: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting collection:', error);
        alert('Error deleting collection. Please try again.');
    }
}

async function reindexCollection(name) {
    try {
        const response = await apiCall(`/collections/${name}/reindex`, {
            method: 'POST'
        });
        
        if (response && response.ok) {
            alert(`Collection "${name}" reindexing started.`);
        } else if (response) {
            const error = await response.json();
            alert('Error reindexing collection: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error reindexing collection:', error);
        alert('Error reindexing collection. Please try again.');
    }
}

function updateCollectionSelects() {
    const selects = [
        'upload-collection',
        'text-collection',
        'browse-collection',
        'qa-collection-select'
    ];
    
    // Get collections from the displayed list
    const collectionItems = document.querySelectorAll('.collection-item span');
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select collection...</option>';
            collectionItems.forEach(item => {
                const name = item.textContent;
                select.innerHTML += `<option value="${name}">${name}</option>`;
            });
        }
    });
}

// File selection and display functions
function handleFileSelection(event) {
    const files = event.target.files;
    displaySelectedFiles(files);
}

function displaySelectedFiles(files) {
    const display = document.getElementById('selected-files-display');
    const filesList = document.getElementById('selected-files-list');
    const dropZone = document.querySelector('.file-drop-zone');
    
    if (files.length === 0) {
        display.style.display = 'none';
        dropZone.classList.remove('has-files');
        return;
    }
    
    dropZone.classList.add('has-files');
    display.style.display = 'block';
    
    filesList.innerHTML = '';
    
    Array.from(files).forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'selected-file-item';
        
        const fileIcon = getFileIcon(file.name);
        const fileSize = formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <div class="selected-file-info">
                <i class="${fileIcon} file-icon"></i>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize}</div>
                </div>
            </div>
            <button class="file-remove-btn" onclick="removeSelectedFile(${index})" title="Remove file">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        filesList.appendChild(fileItem);
    });
}

function getFileIcon(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fas fa-file-pdf',
        'txt': 'fas fa-file-alt',
        'md': 'fas fa-file-alt',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image',
        'png': 'fas fa-file-image',
        'gif': 'fas fa-file-image',
        'bmp': 'fas fa-file-image',
        'webp': 'fas fa-file-image'
    };
    return iconMap[ext] || 'fas fa-file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeSelectedFile(index) {
    const fileInput = document.getElementById('file-input');
    const dt = new DataTransfer();
    
    Array.from(fileInput.files).forEach((file, i) => {
        if (i !== index) {
            dt.items.add(file);
        }
    });
    
    fileInput.files = dt.files;
    displaySelectedFiles(fileInput.files);
}

function clearSelectedFiles() {
    const fileInput = document.getElementById('file-input');
    fileInput.value = '';
    displaySelectedFiles([]);
}

function switchUploadTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.upload-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.upload-tab-btn').classList.add('active');
    
    // Show/hide tab content
    document.querySelectorAll('.upload-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`upload-tab-${tabName}`).style.display = 'block';
    
    // Update context help
    if (tabName === 'url') {
        updateContextHelp('url-upload');
    } else {
        updateContextHelp('upload');
    }
}

// Enhanced drag and drop
function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
}

// Enhanced file upload function
async function uploadFiles() {
    const collection = document.getElementById('upload-collection').value;
    const fileInput = document.getElementById('file-input');
    const files = fileInput.files;
    
    if (!collection || files.length === 0) {
        alert('Please select a collection and at least one file.');
        return;
    }
    
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.innerHTML = '<div class="progress"><div class="progress-bar" style="width: 0%"></div></div>';
    
    const uploadResults = [];
    
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collection}/documents/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const progress = ((i + 1) / files.length) * 100;
            progressDiv.querySelector('.progress-bar').style.width = `${progress}%`;
            
            if (response.ok) {
                const result = await response.json();
                uploadResults.push(result);
                console.log(`✅ Uploaded: ${result.filename} (UUID: ${result.fileUuid})`);
            } else {
                const error = await response.json();
                console.error(`❌ Failed to upload ${files[i].name}:`, error.error || 'Unknown error');
            }
        } catch (error) {
            console.error(`❌ Error uploading ${files[i].name}:`, error);
        }
    }
    
    // Clear file selection after upload
    clearSelectedFiles();
    
    // Show upload results
    if (uploadResults.length > 0) {
        setTimeout(() => {
            progressDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 15px; margin-top: 10px;">
                    <strong><i class="fas fa-check-circle"></i> Upload Complete!</strong><br>
                    <small>Successfully uploaded ${uploadResults.length} file(s). Files can be downloaded using their UUIDs (no authentication required).</small>
                    <div style="margin-top: 10px; max-height: 100px; overflow-y: auto; font-size: 12px;">
                        ${uploadResults.map(result => `• ${result.filename} - <a href="${result.downloadUrl}" target="_blank">Download</a>`).join('<br>')}
                    </div>
                </div>
            `;
            
            setTimeout(() => {
                progressDiv.innerHTML = '';
            }, 8000);
        }, 1000);
    } else {
        setTimeout(() => {
            progressDiv.innerHTML = '<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">❌ Upload failed. Please try again.</div>';
            setTimeout(() => {
                progressDiv.innerHTML = '';
            }, 5000);
        }, 1000);
    }
}

// URL upload function
async function uploadFromUrl() {
    const collection = document.getElementById('upload-collection').value;
    const url = document.getElementById('url-input').value.trim();
    const customFilename = document.getElementById('url-filename').value.trim();
    
    if (!collection || !url) {
        alert('Please select a collection and enter a URL.');
        return;
    }
    
    if (!isValidUrl(url)) {
        alert('Please enter a valid URL.');
        return;
    }
    
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.innerHTML = '<div class="progress"><div class="progress-bar" style="width: 50%"></div></div><p>Downloading from URL...</p>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/collections/${collection}/upload-url`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                filename: customFilename
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Clear inputs
            document.getElementById('url-input').value = '';
            document.getElementById('url-filename').value = '';
            
            progressDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 15px; margin-top: 10px;">
                    <strong><i class="fas fa-check-circle"></i> URL Download Complete!</strong><br>
                    <small>Successfully downloaded and indexed: ${result.filename}</small><br>
                    <a href="${result.downloadUrl}" target="_blank" class="fiori-btn secondary" style="margin-top: 8px; font-size: 12px;">
                        <i class="fas fa-download"></i> Download File
                    </a>
                </div>
            `;
            
            setTimeout(() => {
                progressDiv.innerHTML = '';
            }, 8000);
            
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to download from URL');
        }
        
    } catch (error) {
        console.error('URL upload error:', error);
        progressDiv.innerHTML = `
            <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">
                ❌ Failed to download from URL: ${error.message}
            </div>
        `;
        
        setTimeout(() => {
            progressDiv.innerHTML = '';
        }, 5000);
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

async function createTextDocument() {
    const collection = document.getElementById('text-collection').value;
    const title = document.getElementById('text-title').value.trim();
    const content = document.getElementById('text-content').value.trim();
    
    if (!collection || !title || !content) {
        alert('Please fill in all fields.');
        return;
    }
    
    try {
        const response = await apiCall(`/collections/${collection}/create-text`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                content
            })
        });
        
        if (response && response.ok) {
            document.getElementById('text-title').value = '';
            document.getElementById('text-content').value = '';
            alert('Text document created and indexed successfully!');
        } else if (response) {
            const error = await response.json();
            alert('Error creating text document: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating text document:', error);
        alert('Error creating text document. Please try again.');
    }
}

async function searchDocuments() {
    const collection = document.getElementById('search-collection').value;
    const query = document.getElementById('search-query').value.trim();
    
    if (!collection || !query) {
        alert('Please select a collection and enter a search query.');
        return;
    }
    
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<p>Searching...</p>';
    
    try {
        const response = await apiCall(`/collections/${collection}/search`, {
            method: 'POST',
            body: JSON.stringify({
                query,
                limit: 20
            })
        });
        
        if (response && response.ok) {
            const data = await response.json();
            displaySearchResults(data.results, 'search-results');
        } else if (response) {
            const error = await response.json();
            resultsDiv.innerHTML = `<p class="error">Search failed: ${error.error}</p>`;
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<p class="error">Search failed. Please try again.</p>';
    }
}

async function browseDocuments() {
    const collection = document.getElementById('browse-collection').value;
    
    if (!collection) {
        alert('Please select a collection.');
        return;
    }
    
    const resultsDiv = document.getElementById('browse-results');
    resultsDiv.innerHTML = '<p>Loading documents...</p>';
    
    try {
        const response = await apiCall(`/collections/${collection}/documents?limit=50`);
        
        if (response && response.ok) {
            const data = await response.json();
            displayBrowseResults(data.documents, collection, 'browse-results');
        } else if (response) {
            const error = await response.json();
            resultsDiv.innerHTML = `<p class="error">Browse failed: ${error.error}</p>`;
        }
    } catch (error) {
        console.error('Browse error:', error);
        resultsDiv.innerHTML = '<p class="error">Browse failed. Please try again.</p>';
    }
}

function displaySearchResults(results, containerId) {
    const container = document.getElementById(containerId);
    
    if (results.length === 0) {
        container.innerHTML = '<p>No results found.</p>';
        return;
    }
    
    let html = `<div class="results-header"><h4>Found ${results.length} results:</h4></div>`;
    
    results.forEach(result => {
        const payload = result.payload;
        const score = (result.score * 100).toFixed(1);
        
        // Create download link if it's a file with fileUuid
        const downloadLink = payload.fileUuid ? 
            `<br><a href="/api/files/${payload.fileUuid}" target="_blank" class="btn btn-small btn-secondary">📥 Download File</a>` : '';
        
        html += `
            <div class="result-item">
                <div class="result-header">
                    <span class="result-score">${score}% match</span>
                    <span class="result-type">${payload.type}</span>
                </div>
                <div class="result-content">
                    ${payload.title ? `<h5>${payload.title}</h5>` : ''}
                    ${payload.filename ? `<strong>File:</strong> ${payload.filename}${downloadLink}<br>` : ''}
                    <div class="result-text">${payload.text || payload.content || 'No preview available'}</div>
                    <div class="result-meta">
                        Created: ${new Date(payload.createdAt || payload.uploadedAt).toLocaleString()}
                        ${payload.createdBy || payload.uploadedBy ? ` by ${payload.createdBy || payload.uploadedBy}` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function displayBrowseResults(documents, collection, containerId) {
    const container = document.getElementById(containerId);
    
    if (documents.length === 0) {
        container.innerHTML = '<p>No documents found in this collection.</p>';
        return;
    }
    
    let html = `<div class="results-header"><h4>${documents.length} documents in collection:</h4></div>`;
    
    documents.forEach(doc => {
        const payload = doc.payload;
        
        // Create download link if it's a file with fileUuid
        const downloadLink = payload.fileUuid ? 
            `<br><a href="/api/files/${payload.fileUuid}" target="_blank" class="btn btn-small btn-secondary">📥 Download</a>` : '';
        
        html += `
            <div class="document-item">
                <div class="document-header">
                    <span class="document-type">${payload.type}</span>
                    <button onclick="deleteDocument('${collection}', '${doc.id}')" class="btn btn-small btn-danger">Delete</button>
                </div>
                <div class="document-content">
                    ${payload.title ? `<h5>${payload.title}</h5>` : ''}
                    ${payload.filename ? `<strong>File:</strong> ${payload.filename}${downloadLink}<br>` : ''}
                    <div class="document-text">${(payload.text || payload.content || 'No preview available').substring(0, 200)}...</div>
                    <div class="document-meta">
                        Created: ${new Date(payload.createdAt || payload.uploadedAt).toLocaleString()}
                        ${payload.createdBy || payload.uploadedBy ? ` by ${payload.createdBy || payload.uploadedBy}` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function displayQAResults(data) {
    const resultsDiv = document.getElementById('qa-results');
    
    if (!data.answer && (!data.context || data.context.length === 0)) {
        resultsDiv.innerHTML = '<div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 4px; border-left: 4px solid #ffc107;">⚠️ No relevant information found for your question.</div>';
        return;
    }
    
    let html = '<div class="qa-response">';
    
    // Display the AI answer if available
    if (data.answer) {
        html += `
            <div style="background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 4px; border-left: 4px solid #17a2b8; margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0;">🤖 AI Answer:</h4>
                <div style="white-space: pre-wrap; line-height: 1.5;">${data.answer}</div>
            </div>
        `;
    }
    
    // Display context sources
    if (data.context && data.context.length > 0) {
        html += `
            <div style="margin-top: 15px;">
                <h4>📚 Sources (${data.context.length} documents):</h4>
                <div class="context-sources">
        `;
        
        data.context.forEach((item, index) => {
            const payload = item.payload;
            const score = (item.score * 100).toFixed(1);
            
            // Create download link if it's a file with fileUuid
            const downloadLink = payload.fileUuid ? 
                `<br><a href="/api/files/${payload.fileUuid}" target="_blank" class="btn btn-small btn-secondary">📥 Download File</a>` : '';
            
            html += `
                <div class="context-item" style="border: 1px solid #dee2e6; border-radius: 4px; padding: 12px; margin-bottom: 10px; background: #f8f9fa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; color: #495057;">Source ${index + 1}</span>
                        <span style="background: #e9ecef; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${score}% relevance</span>
                    </div>
                    ${payload.title ? `<h6 style="margin: 0 0 8px 0; color: #007bff;">${payload.title}</h6>` : ''}
                    ${payload.filename ? `<div style="font-size: 14px; color: #6c757d; margin-bottom: 8px;"><strong>File:</strong> ${payload.filename}${downloadLink}</div>` : ''}
                    <div style="background: white; padding: 10px; border-radius: 4px; border-left: 3px solid #007bff; font-size: 14px; line-height: 1.4;">
                        ${(payload.text || payload.content || 'No preview available').substring(0, 300)}${(payload.text || payload.content || '').length > 300 ? '...' : ''}
                    </div>
                    <div style="font-size: 12px; color: #868e96; margin-top: 8px;">
                        ${new Date(payload.createdAt || payload.uploadedAt).toLocaleString()}
                        ${payload.createdBy || payload.uploadedBy ? ` • by ${payload.createdBy || payload.uploadedBy}` : ''}
                    </div>
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    html += '</div>';
    resultsDiv.innerHTML = html;
}

async function askQuestion() {
    const question = document.getElementById('qa-question').value.trim();
    const collectionName = document.getElementById('qa-collection-select').value;
    const systemPrompt = document.getElementById('qa-system-prompt').value.trim();
    const maxResults = parseInt(document.getElementById('qa-max-results').value);

    if (!question || !collectionName) {
        alert('Please provide both question and collection name');
        return;
    }

    const resultsDiv = document.getElementById('qa-results');
    resultsDiv.innerHTML = '<div style="text-align: center; padding: 15px; color: #666; font-style: italic;">🤔 Processing your question...</div>';

    try {
        const requestBody = {
            question,
            maxResults
        };

        if (systemPrompt) {
            requestBody.systemPrompt = systemPrompt;
        }

        const response = await fetch(`${API_BASE_URL}/collections/${encodeURIComponent(collectionName)}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to get answer');
        }

        displayQAResults(data);
    } catch (error) {
        resultsDiv.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; border-left: 4px solid #dc3545;">❌ Error: ${error.message}</div>`;
    }
}

async function deleteDocument(collection, documentId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }
    
    try {
        const response = await apiCall(`/collections/${collection}/documents/${documentId}`, {
            method: 'DELETE'
        });
        
        if (response && response.ok) {
            alert('Document deleted successfully!');
            // Refresh the browse results
            browseDocuments();
        } else if (response) {
            const error = await response.json();
            alert('Error deleting document: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Delete document error:', error);
        alert('Error deleting document. Please try again.');
    }
}

// Upload a pasted file (image, pdf, office, etc.)
async function uploadPastedFile(file, collection) {
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.innerHTML = '<div class="progress"><div class="progress-bar" style="width: 50%"></div></div><p>Uploading pasted file...</p>';

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/collections/${collection}/documents/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            progressDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 15px; margin-top: 10px;">
                    <strong><i class="fas fa-check-circle"></i> Pasted file uploaded!</strong><br>
                    <small>${result.filename} indexed. <a href="${result.downloadUrl}" target="_blank">Download</a></small>
                </div>
            `;
            setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
        } else {
            const error = await response.json();
            progressDiv.innerHTML = `<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">❌ Upload failed: ${error.error || 'Unknown error'}</div>`;
            setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
        }
    } catch (error) {
        progressDiv.innerHTML = `<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">❌ Upload failed.</div>`;
        setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
    }
}

// Upload pasted text as a text document
async function uploadPastedText(text, collection) {
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.innerHTML = '<div class="progress"><div class="progress-bar" style="width: 50%"></div></div><p>Uploading pasted text...</p>';

    try {
        const response = await apiCall(`/collections/${collection}/create-text`, {
            method: 'POST',
            body: JSON.stringify({
                title: 'Pasted Text',
                content: text
            })
        });

        if (response && response.ok) {
            progressDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 15px; margin-top: 10px;">
                    <strong><i class="fas fa-check-circle"></i> Pasted text indexed!</strong>
                </div>
            `;
            setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
        } else if (response) {
            const error = await response.json();
            progressDiv.innerHTML = `<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">❌ Indexing failed: ${error.error || 'Unknown error'}</div>`;
            setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
        }
    } catch (error) {
        progressDiv.innerHTML = `<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; color: #721c24;">❌ Indexing failed.</div>`;
        setTimeout(() => { progressDiv.innerHTML = ''; }, 5000);
    }
}

// Admin functions
async function loadSystemStatus() {
    try {
        const response = await apiCall('/admin/system/health');
        if (response && response.ok) {
            const data = await response.json();
            document.getElementById('self-reg-status').textContent = data.selfRegistrationEnabled ? 'Enabled' : 'Disabled';
            document.getElementById('rapidapi-status').textContent = data.rapidApiEnabled ? 'Enabled' : 'Disabled';
        }
    } catch (error) {
        console.error('Error loading system status:', error);
    }
}

async function loadUsers() {
    if (!isAdmin) return;
    
    try {
        const response = await apiCall('/admin/users');
        if (response && response.ok) {
            const data = await response.json();
            displayUsers(data.users);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    
    if (users.length === 0) {
        usersList.innerHTML = '<p>No users found.</p>';
        return;
    }
    
    let html = '<div class="users-table"><table><tr><th>Username</th><th>Admin</th><th>Created</th><th>Actions</th></tr>';
    
    users.forEach(user => {
        const isCurrentUser = user.username === username;
        html += `
            <tr>
                <td>${user.username}</td>
                <td>${user.isAdmin ? '✅' : '❌'}</td>
                <td>${new Date(user.createdAt).toLocaleString()}</td>
                <td>
                    ${!isCurrentUser ? `
                        <button onclick="editUser('${user.username}', ${user.isAdmin})" class="btn btn-small btn-secondary">Edit</button>
                        <button onclick="deleteUser('${user.username}')" class="btn btn-small btn-danger">Delete</button>
                    ` : '<em>Current User</em>'}
                </td>
            </tr>
        `;
    });
    
    html += '</table></div>';
    usersList.innerHTML = html;
}

async function createUser() {
    const newUsername = document.getElementById('admin-new-username').value.trim();
    const newPassword = document.getElementById('admin-new-password').value;
    const newIsAdmin = document.getElementById('admin-new-isadmin').checked;
    
    if (!newUsername || !newPassword) {
        alert('Please enter both username and password.');
        return;
    }
    
    try {
        const response = await apiCall('/admin/users', {
            method: 'POST',
            body: JSON.stringify({
                username: newUsername,
                password: newPassword,
                isAdmin: newIsAdmin
            })
        });
        
        if (response && response.ok) {
            const data = await response.json();
            alert(`User '${newUsername}' created successfully!`);
            document.getElementById('admin-new-username').value = '';
            document.getElementById('admin-new-password').value = '';
            document.getElementById('admin-new-isadmin').checked = false;
            loadUsers();
        } else if (response) {
            const error = await response.json();
            alert('Error creating user: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating user:', error);
        alert('Error creating user. Please try again.');
    }
}

async function editUser(targetUsername, currentIsAdmin) {
    const newPassword = prompt(`Enter new password for ${targetUsername} (leave empty to keep current):`);
    if (newPassword === null) return; // User cancelled
    
    const makeAdmin = confirm(`Should ${targetUsername} be an admin user?`);
    
    const updateData = {};
    if (newPassword.trim()) {
        updateData.password = newPassword.trim();
    }
    updateData.isAdmin = makeAdmin;
    
    try {
        const response = await apiCall(`/admin/users/${targetUsername}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        if (response && response.ok) {
            alert(`User '${targetUsername}' updated successfully!`);
            loadUsers();
        } else if (response) {
            const error = await response.json();
            alert('Error updating user: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating user:', error);
        alert('Error updating user. Please try again.');
    }
}

async function deleteUser(targetUsername) {
    if (!confirm(`Are you sure you want to delete user '${targetUsername}'? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await apiCall(`/admin/users/${targetUsername}`, {
            method: 'DELETE'
        });
        
        if (response && response.ok) {
            alert(`User '${targetUsername}' deleted successfully!`);
            loadUsers();
        } else if (response) {
            const error = await response.json();
            alert('Error deleting user: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user. Please try again.');
    }
}

// Make these functions globally available for HTML onclick handlers
window.handleFileSelection = handleFileSelection;
window.switchUploadTab = switchUploadTab;
window.handleDragLeave = handleDragLeave;
window.uploadFromUrl = uploadFromUrl;
window.isValidUrl = isValidUrl;
window.removeSelectedFile = removeSelectedFile;
window.clearSelectedFiles = clearSelectedFiles;

// This function is called from dashboard.html to show the "Usage & Plan" card.
// It's updated to use the new API endpoint and render the response.
async function showUsagePlan() {
    const usageCard = document.querySelector('[data-card="usage"]');
    usageCard.style.display = 'block';
    const usageStatsDiv = document.getElementById('usage-stats');
    usageStatsDiv.innerHTML = 'Loading usage statistics...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/users/usage`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load usage data');
        }

        const usage = await response.json();
        
        usageStatsDiv.innerHTML = `
            <div class="usage-grid">
                <div class="usage-item">
                    <strong>Collections</strong>
                    <p>${usage.collections.count} / ${usage.collections.limit}</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${usage.collections.percentage}%; background-color: var(--fiori-primary);"></div>
                    </div>
                </div>
                <div class="usage-item">
                    <strong>Documents</strong>
                    <p>${usage.documents.count} / ${usage.documents.limit}</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${usage.documents.percentage}%; background-color: var(--fiori-success);"></div>
                    </div>
                </div>
                <div class="usage-item">
                    <strong>Uploads (monthly)</strong>
                    <p>${usage.uploads.count} / ${usage.uploads.limit}</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${usage.uploads.percentage}%; background-color: var(--fiori-warning);"></div>
                    </div>
                </div>
                <div class="usage-item">
                    <strong>Searches (monthly)</strong>
                    <p>${usage.searches.count} / ${usage.searches.limit}</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${usage.searches.percentage}%; background-color: var(--fiori-info);"></div>
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        usageStatsDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
}
