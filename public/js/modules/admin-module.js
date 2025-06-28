/**
 * VSI Admin Module
 * Handles administrative operations, user management, and system monitoring
 */
class VSIAdminModule {
    constructor(app) {
        this.app = app;
        this.currentUserFilters = {
            search: '',
            tier: '',
            isAdmin: '',
            sortBy: 'created_at',
            sortOrder: 'desc',
            page: 1,
            limit: 10
        };
        this.usersPagination = null;
    }

    async showAdmin() {
        if (!this.app.user.isAdmin) return;
        
        this.app.showView('admin');
        await this.loadAdmin();
    }

    async loadAdmin() {
        try {
            const [dashboard, health] = await Promise.all([
                this.app.api.getAdminDashboard(),
                this.app.api.getSystemHealth()
            ]);
            
            // Handle responses according to OpenAPI spec
            const dashboardData = dashboard;
            const healthData = health?.success ? health.data : health;
            
            this.renderAdmin(dashboardData, healthData);
            await this.loadUsers(); // Load users separately with filtering
        } catch (error) {
            console.error('Admin load error:', error);
            this.app.showNotification('Failed to load admin data', 'error');
        }
    }

    renderAdmin(dashboard, health) {
        const container = document.getElementById('adminContent');

        // Handle the admin dashboard structure from OpenAPI spec
        const overview = dashboard?.overview || {};
        const totalUsers = overview.totalUsers || 0;
        const totalCollections = overview.totalCollections || 0;
        const totalDocuments = overview.totalDocuments || 0;

        container.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card stats-card">
                        <div class="card-body text-center">
                            <i class="fas fa-users fa-2x mb-2"></i>
                            <h3>${totalUsers}</h3>
                            <p class="mb-0">Total Users</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stats-card">
                        <div class="card-body text-center">
                            <i class="fas fa-folder fa-2x mb-2"></i>
                            <h3>${totalCollections}</h3>
                            <p class="mb-0">Collections</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stats-card">
                        <div class="card-body text-center">
                            <i class="fas fa-file fa-2x mb-2"></i>
                            <h3>${totalDocuments}</h3>
                            <p class="mb-0">Documents</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stats-card">
                        <div class="card-body text-center">
                            <i class="fas fa-heartbeat fa-2x mb-2"></i>
                            <h3>${health ? 'Healthy' : 'Unknown'}</h3>
                            <p class="mb-0">System Status</p>
                        </div>
                    </div>
                </div>
            </div>
            
            ${health ? `
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <h6><i class="fas fa-database me-2"></i>Database</h6>
                        </div>
                        <div class="card-body">
                            <span class="badge bg-${health.database?.status === 'healthy' ? 'success' : 'danger'}">
                                ${health.database?.status || 'Unknown'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <h6><i class="fas fa-vector-square me-2"></i>Qdrant</h6>
                        </div>
                        <div class="card-body">
                            <span class="badge bg-${health.qdrant?.status === 'healthy' ? 'success' : 'danger'}">
                                ${health.qdrant?.status || 'Unknown'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <h6><i class="fas fa-brain me-2"></i>Embeddings</h6>
                        </div>
                        <div class="card-body">
                            <span class="badge bg-${health.embeddings?.status === 'healthy' ? 'success' : 'danger'}">
                                ${health.embeddings?.status || 'Unknown'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5><i class="fas fa-users me-2"></i>Users Management</h5>
                    <button class="btn btn-primary btn-sm" onclick="app.admin.showCreateUserModal()">
                        <i class="fas fa-plus me-2"></i>Create User
                    </button>
                </div>
                
                <!-- Search and Filter Controls -->
                <div class="card-body border-bottom">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <div class="input-group">
                                <input type="text" class="form-control" id="userSearch" 
                                       placeholder="Search by username or email..." 
                                       onkeypress="if(event.key==='Enter') app.admin.searchUsers()">
                                <button class="btn btn-outline-secondary" onclick="app.admin.searchUsers()">
                                    <i class="fas fa-search"></i>
                                </button>
                            </div>
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="tierFilter" onchange="app.admin.filterUsers()">
                                <option value="">All Tiers</option>
                                <option value="free">Free</option>
                                <option value="starter">Starter</option>
                                <option value="professional">Professional</option>
                                <option value="enterprise">Enterprise</option>
                                <option value="unlimited">Unlimited</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="roleFilter" onchange="app.admin.filterUsers()">
                                <option value="">All Roles</option>
                                <option value="true">Admin</option>
                                <option value="false">User</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="sortBy" onchange="app.admin.filterUsers()">
                                <option value="created_at">Sort by Created</option>
                                <option value="username">Sort by Username</option>
                                <option value="tier">Sort by Tier</option>
                                <option value="is_admin">Sort by Role</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="sortOrder" onchange="app.admin.filterUsers()">
                                <option value="desc">Descending</option>
                                <option value="asc">Ascending</option>
                            </select>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-auto">
                            <button class="btn btn-outline-secondary btn-sm" onclick="app.admin.clearFilters()">
                                <i class="fas fa-times me-1"></i>Clear Filters
                            </button>
                        </div>
                        <div class="col">
                            <div class="text-muted small">
                                <span id="filteredUserCount">0</span> users found | 
                                <span id="currentPageInfo">Page 1 of 1</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Tier</th>
                                    <th>Role</th>
                                    <th>Collections</th>
                                    <th>Documents</th>
                                    <th>Last Active</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr>
                                    <td colspan="9" class="text-center">
                                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                                        Loading users...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination Controls -->
                    <div class="d-flex justify-content-between align-items-center mt-3" id="usersPagination">
                        <div class="text-muted small" id="paginationInfo">
                            Showing 0 - 0 of 0 users
                        </div>
                        <div class="btn-group" role="group">
                            <button id="prevPageBtn" onclick="app.admin.previousPage()" 
                                    class="btn btn-outline-secondary btn-sm" disabled>
                                <i class="fas fa-chevron-left"></i> Previous
                            </button>
                            <span id="pageNumbers" class="btn-group"></span>
                            <button id="nextPageBtn" onclick="app.admin.nextPage()" 
                                    class="btn btn-outline-secondary btn-sm" disabled>
                                Next <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Load users with search and filtering
    async loadUsers(resetPage = false) {
        try {
            if (resetPage) {
                this.currentUserFilters.page = 1;
            }
            
            const params = new URLSearchParams();
            
            // Add filters to params
            Object.keys(this.currentUserFilters).forEach(key => {
                if (this.currentUserFilters[key]) {
                    params.append(key, this.currentUserFilters[key]);
                }
            });
            
            const url = `${this.app.config.apiBaseUrl}/admin/users?${params.toString()}`;
            console.log('Loading users from:', url);
            console.log('Token present:', !!this.app.token);
            
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.app.token}`
                }
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Authentication failed - please login again');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Users data received:', data);
            
