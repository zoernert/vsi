const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access Denied: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user payload (e.g., { userId: 'uuid' }) to the request
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Access Denied: Invalid token' });
    }
};

module.exports = authenticateToken;
