let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let baseUrl = window.location.origin;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', async function() {
    if (!token) {
        window.location.href = '/login';
        return;
    }
    
    document.getElementById('username-display').textContent = username;
    
    // Load server configuration
    await loadServerConfig();
    
    // Load collections
    await loadCollections();
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Setup paste functionality
    setupPasteFunctionality();
    
    // Setup file input change handler
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
});

async function loadServerConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            baseUrl = config.baseUrl || window.location.origin;
        }
    } catch (error) {
        console.error('Error loading server config:', error);
        baseUrl = window.location.origin;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
}

async function apiCall(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(url, { ...defaultOptions, ...options });
        
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
        
        if (!response) return;
        
        if (!response.ok) {
            console.error('Failed to load collections:', response.status);
            return;
        }
        
        const data = await response.json();
        const collections = data.collections || [];
        
        const select = document.getElementById('collection-select');
        select.innerHTML = '<option value="">Choose a collection...</option>';
        
        collections.forEach(collection => {
            const option = document.createElement('option');
            option.value = collection.name;
            option.textContent = collection.name;
            select.appendChild(option);
        });
        
        updateCurlExample();
    } catch (error) {
        console.error('Error loading collections:', error);
    }
}

async function refreshCollections() {
    await loadCollections();
    showStatus('Collections refreshed!', 'success');
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    
    // Handle click on drop zone
    dropZone.addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.getElementById('drop-zone').classList.add('dragover');
}

function unhighlight(e) {
    document.getElementById('drop-zone').classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    [...files].forEach(file => {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    });
    
    updateFileDisplay();
    updateUploadButton();
}

function updateFileDisplay() {
    const selectedFilesDiv = document.getElementById('selected-files');
    const filePreviewsDiv = document.getElementById('file-previews');
    
    if (selectedFiles.length === 0) {
        selectedFilesDiv.innerHTML = '<p style="color: #666; margin-top: 10px;">No files selected</p>';
        filePreviewsDiv.innerHTML = '';
        return;
    }
    
    selectedFilesDiv.innerHTML = `
        <p style="margin-top: 10px;"><strong>${selectedFiles.length} file(s) selected:</strong></p>
        <ul style="margin: 5px 0; padding-left: 20px;">
            ${selectedFiles.map((file, index) => `
                <li style="margin-bottom: 5px;">
                    ${file.name} (${formatFileSize(file.size)})
                    <button onclick="removeFile(${index})" class="btn btn-small btn-danger" style="margin-left: 10px;">×</button>
                </li>
            `).join('')}
        </ul>
    `;
    
    // Show file previews for text/image files
    let previewsHtml = '';
    selectedFiles.forEach((file, index) => {
        if (file.type.startsWith('text/') || file.type.startsWith('image/')) {
            previewsHtml += `
                <div class="file-preview" style="display: block;">
                    <h5>${file.name}</h5>
                    <div id="preview-${index}">Loading preview...</div>
                </div>
            `;
        }
    });
    
    filePreviewsDiv.innerHTML = previewsHtml;
    
    // Generate previews
    selectedFiles.forEach((file, index) => {
        if (file.type.startsWith('text/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewDiv = document.getElementById(`preview-${index}`);
                if (previewDiv) {
                    const content = e.target.result.substring(0, 500);
                    previewDiv.innerHTML = `<pre style="white-space: pre-wrap; font-size: 12px;">${content}${e.target.result.length > 500 ? '...' : ''}</pre>`;
                }
            };
            reader.readAsText(file);
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewDiv = document.getElementById(`preview-${index}`);
                if (previewDiv) {
                    previewDiv.innerHTML = `<img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 4px;">`;
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileDisplay();
    updateUploadButton();
}

function updateUploadButton() {
    const btn = document.getElementById('upload-all-btn');
    btn.disabled = selectedFiles.length === 0;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setupPasteFunctionality() {
    const textContent = document.getElementById('text-content');
    
    textContent.addEventListener('paste', (e) => {
        // Check if pasted content contains files
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    selectedFiles.push(file);
                    updateFileDisplay();
                    updateUploadButton();
                    showStatus(`Pasted file: ${file.name}`, 'success');
                }
            }
        }
    });
}

async function uploadAll() {
    const collection = document.getElementById('collection-select').value;
    
    if (!collection) {
        showStatus('Please select a collection first!', 'error');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showStatus('No files selected for upload!', 'error');
        return;
    }
    
    const uploadBtn = document.getElementById('upload-all-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`/api/collections/${collection}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                results.push(result);
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            errorCount++;
        }
    }
    
    // Show results
    if (successCount > 0) {
        let resultMessage = `Successfully uploaded ${successCount} file(s):\n\n`;
        results.forEach(result => {
            resultMessage += `• ${result.filename}\n  Download: ${baseUrl}${result.downloadUrl}\n\n`;
        });
        
        showStatus(`Upload complete! ${successCount} successful, ${errorCount} failed.`, 'success');
        
        // Clear files after successful upload
        selectedFiles = [];
        updateFileDisplay();
    } else {
        showStatus(`Upload failed! ${errorCount} files could not be uploaded.`, 'error');
    }
    
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤 Upload All Files';
    updateUploadButton();
}

async function createTextDocument() {
    const collection = document.getElementById('collection-select').value;
    const title = document.getElementById('text-title').value.trim();
    const content = document.getElementById('text-content').value.trim();
    
    if (!collection) {
        showStatus('Please select a collection first!', 'error');
        return;
    }
    
    if (!title || !content) {
        showStatus('Please provide both title and content!', 'error');
        return;
    }
    
    try {
        const response = await apiCall(`/api/collections/${collection}/create-text`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                content
            })
        });
        
        if (response && response.ok) {
            showStatus(`Text document "${title}" created successfully!`, 'success');
            document.getElementById('text-title').value = '';
            document.getElementById('text-content').value = '';
        } else if (response) {
            const error = await response.json();
            showStatus('Error creating text document: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error creating text document:', error);
        showStatus('Error creating text document. Please try again.', 'error');
    }
}

function clearAll() {
    selectedFiles = [];
    updateFileDisplay();
    updateUploadButton();
    document.getElementById('text-title').value = '';
    document.getElementById('text-content').value = '';
    document.getElementById('file-input').value = '';
    showStatus('Cleared all content!', 'success');
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('upload-status');
    statusDiv.textContent = message;
    statusDiv.className = `upload-status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

function updateCurlExample() {
    const collection = document.getElementById('collection-select').value;
    const curlDiv = document.getElementById('curl-example');
    
    if (!collection) {
        curlDiv.textContent = 'Select a collection first to see the cURL example';
        return;
    }
    
    curlDiv.textContent = `# Upload a file to collection "${collection}"
curl -X POST "${baseUrl}/api/collections/${collection}/upload" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@your_file.pdf"

# Create a text document
curl -X POST "${baseUrl}/api/collections/${collection}/create-text" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Document","content":"Your text content here"}'`;
}

function copyCurlExample() {
    const curlDiv = document.getElementById('curl-example');
    const text = curlDiv.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showStatus('cURL command copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showStatus('Failed to copy command', 'error');
    });
}