            if (data && data.success) {
                this.updateUsersTable(data.data);
                this.updateUsersPagination(data.pagination);
                this.updateUserStats(data.pagination, data.filters);
            } else {
                throw new Error(data?.message || 'Failed to load users');
            }
            
        } catch (error) {
            console.error('Users error:', error);
            document.getElementById('usersTableBody').innerHTML = 
                '<tr><td colspan="9" class="text-center text-danger">Failed to load users: ' + error.message + '</td></tr>';
        }
    }

    // Search users
    searchUsers() {
        const searchValue = document.getElementById('userSearch').value.trim();
        this.currentUserFilters.search = searchValue;
        this.loadUsers(true);
    }

    // Filter users
    filterUsers() {
        this.currentUserFilters.tier = document.getElementById('tierFilter').value;
        this.currentUserFilters.isAdmin = document.getElementById('roleFilter').value;
        this.currentUserFilters.sortBy = document.getElementById('sortBy').value;
        this.currentUserFilters.sortOrder = document.getElementById('sortOrder').value;
        this.loadUsers(true);
    }

    // Clear filters
    clearFilters() {
        document.getElementById('userSearch').value = '';
        document.getElementById('tierFilter').value = '';
        document.getElementById('roleFilter').value = '';
        document.getElementById('sortBy').value = 'created_at';
        document.getElementById('sortOrder').value = 'desc';
        
        this.currentUserFilters = {
            search: '',
            tier: '',
            isAdmin: '',
            sortBy: 'created_at',
            sortOrder: 'desc',
            page: 1,
            limit: 10
        };
        
        this.loadUsers();
    }

    // Pagination functions
    previousPage() {
        if (this.currentUserFilters.page > 1) {
            this.currentUserFilters.page--;
            this.loadUsers();
        }
    }

    nextPage() {
        if (this.usersPagination && this.usersPagination.hasNext) {
            this.currentUserFilters.page++;
            this.loadUsers();
        }
    }

    goToPage(page) {
        this.currentUserFilters.page = page;
        this.loadUsers();
    }

    // Update users table
    updateUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.email || '<span class="text-muted">Not provided</span>'}</td>
                <td><span class="badge bg-info">${user.tier}</span></td>
                <td>
                    <span class="badge bg-${user.is_admin ? 'danger' : 'primary'}">
                        ${user.is_admin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td>${user.stats?.collections || 0}</td>
                <td>${user.stats?.documents || 0}</td>
                <td>${user.stats?.last_activity ? new Date(user.stats.last_activity).toLocaleDateString() : '<span class="text-muted">Never</span>'}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" 
                            onclick="app.admin.editUser('${user.username}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${user.username !== this.app.user?.username ? `
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="app.admin.deleteUser('${user.username}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }

    // Update pagination controls
    updateUsersPagination(pagination) {
        this.usersPagination = pagination;
        
        document.getElementById('prevPageBtn').disabled = !pagination.hasPrev;
        document.getElementById('nextPageBtn').disabled = !pagination.hasNext;
        
        // Update pagination info
        const start = ((pagination.page - 1) * pagination.limit) + 1;
        const end = Math.min(pagination.page * pagination.limit, pagination.total);
        document.getElementById('paginationInfo').textContent = 
            `Showing ${start} - ${end} of ${pagination.total} users`;
        
        // Update page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        pageNumbers.innerHTML = '';
        
        const maxPages = Math.min(pagination.totalPages, 5);
        const startPage = Math.max(1, pagination.page - Math.floor(maxPages / 2));
        const endPage = Math.min(pagination.totalPages, startPage + maxPages - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            button.className = `btn btn-sm ${i === pagination.page ? 'btn-primary' : 'btn-outline-secondary'}`;
            button.onclick = () => this.goToPage(i);
            pageNumbers.appendChild(button);
        }
    }

    // Update user statistics
    updateUserStats(pagination, filters) {
        document.getElementById('filteredUserCount').textContent = pagination.total;
        document.getElementById('currentPageInfo').textContent = 
            `Page ${pagination.page} of ${pagination.totalPages}`;
    }

    showCreateUserModal() {
        const username = prompt('Username:');
        const password = prompt('Password:');
        const email = prompt('Email (optional):');
        const isAdmin = confirm('Make this user an admin?');
        const tier = prompt('Tier (free/pro/unlimited):', 'free');
        
        if (username && password) {
            this.createUser(username, password, email, isAdmin, tier);
        }
    }

    async createUser(username, password, email, isAdmin, tier) {
        try {
            const userData = { username, password, isAdmin, tier };
            if (email) userData.email = email;
            
            const response = await this.app.api.createUser(userData);
            
            if (response && response.success) {
                this.app.showNotification('User created successfully!', 'success');
                this.loadUsers(); // Refresh the users list
            } else {
                this.app.showNotification(response?.message || 'Failed to create user', 'error');
            }
        } catch (error) {
            this.app.showNotification('Failed to create user', 'error');
        }
    }

    editUser(username) {
        const newTier = prompt(`Change tier for ${username} (free/pro/unlimited):`, 'free');
        const makeAdmin = confirm(`Make ${username} an admin?`);
        
        if (newTier) {
            this.updateUser(username, { tier: newTier, isAdmin: makeAdmin });
        }
    }

    async updateUser(username, updates) {
        try {
            const response = await this.app.api.updateUser(username, updates);
            
            if (response && response.success) {
                this.app.showNotification('User updated successfully!', 'success');
                this.loadUsers(); // Refresh the users list
            } else {
                this.app.showNotification(response?.message || 'Failed to update user', 'error');
            }
        } catch (error) {
            this.app.showNotification('Failed to update user', 'error');
        }
    }

    async deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user ${username}?`)) return;
        
        try {
            const response = await this.app.api.deleteUser(username);
            
            if (response && response.success) {
                this.app.showNotification('User deleted successfully!', 'success');
                this.loadUsers(); // Refresh the users list
            } else {
                this.app.showNotification(response?.message || 'Failed to delete user', 'error');
            }
        } catch (error) {
            this.app.showNotification('Failed to delete user', 'error');
        }
    }
}

window.VSIAdminModule = VSIAdminModule;
