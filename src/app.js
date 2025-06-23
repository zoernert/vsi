const express = require('express');
const app = express();
const llmQaRoutes = require('./controllers/llm-qa.controller');
const analyticsRoutes = require('./routes/analyticsRoutes');
const usageRoutes = require('./routes/usageRoutes');

// Middleware and other app setup
app.use(express.json());

// Make sure vectorService is available to routes
// (You'll need to adjust this based on how vectorService is created in your app)
// app.locals.vectorService = vectorService; // or however you provide it

// Register LLM Q&A routes
app.use('/api/collections', llmQaRoutes);

// Mount admin analytics routes
app.use('/api/admin/analytics', analyticsRoutes);

// Mount usage routes
app.use('/api/usage', usageRoutes);

module.exports = app;