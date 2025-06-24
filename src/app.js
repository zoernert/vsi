const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const llmQaRoutes = require('./controllers/llm-qa.controller');
const analyticsRoutes = require('./routes/analyticsRoutes');
const usageRoutes = require('./routes/usageRoutes');

// Import routes
const authRoutes = require('./routes/authRoutes');
const collectionsRoutes = require('./routes/collections'); // Use the original collections.js file
const uploadRoutes = require('./routes/uploadRoutes');
const fileRoutes = require('./routes/fileRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Middleware and other app setup
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Debug middleware to see what's being requested
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Application error:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
    });
});

// Make sure vectorService is available to routes
// (You'll need to adjust this based on how vectorService is created in your app)
// app.locals.vectorService = vectorService; // or however you provide it

// Routes - Use the original collections file that was working
app.use('/api/auth', authRoutes);
app.use('/collections', collectionsRoutes); // This uses the original collections.js
app.use('/api', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/collections', llmQaRoutes);
app.use('/api/admin', adminRoutes);

// Mount admin analytics routes
app.use('/api/admin/analytics', analyticsRoutes);

// Mount usage routes
app.use('/api/usage', usageRoutes);

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;