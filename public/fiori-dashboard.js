// Fiori-specific UI functionality
let sidebarCollapsed = false;
let contextHelpContent = {
    'collections': {
        title: 'Collections Management',
        description: 'Collections are containers for your documents. Each collection maintains separate vector embeddings.',
        apiExample: `curl -X PUT "\${baseUrl}/collections/my-docs" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"vectors":{"size":768,"distance":"Cosine"}}'`
    },
    'upload': {
        title: 'Document Upload',
        description: 'Upload files to be processed and indexed. Supports PDF, Word, Excel, images, and text files.',
        apiExample: `curl -X POST "\${baseUrl}/api/collections/my-docs/upload" \\
  -H "Authorization: Bearer \${token}" \\
  -F "file=@document.pdf"`
    },
    'qa': {
        title: 'AI-Powered Q&A',
        description: 'Ask questions about your documents and get intelligent answers with source references.',
        apiExample: `curl -X POST "\${baseUrl}/api/collections/my-docs/ask" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is machine learning?"}'`
    },
    'browser': {
        title: 'Document Browser',
        description: 'Browse and manage all documents in your collections. View metadata and download files.',
        apiExample: `curl -X GET "\${baseUrl}/api/collections/my-docs/documents" \\
  -H "Authorization: Bearer \${token}"`
    },
    'text-creation': {
        title: 'Text Document Creation',
        description: 'Create text documents directly in the interface without uploading files.',
        apiExample: `curl -X POST "\${baseUrl}/api/collections/my-docs/create-text" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Note","content":"Document content"}'`
    },
    'url-upload': {
        title: 'URL Download & Upload',
        description: 'Download files directly from URLs and index them. Supports PDF, HTML, and text files from web sources.',
        apiExample: `curl -X POST "\${baseUrl}/api/collections/my-docs/upload-url" \\
  -H "Authorization: Bearer \${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/document.pdf","filename":"document.pdf"}'`
    }
};

// Initialize Fiori UI
document.addEventListener('DOMContentLoaded', function() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.user-profile-dropdown')) {
            closeUserMenu();
        }
    });

    // Update context help on card focus
    document.querySelectorAll('.fiori-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            const cardType = this.getAttribute('data-card');
            if (contextHelpContent[cardType]) {
                updateContextHelp(cardType);
            }
        });
    });

    // Initialize file drop zone
    const fileDropZone = document.querySelector('.file-drop-zone');
    if (fileDropZone) {
        fileDropZone.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
    }
});

// Make these functions globally available
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebarCollapsed = !sidebarCollapsed;
    
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
    } else {
        sidebar.classList.toggle('collapsed');
        if (sidebarCollapsed) {
            mainContent.style.marginLeft = '60px';
        } else {
            mainContent.style.marginLeft = '0';
        }
    }
};

window.toggleUserMenu = function() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('active');
};

window.closeUserMenu = function() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.remove('active');
};

window.showBearerToken = function() {
    closeUserMenu();
    const modal = document.getElementById('bearer-token-modal');
    const apiKeyInput = document.getElementById('api-key');
    const examplesCode = document.getElementById('token-examples');
    
    apiKeyInput.value = token;
    examplesCode.textContent = `# List collections
curl -H "Authorization: Bearer ${token}" ${baseUrl}/collections

# Upload file
curl -X POST "${baseUrl}/api/collections/my-docs/upload" \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@document.pdf"

# Ask question
curl -X POST "${baseUrl}/api/collections/my-docs/ask" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is this about?"}'`;
    
    modal.classList.add('active');
};

window.showUsagePlan = function() {
    closeUserMenu();
    const usageCard = document.querySelector('[data-card="usage"]');
    if (usageCard) {
        usageCard.style.display = 'block';
        usageCard.scrollIntoView({ behavior: 'smooth' });
        loadUsageStats();
    }
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
};

window.toggleCardSize = function(cardType) {
    const card = document.querySelector(`[data-card="${cardType}"]`);
    const icon = card.querySelector('.card-action i');
    
    card.classList.toggle('expanded');
    
    if (card.classList.contains('expanded')) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
};

window.minimizeCard = function(cardType) {
    const card = document.querySelector(`[data-card="${cardType}"]`);
    const icon = card.querySelector('.card-action:last-child i');
    
    card.classList.toggle('minimized');
    
    if (card.classList.contains('minimized')) {
        icon.className = 'fas fa-plus';
    } else {
        icon.className = 'fas fa-minus';
    }
};

window.updateContextHelp = function(cardType) {
    const helpContent = document.getElementById('context-help-content');
    const content = contextHelpContent[cardType];
    
    if (content) {
        helpContent.innerHTML = `
            <div class="help-section">
                <h4>${content.title}</h4>
                <p>${content.description}</p>
                <div class="api-example">
                    <strong>API Equivalent:</strong>
                    <code>${content.apiExample.replace(/\$\{baseUrl\}/g, baseUrl).replace(/\$\{token\}/g, token)}</code>
                </div>
            </div>
        `;
    }
};

// Global search functionality
window.performGlobalSearch = function() {
    const query = document.getElementById('global-search-input').value.trim();
    if (!query) return;
    
    const resultsCard = document.getElementById('global-search-results');
    const resultsContent = document.getElementById('global-search-content');
    
    resultsCard.style.display = 'block';
    resultsContent.innerHTML = '<div class="loading">Searching across all collections...</div>';
    
    // Update context help
    updateContextHelp('search');
    
    // Simulate search across all collections
    searchAllCollections(query);
};

