const express = require('express');
const router = express.Router();

const uploadRoutes = require('./uploadRoutes');

// Register upload routes
router.use('/', uploadRoutes);

module.exports = router;