require('dotenv').config();
const express = require('express');
const path = require('path');
const errorHandler = require('./utils/errorHandler');
const cors = require('cors');
const collectionsRouter = require('./routes/collections');
const pointsRouter = require('./routes/points');
const createAuthenticatedProxy = require('./middleware/qdrantProxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Initialize Qdrant connection
require('./config/qdrant');

// Routes
const authRoutes = require('./routes/authRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const webRoutes = require('./routes/webRoutes');

// API routes (define these first to avoid conflicts)
app.use('/api/auth', authRoutes);
app.use('/api', collectionRoutes); // Collections are user-specific, so they use auth middleware
app.use('/api', uploadRoutes); // Uploads are user-specific, so they use auth middleware

// Qdrant-compatible API routes
app.use('/collections', collectionsRouter);
app.use('/collections', pointsRouter);

// Direct Qdrant proxy for full compatibility (now with authentication)
app.use('/api/v1/qdrant', createAuthenticatedProxy());

// Web UI routes (serve after API routes to avoid conflicts)
app.use('/', webRoutes);

// Error handling middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
