const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class UserController {
  constructor(databaseService, usageService) {
    this.db = databaseService;
    this.usageService = usageService;
    
    // Bind methods to maintain context
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.getUserUsage = this.getUserUsage.bind(this);
    this.getActiveUsers = this.getActiveUsers.bind(this);
    this.getAdminDashboard = this.getAdminDashboard.bind(this);
    this.getAllUsers = this.getAllUsers.bind(this);
    this.createUser = this.createUser.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.getSystemHealth = this.getSystemHealth.bind(this);
  }

  async register(req, res) {
    try {
      const { username, password } = req.body;
      
      // Check if user exists
      const existingUser = await this.db.findUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'User already exists' 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await this.db.createUser(username, hashedPassword);
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.is_admin,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Registration failed' 
      });
    }
  }

  async login(req, res) {
    try {
      const { username, password } = req.body;
      
      console.log('Login attempt for username:', username);
      console.log('Password length:', password.length);
      
      // Validate input
      if (!username || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username and password are required' 
        });
      }
      
      // Find user
      const user = await this.db.findUserByUsername(username);
      console.log('User found:', user ? 'Yes' : 'No');
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Check if password hash exists
      if (!user.password_hash) {
        console.error('User has no password hash:', username);
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      console.log('Comparing password with hash');
      console.log('Password hash starts with:', user.password_hash.substring(0, 10));
      
      // Check password
      const isValid = await bcrypt.compare(password, user.password_hash);
      console.log('Password valid:', isValid);
      
      // For debugging, let's also test if the password matches what we expect
      const testHash = await bcrypt.hash(password, 10);
      console.log('Test hash starts with:', testHash.substring(0, 10));
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Generate token
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          isAdmin: user.is_admin 
        },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      // Update last login
      try {
        await this.db.updateUser(user.id, { last_login: new Date() });
      } catch (updateError) {
        console.warn('Failed to update last login:', updateError);
      }

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.is_admin,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Login failed' 
      });
    }
  }

  async getProfile(req, res) {
    try {
      const user = await this.db.findUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        createdAt: user.created_at
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ message: 'Failed to get profile' });
    }
  }

  async updateProfile(req, res) {
    try {
      const { username } = req.body;
      
      if (username) {
        // Check if new username is taken
        const existingUser = await this.db.findUserByUsername(username);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ message: 'Username already taken' });
        }
        
        await this.db.updateUser(req.user.id, { username });
      }

      res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: 'Failed to update profile' });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      
      const user = await this.db.findUserById(req.user.id);
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValid) {
        return res.status(400).json({ message: 'Invalid current password' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.updateUser(req.user.id, { password_hash: hashedPassword });

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ message: 'Failed to change password' });
    }
  }

  async deleteAccount(req, res) {
    try {
      await this.db.deleteUser(req.user.id);
      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({ message: 'Failed to delete account' });
    }
  }

  async getUserUsage(req, res) {
    try {
      const usage = await this.usageService.getUserUsage(req.user.id);
      res.json(usage);
    } catch (error) {
      console.error('Get user usage error:', error);
      res.status(500).json({ message: 'Failed to get usage statistics' });
    }
  }

  async getActiveUsers(req, res) {
    try {
      const activeUsers = await this.db.getActiveUsers();
      res.json(activeUsers);
    } catch (error) {
      console.error('Get active users error:', error);
      res.status(500).json({ message: 'Failed to get active users' });
    }
  }

  async getAdminDashboard(req, res) {
    try {
      const stats = await this.db.getSystemStats();
      res.json(stats);
    } catch (error) {
      console.error('Get admin dashboard error:', error);
      res.status(500).json({ message: 'Failed to get dashboard data' });
    }
  }

  async getAllUsers(req, res) {
    try {
      const users = await this.db.getAllUsers();
      res.json(users.map(user => ({
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        createdAt: user.created_at
      })));
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({ message: 'Failed to get users' });
    }
  }

  async createUser(req, res) {
    try {
      const { username, password, isAdmin = false } = req.body;
      
      const existingUser = await this.db.findUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await this.db.createUser(username, hashedPassword, isAdmin);
      
      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.is_admin,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ message: 'Failed to create user' });
    }
  }

  async updateUser(req, res) {
    try {
      const { username } = req.params;
      const { password, isAdmin } = req.body;
      
      const user = await this.db.findUserByUsername(username);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updates = {};
      if (password) {
        updates.password_hash = await bcrypt.hash(password, 10);
      }
      if (typeof isAdmin === 'boolean') {
        updates.is_admin = isAdmin;
      }

      await this.db.updateUser(user.id, updates);
      res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ message: 'Failed to update user' });
    }
  }

  async deleteUser(req, res) {
    try {
      const { username } = req.params;
      
      const user = await this.db.findUserByUsername(username);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      await this.db.deleteUser(user.id);
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  }

  async getSystemHealth(req, res) {
    try {
      const health = {
        database: { status: 'healthy', lastCheck: new Date().toISOString() },
        qdrant: { status: 'healthy', lastCheck: new Date().toISOString() },
        embeddings: { status: 'healthy', lastCheck: new Date().toISOString() },
        uptime: process.uptime()
      };
      
      res.json(health);
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({ message: 'Failed to get system health' });
    }
  }
}

module.exports = UserController;
