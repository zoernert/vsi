const express = require('express');
const router = express.Router();
const path = require('path');

// Serve static files
router.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint to get server configuration
router.get('/api/config', (req, res) => {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    res.json({
        baseUrl,
        version: '1.0.0',
        features: {
            selfRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true',
            rapidApiSupport: process.env.ALLOW_RAPIDAPI_USERS === 'true',
            mcpSupport: true
        }
    });
});

// Serve main dashboard
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Serve OpenAPI specification
router.get('/openapi.json', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'openapi.json'));
});

// Serve API documentation redirect
router.get('/api-docs', (req, res) => {
    res.redirect('/openapi.json');
});

module.exports = router;
