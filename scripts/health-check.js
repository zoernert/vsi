const http = require('http');
const { logger } = require('../src/utils/logger');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

function performHealthCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/v1/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.success) {
            resolve(response);
          } else {
            reject(new Error(`Health check failed: ${response.message || 'Unknown error'}`));
          }
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Health check request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check request timed out'));
    });

    req.end();
  });
}

async function main() {
  try {
    logger.info('Performing health check...', { host: HOST, port: PORT });
    
    const response = await performHealthCheck();
    
    logger.info('✅ Health check passed', {
      status: 'healthy',
      response: response.message,
      timestamp: response.timestamp
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Health check failed', { error: error.message });
    process.exit(1);
  }
}

main();
