const jwt = require('jsonwebtoken');
const { UserService } = require('../services/userService');

const userService = new UserService();

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        
        req.user = user;
        next();
    });
};

// Middleware to authenticate admin users
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists and is admin
        const dbUser = await userService.getUser(user.username);
        if (!dbUser || !dbUser.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = {
    authenticateToken,
    authenticateAdmin,
    requireAdmin
};