async function searchAllCollections(query) {
    try {
        // Get all collections first
        const collectionsResponse = await apiCall('/collections');
        if (!collectionsResponse || !collectionsResponse.ok) {
            throw new Error('Failed to fetch collections');
        }
        
        const collectionsData = await collectionsResponse.json();
        const collections = collectionsData.collections || [];
        
        const resultsContent = document.getElementById('global-search-content');
        let allResults = [];
        
        // Search each collection
        for (const collection of collections) {
            try {
                const searchResponse = await apiCall(`/api/collections/${collection.name}/search`, {
                    method: 'POST',
                    body: JSON.stringify({ query, limit: 5 })
                });
                
                if (searchResponse && searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    searchData.results.forEach(result => {
                        result.collectionName = collection.name;
                        allResults.push(result);
                    });
                }
            } catch (error) {
                console.warn(`Search failed for collection ${collection.name}:`, error);
            }
        }
        
        // Sort by relevance score
        allResults.sort((a, b) => b.score - a.score);
        
        // Display results
        displayGlobalSearchResults(allResults, query);
        
    } catch (error) {
        console.error('Global search error:', error);
        document.getElementById('global-search-content').innerHTML = 
            '<div class="error">Search failed. Please try again.</div>';
    }
}

function displayGlobalSearchResults(results, query) {
    const resultsContent = document.getElementById('global-search-content');
    
    if (results.length === 0) {
        resultsContent.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                <p>No results found for "${query}"</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="search-summary">
            <h4>Found ${results.length} results for "${query}"</h4>
        </div>
        <div class="search-results-grid">
    `;
    
    results.forEach(result => {
        const payload = result.payload;
        const score = (result.score * 100).toFixed(1);
        
        html += `
            <div class="search-result-item">
                <div class="result-header">
                    <span class="collection-badge">${result.collectionName}</span>
                    <span class="score-badge">${score}% match</span>
                </div>
                <div class="result-content">
                    ${payload.title ? `<h5>${payload.title}</h5>` : ''}
                    ${payload.filename ? `<div class="filename"><i class="fas fa-file"></i> ${payload.filename}</div>` : ''}
                    <p class="result-text">${(payload.text || payload.content || 'No preview available').substring(0, 200)}...</p>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    resultsContent.innerHTML = html;
}

window.hideGlobalSearch = function() {
    document.getElementById('global-search-results').style.display = 'none';
    document.getElementById('global-search-input').value = '';
};

// File drag and drop
window.handleDragOver = function(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
};

window.handleFileDrop = function(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    const fileInput = document.getElementById('file-input');
    fileInput.files = files;
    
    // Show file names
    updateFileDropZone(files);
};

function updateFileDropZone(files) {
    const dropZone = document.querySelector('.file-drop-zone');
    if (files.length > 0) {
        const fileNames = Array.from(files).map(file => file.name).join(', ');
        dropZone.innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--fiori-success);"></i>
            <p>${files.length} file(s) selected: ${fileNames}</p>
        `;
    }
}

// Advanced Q&A options
window.toggleAdvancedOptions = function() {
    const advancedOptions = document.querySelector('.advanced-options');
    const button = event.target;
    
    if (advancedOptions.style.display === 'none' || !advancedOptions.style.display) {
        advancedOptions.style.display = 'block';
        button.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Advanced';
    } else {
        advancedOptions.style.display = 'none';
        button.innerHTML = '<i class="fas fa-cog"></i> Advanced';
    }
};

// Admin tab switching
window.showAdminTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll('.admin-tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`admin-${tabName}-tab`).style.display = 'block';
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Load tab-specific content
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'system') {
        loadSystemStatus();
    }
};

// Enhanced copy functionality
function copyApiKey() {
    const apiKeyInput = document.getElementById('api-key');
    apiKeyInput.select();
    document.execCommand('copy');
    
    // Visual feedback
    const btn = event.target.closest('button');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    btn.style.background = 'var(--fiori-success)';
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = '';
    }, 2000);
}

// Enhanced update collection selects for Fiori styling
function updateCollectionSelects() {
    const selects = [
        'upload-collection',
        'text-collection',
        'browse-collection',
        'qa-collection-select'
    ];
    
    // Get collections from the displayed list - fix the selector
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

// Add CSS for global search results
const additionalStyles = `
.search-summary {
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--fiori-border);
}

.search-results-grid {
    display: grid;
    gap: 16px;
}

.search-result-item {
    background: var(--fiori-bg-secondary);
    border: 1px solid var(--fiori-border);
    border-radius: 6px;
    padding: 16px;
    transition: background-color 0.2s;
}

.search-result-item:hover {
    background: var(--fiori-bg-tertiary);
}

.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.collection-badge {
    background: var(--fiori-primary);
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

.score-badge {
    background: var(--fiori-bg-tertiary);
    color: var(--fiori-text-secondary);
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
}

.filename {
    color: var(--fiori-text-secondary);
    font-size: 13px;
    margin-bottom: 8px;
}

.result-text {
    color: var(--fiori-text-primary);
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
}
`;

// Inject additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
