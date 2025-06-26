const jwt = require('jsonwebtoken');
const { DatabaseService } = require('../services/databaseService');

const db = new DatabaseService();

const auth = async (req, res, next) => {
    console.log(`\n🔐 AUTH MIDDLEWARE:`);
    console.log(`Path: ${req.path}`);
    console.log(`Method: ${req.method}`);
    
    try {
        const authHeader = req.header('Authorization');
        console.log(`Auth header: ${authHeader ? 'Present' : 'Missing'}`);
        
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            console.log(`❌ No token provided`);
            return res.status(401).json({ success: false, message: 'Access denied' });
        }

        console.log(`🎫 Token: ${token.substring(0, 20)}...`);
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        console.log(`✅ Token decoded:`, { id: decoded.id, username: decoded.username });
        
        const user = await db.findUserById(decoded.id);
        console.log(`👤 User found:`, user ? { id: user.id, username: user.username } : 'NOT FOUND');
        
        if (!user) {
            console.log(`❌ User not found in database`);
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        req.user = user;
        console.log(`✅ Auth successful for user: ${user.username}`);
        next();
    } catch (error) {
        console.log(`❌ Auth error:`, error.message);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

module.exports = {
    auth,
    validation: (req, res, next) => next(), // Placeholder
    errorHandler: (err, req, res, next) => {
        console.error('Error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    },
    rateLimiting: (req, res, next) => next(), // Placeholder
    logging: (req, res, next) => next(), // Placeholder
    security: (req, res, next) => next() // Placeholder
};
