/**
 * VSI Authentication Module
 * Handles user authentication, profile management, and authorization
 */
class VSIAuthModule {
    constructor(app) {
        this.app = app;
        this.bindEvents();
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            await this.login(username, password);
        });

        // Register form
        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                this.app.showNotification('Passwords do not match', 'error');
                return;
            }
            
            await this.register(username, password);
        });

        // Profile form
        document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('profileUsername').value;
            const email = document.getElementById('profileEmail').value;
            await this.updateProfile(username, email);
        });

        // Password form
        document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            await this.changePassword(currentPassword, newPassword);
        });
    }

    async login(username, password) {
        try {
            console.log('Attempting login for:', username);
            
            const data = await this.app.api.login(username, password);
            
            if (data && data.success) {
                await this.handleLoginSuccess(data);
            } else {
                this.app.showNotification(data?.message || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.app.showNotification('Network error during login', 'error');
        }
    }

    async handleLoginSuccess(data) {
        console.log('Login successful:', data);
        
        // Store token and user data
        this.app.token = data.token;
        this.app.user = data.user;
        localStorage.setItem(`${this.app.config.storagePrefix}token`, data.token);
        
        // Properly hide all modals
        this.hideAllModals();
        
        // Remove any overlay or loading states
        this.removeOverlays();
        
        // Show the main app
        await this.showApp();
        
        this.app.showNotification(`Welcome back, ${data.user.username}!`, 'success');
    }

    hideAllModals() {
        // Hide login modal
        const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        if (loginModal) {
            loginModal.hide();
        }
        
        // Hide register modal
        const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
        if (registerModal) {
            registerModal.hide();
        }
        
        // Force remove modal backdrops that might be stuck
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                backdrop.remove();
            });
            
            // Remove modal-open class from body
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }, 100);
    }

    removeOverlays() {
        // Remove any loading overlays or disabled states
        document.body.classList.remove('loading', 'disabled');
        
        // Remove any custom overlays
        document.querySelectorAll('.overlay, .loading-overlay').forEach(overlay => {
            overlay.remove();
        });
        
        // Ensure body is interactive
        document.body.style.pointerEvents = '';
    }

    async register(username, password) {
        try {
            console.log('Attempting registration for:', username);
            
            const data = await this.app.api.register(username, password);
            
            if (data && data.success) {
                this.app.showNotification('Registration successful! Please login.', 'success');
                this.app.ui.hideModals();
                this.showLoginModal();
            } else {
                this.app.showNotification(data?.message || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.app.showNotification('Network error during registration', 'error');
        }
    }

    async loadUser() {
        try {
            console.log('Loading user profile...');
            const response = await this.app.api.getUserProfile();
            if (response && response.success) {
                console.log('User profile loaded:', response.data);
                this.app.user = response.data;
                this.showApp();
            } else {
                console.log('Failed to load user profile, logging out');
                this.logout();
            }
        } catch (error) {
            console.error('Load user error:', error);
            this.logout();
        }
    }

    logout() {
        // Clear stored data
        localStorage.removeItem(`${this.app.config.storagePrefix}token`);
        this.app.token = null;
        this.app.user = null;
        this.app.currentCollection = null;
        
        // Hide main app
        document.getElementById('app').classList.add('hidden');
        
        // Hide admin nav
        const adminNav = document.getElementById('adminNav');
        if (adminNav) {
            adminNav.classList.add('hidden');
        }
        
        // Remove any stuck modals or overlays
        this.removeOverlays();
        
        // Show login modal
        this.showLoginModal();
        
        this.app.showNotification('Logged out successfully', 'info');
    }

    async showApp() {
        try {
            // Hide auth views and show main app
            document.getElementById('app').classList.remove('hidden');
            
            // Update UI with user info
            const currentUserElement = document.getElementById('currentUser');
            if (currentUserElement) {
                currentUserElement.textContent = this.app.user.username;
            }
            
            // Show admin nav if user is admin
            if (this.app.user.isAdmin) {
                const adminNav = document.getElementById('adminNav');
                if (adminNav) {
                    adminNav.classList.remove('hidden');
                }
            }
            
            // Load dashboard data
            await this.app.collections.loadDashboard();
            
        } catch (error) {
            console.error('Error showing app:', error);
            this.app.showNotification('Error loading application', 'error');
        }
    }

    showLoginModal() {
        console.log('Showing login modal');
        const modal = new bootstrap.Modal(document.getElementById('loginModal'));
        modal.show();
    }

    showRegisterModal() {
        console.log('Showing register modal');
        const modal = new bootstrap.Modal(document.getElementById('registerModal'));
        modal.show();
    }

    showProfileModal() {
        const modal = new bootstrap.Modal(document.getElementById('profileModal'));
        document.getElementById('profileUsername').value = this.app.user.username;
        document.getElementById('profileEmail').value = this.app.user.email || '';
        modal.show();
    }

    async updateProfile(username, email) {
        try {
            const response = await this.app.api.updateUserProfile({ username, email });
            
            if (response && response.success) {
                this.app.user = { ...this.app.user, username, email };
                document.getElementById('currentUser').textContent = username;
                this.app.showNotification('Profile updated successfully!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
            } else {
                this.app.showNotification(response?.message || 'Failed to update profile', 'error');
            }
        } catch (error) {
            this.app.showNotification('Failed to update profile', 'error');
        }
    }

    async changePassword(currentPassword, newPassword) {
        try {
            const response = await this.app.api.changePassword(currentPassword, newPassword);
            
            if (response && response.success) {
                this.app.showNotification('Password changed successfully!', 'success');
                document.getElementById('passwordForm').reset();
            } else {
                this.app.showNotification(response?.message || 'Failed to change password', 'error');
            }
        } catch (error) {
            this.app.showNotification('Failed to change password', 'error');
        }
    }
}

window.VSIAuthModule = VSIAuthModule;
