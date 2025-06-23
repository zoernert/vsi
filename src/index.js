require('dotenv').config();
const express = require('express');
const path = require('path');
const errorHandler = require('./utils/errorHandler');
const cors = require('cors');
const collectionsRouter = require('./routes/collections');
const pointsRouter = require('./routes/points');
const createAuthenticatedProxy = require('./middleware/qdrantProxy');
const { MigrationService } = require('./services/migrationService');
const { DatabaseService } = require('./services/databaseService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

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
const fileRoutes = require('./routes/fileRoutes');
const webRoutes = require('./routes/webRoutes');
const llmQaRoutes = require('./controllers/llm-qa.controller');
const mcpRoutes = require('./routes/mcpRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Make vector service available to routes (you'll need to import your VectorService)
// const { VectorService } = require('./services/vector.service');
// const vectorService = new VectorService();
// app.set('vectorService', vectorService);

// Public file download routes (NO AUTHENTICATION)
app.use('/api', fileRoutes);

// Public web routes (including /api/config)
app.use('/', webRoutes);

// API routes (require authentication)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', collectionRoutes);
app.use('/api', uploadRoutes);
app.use('/api/collections', llmQaRoutes); // Add LLM Q&A routes

// MCP service endpoint
app.use('/mcp', mcpRoutes);

// Qdrant-compatible API routes
app.use('/collections', collectionsRouter);
app.use('/collections', pointsRouter);

// Direct Qdrant proxy for full compatibility (now with authentication)
app.use('/api/v1/qdrant', createAuthenticatedProxy());

// Error handling middleware
app.use(errorHandler);

async function initializeDatabase() {
    try {
        // Test database connection
        const db = new DatabaseService();
        await db.pool.query('SELECT 1');
        console.log('✅ Database connection successful');
        
        // Run migrations
        const migrationService = new MigrationService();
        await migrationService.runMigrations(); // This should run all migrations including files table
        
        console.log('✅ Database migrations completed');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        console.error('Please ensure PostgreSQL is running and accessible');
        process.exit(1);
    }
}

async function startServer() {
    try {
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`✅ VSI Vector Store ready with monetization features`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

