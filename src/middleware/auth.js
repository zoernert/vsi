const jwt = require('jsonwebtoken');

// Extract existing auth middleware and make it reusable
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['api-key']; // Support API key header for Qdrant clients
    
    // Check for RapidAPI headers if enabled
    if (process.env.ALLOW_RAPIDAPI_USERS === 'true') {
        const rapidApiKey = req.headers['x-rapidapi-key'];
        const rapidApiHost = req.headers['x-rapidapi-host'];
        const rapidApiUser = req.headers['x-rapidapi-user'];
        
        if (rapidApiKey && rapidApiHost) {
            // Create a virtual user for RapidAPI requests
            req.user = { 
                id: `rapidapi_${rapidApiUser || 'anonymous'}`, 
                username: `rapidapi_${rapidApiUser || 'anonymous'}`,
                type: 'rapidapi',
                rapidApiKey,
                rapidApiHost,
                rapidApiUser
            };
            return next();
        }
    }
    
    // Check for API key first (for standard Qdrant clients) - only if API_KEY is configured
    if (apiKey && process.env.API_KEY) {
        if (apiKey === process.env.API_KEY) {
            req.user = { id: 'api-user', username: 'api', type: 'api' }; // Default user for API key access
            return next();
        } else {
            return res.status(401).json({ error: 'Invalid API key' });
        }
    }
    
    // Fall back to JWT token
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = { ...user, type: 'jwt' };
        next();
    });
};

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, (err) => {
        if (err) return next(err);
        
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        next();
    });
};

module.exports = { authenticateToken, authenticateAdmin };
