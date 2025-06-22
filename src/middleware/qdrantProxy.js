const { createProxyMiddleware } = require('http-proxy-middleware');
const { authenticateToken } = require('./auth');

// Create authenticated proxy middleware
const createAuthenticatedProxy = () => {
  return [
    authenticateToken, // Apply authentication first
    createProxyMiddleware({
      target: process.env.QDRANT_URL || 'http://localhost:6333',
      changeOrigin: true,
      pathRewrite: {
        '^/api/v1/qdrant': '', // Remove /api/v1/qdrant prefix
      },
      onProxyReq: (proxyReq, req, res) => {
        // Remove authorization headers before forwarding to Qdrant
        proxyReq.removeHeader('authorization');
        proxyReq.removeHeader('api-key');
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Qdrant service unavailable' });
      }
    })
  ];
};

module.exports = createAuthenticatedProxy;
