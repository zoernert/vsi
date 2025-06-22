const express = require('express');
const app = express();
const llmQaRoutes = require('./controllers/llm-qa.controller');

// Middleware and other app setup
app.use(express.json());

// Make sure vectorService is available to routes
// (You'll need to adjust this based on how vectorService is created in your app)
// app.locals.vectorService = vectorService; // or however you provide it

// Register LLM Q&A routes
app.use('/api/collections', llmQaRoutes);

module.exports = app;