let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let baseUrl = window.location.origin; // Default fallback

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
    document.getElementById('api-key').value = token;
    
    // Load server configuration including base URL
    await loadServerConfig();
    
    // Update API examples with actual token and base URL
    updateApiExamples();
    
    // Show admin badge and panel if user is admin
    if (isAdmin) {
        document.getElementById('admin-badge').style.display = 'inline-block';
        document.getElementById('admin-panel').style.display = 'block';
        loadSystemStatus();
        loadUsers();
    }
    
    loadCollections();
    updateCollectionSelects();
});

async function loadServerConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            baseUrl = config.baseUrl;
            console.log('Loaded server config:', config);
        }
    } catch (error) {
        console.error('Error loading server config:', error);
        // Fallback to current origin
        baseUrl = window.location.origin;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
}

function updateApiExamples() {
    // Update HTTP examples
    const httpExamples = document.getElementById('http-examples');
    if (httpExamples) {
        httpExamples.textContent = `// Using fetch
fetch('${baseUrl}/collections', {
  headers: {
    'Authorization': 'Bearer ${token}'
  }
});

// Using axios
axios.get('${baseUrl}/collections', {
  headers: {
    'Authorization': 'Bearer ${token}'
  }
});`;
    }
    
    // Update Qdrant examples
    const qdrantExamples = document.getElementById('qdrant-examples');
    if (qdrantExamples) {
        qdrantExamples.textContent = `# List collections
curl -X GET "${baseUrl}/collections" \\
  -H "Authorization: Bearer ${token}"

# Create collection
curl -X PUT "${baseUrl}/collections/my_docs" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"vectors":{"size":768,"distance":"Cosine"}}'

# Search vectors
curl -X POST "${baseUrl}/collections/my_docs/points/search" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"vector":[0.1,0.2,0.3],"limit":5,"with_payload":true}'

# Upsert points
curl -X PUT "${baseUrl}/collections/my_docs/points" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"points":[{"id":"doc1","vector":[0.1,0.2,0.3],"payload":{"text":"Hello"}}]}'`;
    }
    
    // Update VSI examples
    const vsiExamples = document.getElementById('vsi-examples');
    if (vsiExamples) {
        vsiExamples.textContent = `# Upload file
curl -X POST "${baseUrl}/api/collections/my_docs/upload" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document.txt"

# Create text document
curl -X POST "${baseUrl}/api/collections/my_docs/create-text" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Note","content":"This is my document content"}'

# Semantic search
curl -X POST "${baseUrl}/api/collections/my_docs/search" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"machine learning","limit":10}'

# List documents
curl -X GET "${baseUrl}/api/collections/my_docs/documents" \\
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
        const response = await apiCall(`/api/collections/${name}/reindex`, {
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
    const uploadSelect = document.getElementById('upload-collection');
    const textSelect = document.getElementById('text-collection');
    const searchSelect = document.getElementById('search-collection');
    const browseSelect = document.getElementById('browse-collection');
    
    // Clear existing options
    uploadSelect.innerHTML = '<option value="">Select collection...</option>';
    textSelect.innerHTML = '<option value="">Select collection...</option>';
    searchSelect.innerHTML = '<option value="">Select collection...</option>';
    browseSelect.innerHTML = '<option value="">Select collection...</option>';
    
    // Get collections from the displayed list
    const collectionItems = document.querySelectorAll('.collection-item span');
    collectionItems.forEach(item => {
        const name = item.textContent;
        uploadSelect.innerHTML += `<option value="${name}">${name}</option>`;
        textSelect.innerHTML += `<option value="${name}">${name}</option>`;
        searchSelect.innerHTML += `<option value="${name}">${name}</option>`;
        browseSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

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
            const response = await fetch(`/api/collections/${collection}/upload`, {
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
                console.error(`❌ Failed to upload ${files[i].name}`);
            }
        } catch (error) {
            console.error(`❌ Error uploading ${files[i].name}:`, error);
        }
    }
    
    fileInput.value = '';
    
    // Show upload results
    if (uploadResults.length > 0) {
        let resultMessage = `Successfully uploaded ${uploadResults.length} file(s):\n\n`;
        uploadResults.forEach(result => {
            resultMessage += `• ${result.filename}\n  Download: ${window.location.origin}${result.downloadUrl}\n\n`;
        });
        
        setTimeout(() => {
            progressDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin-top: 10px;">
                    <strong>Upload Complete!</strong><br>
                    <small>Files can be downloaded using their UUIDs (no authentication required)</small>
                </div>
            `;
            
            setTimeout(() => {
                progressDiv.innerHTML = '';
            }, 5000);
        }, 1000);
    } else {
        setTimeout(() => {
            progressDiv.innerHTML = '';
        }, 2000);
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
        const response = await apiCall(`/api/collections/${collection}/create-text`, {
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
        const response = await apiCall(`/api/collections/${collection}/search`, {
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
        const response = await apiCall(`/api/collections/${collection}/documents?limit=50`);
        
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

async function deleteDocument(collection, documentId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }
    
    try {
        const response = await apiCall(`/api/collections/${collection}/documents/${documentId}`, {
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

// Admin functions
async function loadSystemStatus() {
    try {
        const response = await apiCall('/api/auth/registration-status');
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
        const response = await apiCall('/api/auth/admin/users');
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
        const response = await apiCall('/api/auth/admin/users', {
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
        const response = await apiCall(`/api/auth/admin/users/${targetUsername}`, {
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
        const response = await apiCall(`/api/auth/admin/users/${targetUsername}`, {
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
