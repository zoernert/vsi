const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { authenticateAdmin } = require('../middleware/auth');
const router = express.Router();

// File path for storing users
const usersFilePath = path.join(__dirname, '..', '..', 'data', 'users.json');

// Ensure data directory exists
const dataDir = path.dirname(usersFilePath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize admin user if users file doesn't exist
function initializeAdmin() {
    const users = loadUsers();
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    
    if (!users[adminUsername]) {
        users[adminUsername] = {
            password: process.env.ADMIN_PASSWORD || 'admin123',
            id: 1,
            isAdmin: true,
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        };
        saveUsers(users);
        console.log(`✅ Admin user created: ${adminUsername}`);
        console.log(`⚠️  Please change the default admin password!`);
    }
}

// Load users from file or create empty object
function loadUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
    return {};
}

// Save users to file
function saveUsers(users) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error saving users:', error);
    }
}

// Initialize admin on startup
initializeAdmin();

// Register endpoint (now restricted)
router.post('/register', async (req, res) => {
    try {
        // Check if self-registration is allowed
        if (process.env.ALLOW_SELF_REGISTRATION !== 'true') {
            return res.status(403).json({ 
                error: 'Self-registration is disabled. Please contact an administrator.' 
            });
        }
        
        console.log('Registration attempt:', req.body);
        const { username, password } = req.body;
        
        if (!username || !password) {
            console.log('Missing username or password');
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const users = loadUsers();
        
        if (users[username]) {
            console.log('User already exists:', username);
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // In production, hash the password with bcrypt
        users[username] = { 
            password, 
            id: Object.keys(users).length + 1,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            createdBy: 'self-registration'
        };
        
        saveUsers(users);
        console.log('User registered successfully:', username);
        
        res.json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin create user endpoint
router.post('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        console.log('Admin user creation attempt:', req.body);
        const { username, password, isAdmin = false } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const users = loadUsers();
        
        if (users[username]) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // In production, hash the password with bcrypt
        users[username] = { 
            password, 
            id: Object.keys(users).length + 1,
            isAdmin: Boolean(isAdmin),
            createdAt: new Date().toISOString(),
            createdBy: req.user.username
        };
        
        saveUsers(users);
        console.log('User created by admin:', username);
        
        res.json({ 
            message: 'User created successfully',
            user: {
                username,
                isAdmin: Boolean(isAdmin),
                createdAt: users[username].createdAt
            }
        });
    } catch (error) {
        console.error('Admin user creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin list users endpoint
router.get('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = loadUsers();
        const userList = Object.keys(users).map(username => ({
            username,
            id: users[username].id,
            isAdmin: users[username].isAdmin,
            createdAt: users[username].createdAt,
            createdBy: users[username].createdBy
        }));
        
        res.json({ users: userList });
    } catch (error) {
        console.error('Admin list users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin update user endpoint
router.put('/admin/users/:username', authenticateAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const { password, isAdmin } = req.body;
        
        const users = loadUsers();
        
        if (!users[username]) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent removing admin status from the last admin
        if (users[username].isAdmin && isAdmin === false) {
            const adminCount = Object.values(users).filter(user => user.isAdmin).length;
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove admin status from the last admin user' });
            }
        }
        
        if (password) {
            users[username].password = password;
        }
        
        if (typeof isAdmin === 'boolean') {
            users[username].isAdmin = isAdmin;
        }
        
        users[username].updatedAt = new Date().toISOString();
        users[username].updatedBy = req.user.username;
        
        saveUsers(users);
        
        res.json({ 
            message: 'User updated successfully',
            user: {
                username,
                isAdmin: users[username].isAdmin,
                updatedAt: users[username].updatedAt
            }
        });
    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin delete user endpoint
router.delete('/admin/users/:username', authenticateAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const users = loadUsers();
        
        if (!users[username]) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent deleting the last admin
        if (users[username].isAdmin) {
            const adminCount = Object.values(users).filter(user => user.isAdmin).length;
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin user' });
            }
        }
        
        // Prevent self-deletion
        if (username === req.user.username) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        delete users[username];
        saveUsers(users);
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        console.log('Login attempt:', { username: req.body.username });
        const { username, password } = req.body;
        
        if (!username || !password) {
            console.log('Missing username or password');
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const users = loadUsers();
        console.log('Available users:', Object.keys(users));
        
        const user = users[username];
        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user.password !== password) {
            console.log('Invalid password for user:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        const token = jwt.sign(
            { 
                id: user.id, 
                username,
                isAdmin: user.isAdmin || false
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log('Login successful for user:', username);
        res.json({ 
            token, 
            username,
            isAdmin: user.isAdmin || false
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user info
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
    res.json({
        username: req.user.username,
        isAdmin: req.user.isAdmin || false,
        type: req.user.type || 'jwt',
        ...(req.user.type === 'rapidapi' && {
            rapidApiUser: req.user.rapidApiUser,
            rapidApiHost: req.user.rapidApiHost
        })
    });
});

// Registration status endpoint
router.get('/registration-status', (req, res) => {
    res.json({
        selfRegistrationEnabled: process.env.ALLOW_SELF_REGISTRATION === 'true',
        rapidApiEnabled: process.env.ALLOW_RAPIDAPI_USERS === 'true'
    });
});

// Debug endpoint to list users (remove in production)
router.get('/debug/users', (req, res) => {
    const users = loadUsers();
    const userList = Object.keys(users).map(username => ({
        username,
        id: users[username].id,
        isAdmin: users[username].isAdmin,
        createdAt: users[username].createdAt
    }));
    res.json({ users: userList });
});

module.exports = router;
