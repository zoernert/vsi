console.log('🔥 SERVER.JS LOADING - NEW DEBUG VERSION');
console.log('🕐 Timestamp:', new Date().toISOString());

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('📦 Dependencies loaded successfully');

const app = express();

console.log('🚀 Express app created');

// Import services
const { DatabaseService } = require('./services/databaseService');
const { MigrationService } = require('./services/migrationService');
const { auth } = require('./middleware');
const uploadRoutes = require('./routes/uploadRoutes');

// Initialize services
const db = new DatabaseService();
const migrations = new MigrationService();

// Initialize database on startup
async function initializeApp() {
    try {
        await db.initialize();
        await migrations.runMigrations();
        
        // Check and fix password hashes for existing users
        const usersWithoutHash = await db.getUsersWithoutPasswordHash();
        console.log(`Found ${usersWithoutHash.length} users without proper password hash`);
        
        for (const user of usersWithoutHash) {
            if (user.username === process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
                const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
                await db.fixUserPasswordHash(user.id, hash);
                console.log(`Fixed password hash for admin user: ${user.username}`);
            }
        }
        
        console.log('All users have proper password hashes');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🔧 Basic middleware registered');

// Add comprehensive debugging middleware
app.use((req, res, next) => {
    console.log(`\n=== INCOMING REQUEST ${new Date().toISOString()} ===`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Path: ${req.path}`);
    console.log(`Headers:`, {
        'content-type': req.get('content-type'),
        'authorization': req.get('authorization') ? 'Bearer [present]' : 'none',
        'user-agent': req.get('user-agent')
    });
    console.log(`Query:`, req.query);
    console.log(`Params:`, req.params);
    console.log(`========================\n`);
    next();
});

console.log('🐛 Debug middleware registered');

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Auth routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.findUserByUsername(username);
        
        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, isAdmin: user.is_admin },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        try {
            await db.updateUser(user.id, { last_login: new Date() });
        } catch (updateError) {
            console.log('Failed to update last login:', updateError);
        }

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.is_admin,
                tier: user.tier
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        
        const user = await db.createUser(username, passwordHash, false);
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.message === 'Username already exists') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// User routes
app.get('/api/users/profile', auth, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                isAdmin: req.user.is_admin,
                tier: req.user.tier,
                createdAt: req.user.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/users/usage', auth, async (req, res) => {
    try {
        const tier = await db.getUserTier(req.user.id);
        const [collections, documents, searches, uploads] = await Promise.all([
            db.getCurrentUsage(req.user.id, 'collections'),
            db.getCurrentUsage(req.user.id, 'documents'),
            db.getCurrentUsage(req.user.id, 'searches'),
            db.getCurrentUsage(req.user.id, 'uploads')
        ]);

        const limits = {
            free: { collections: 5, documents: 100, searches: 50, uploads: 20 },
            pro: { collections: 50, documents: 10000, searches: 500, uploads: 200 },
            unlimited: { collections: -1, documents: -1, searches: -1, uploads: -1 }
        };

        const tierLimits = limits[tier] || limits.free;

        res.json({
            collections: { current: collections, limit: tierLimits.collections, percentage: 0 },
            documents: { current: documents, limit: tierLimits.documents, percentage: 0 },
            searches: { current: searches, limit: tierLimits.searches, percentage: 0 },
            uploads: { current: uploads, limit: tierLimits.uploads, percentage: 0 },
            tier: tier || 'free',
            billingPeriod: {
                start: '2025-05-31',
                end: '2025-06-29'
            }
        });
    } catch (error) {
        console.error('Usage error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Collections routes
app.get('/api/collections', auth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM collections WHERE user_id = $1', [req.user.id]);
        const collections = result.rows.map(collection => ({
            ...collection,
            document_count: "0",
            stats: {
                document_count: "0",
                total_content_size: null,
                avg_content_size: null,
                last_updated: null
            }
        }));
        res.json(collections);
    } catch (error) {
        console.error('Collections error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/collections/:id', auth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Upload routes - Add debugging before registration
console.log('📁 Registering upload routes...');
app.use('/api', (req, res, next) => {
    console.log(`🔍 Upload middleware hit: ${req.method} ${req.url}`);
    next();
}, uploadRoutes);
console.log('✅ Upload routes registered');

// Health check
app.get('/api/health', (req, res) => {
    console.log('💚 Health check endpoint hit');
    res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Debug: List all registered routes
app._router.stack.forEach((middleware, index) => {
    if (middleware.route) {
        console.log(`Route ${index}: ${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
        console.log(`Router ${index}: ${middleware.regexp}`);
        if (middleware.handle && middleware.handle.stack) {
            middleware.handle.stack.forEach((handler, subIndex) => {
                if (handler.route) {
                    console.log(`  Sub-route ${subIndex}: ${Object.keys(handler.route.methods)} ${handler.route.path}`);
                }
            });
        }
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;

// Initialize app and start server
initializeApp().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});