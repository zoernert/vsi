#!/usr/bin/env node

/**
 * Agent Connectivity Diagnostic Tool
 * 
 * This script helps diagnose network connectivity issues for the VSI agent system
 * in production environments.
 */

const axios = require('axios');
const { AgentApiClient } = require('../src/services/agentApiClient');

class ConnectivityDiagnostic {
    constructor() {
        this.results = [];
        this.baseUrls = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://0.0.0.0:3000',
            process.env.API_BASE_URL,
            process.env.BASE_URL,
            process.env.SERVER_URL
        ].filter(Boolean);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': '🔍',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '📋';
        
        console.log(`${timestamp} ${prefix} ${message}`);
    }

    async testConnection(baseUrl) {
        this.log(`Testing connection to: ${baseUrl}`);
        
        try {
            // Test basic health endpoint
            const healthResponse = await axios.get(`${baseUrl}/api/health`, {
                timeout: 10000,
                validateStatus: () => true
            });
            
            this.log(`Health endpoint status: ${healthResponse.status}`, 
                healthResponse.status === 200 ? 'success' : 'warning');
            
            if (healthResponse.status !== 200) {
                this.log(`Health endpoint response: ${JSON.stringify(healthResponse.data)}`, 'warning');
                return false;
            }

            // Test collections endpoint (requires auth)
            try {
                const collectionsResponse = await axios.get(`${baseUrl}/api/collections`, {
                    timeout: 10000,
                    validateStatus: () => true
                });
                
                this.log(`Collections endpoint status: ${collectionsResponse.status}`, 
                    collectionsResponse.status === 401 ? 'success' : 'warning');
                
                // 401 is expected without auth token
                if (collectionsResponse.status === 401) {
                    this.log(`Authentication required (expected)`, 'success');
                    return true;
                }
                
            } catch (collectionsError) {
                this.log(`Collections endpoint error: ${collectionsError.message}`, 'warning');
            }

            return true;

        } catch (error) {
            this.log(`Connection failed: ${error.message}`, 'error');
            
            if (error.code) {
                this.log(`Error code: ${error.code}`, 'error');
            }
            
            if (error.errno) {
                this.log(`Error number: ${error.errno}`, 'error');
            }
            
            return false;
        }
    }

    async testAgentApiClient() {
        this.log('Testing AgentApiClient initialization...');
        
        try {
            const client = new AgentApiClient('diagnostic-session');
            this.log(`AgentApiClient created with baseURL: ${client.baseUrl}`, 'success');
            
            // Test a simple request
            try {
                await client.getSystemStatus();
                this.log('System status request successful', 'success');
            } catch (error) {
                this.log(`System status request failed: ${error.message}`, 'warning');
                this.log('This is expected if server is not accessible', 'info');
            }
            
        } catch (error) {
            this.log(`AgentApiClient creation failed: ${error.message}`, 'error');
        }
    }

    async checkEnvironmentVariables() {
        this.log('Checking environment variables...');
        
        const envVars = [
            'NODE_ENV',
            'PORT',
            'API_BASE_URL',
            'BASE_URL',
            'SERVER_URL',
            'JWT_SECRET'
        ];
        
        for (const envVar of envVars) {
            const value = process.env[envVar];
            if (value) {
                if (envVar.includes('SECRET') || envVar.includes('PASSWORD')) {
                    this.log(`${envVar}: [REDACTED]`, 'success');
                } else {
                    this.log(`${envVar}: ${value}`, 'success');
                }
            } else {
                this.log(`${envVar}: not set`, 'warning');
            }
        }
    }

    async checkNetworkInterfaces() {
        this.log('Checking network configuration...');
        
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        
        for (const [interfaceName, interfaces] of Object.entries(networkInterfaces)) {
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    this.log(`External interface ${interfaceName}: ${iface.address}`, 'info');
                }
            }
        }
    }

    async testDnsResolution() {
        this.log('Testing DNS resolution...');
        
        const dns = require('dns').promises;
        const hostnames = ['localhost', '127.0.0.1'];
        
        for (const hostname of hostnames) {
            try {
                const result = await dns.resolve(hostname);
                this.log(`DNS resolution for ${hostname}: ${JSON.stringify(result)}`, 'success');
            } catch (error) {
                this.log(`DNS resolution failed for ${hostname}: ${error.message}`, 'error');
            }
        }
    }

    async runDiagnostics() {
        this.log('Starting VSI Agent Connectivity Diagnostics...');
        this.log('='.repeat(60));
        
        // Check environment
        await this.checkEnvironmentVariables();
        this.log('-'.repeat(40));
        
        // Check network interfaces
        await this.checkNetworkInterfaces();
        this.log('-'.repeat(40));
        
        // Test DNS resolution
        await this.testDnsResolution();
        this.log('-'.repeat(40));
        
        // Test connections to various URLs
        for (const baseUrl of this.baseUrls) {
            await this.testConnection(baseUrl);
            this.log('-'.repeat(40));
        }
        
        // Test AgentApiClient
        await this.testAgentApiClient();
        this.log('-'.repeat(40));
        
        this.log('Diagnostics completed!', 'success');
        this.printRecommendations();
    }

    printRecommendations() {
        this.log('Recommendations for fixing connectivity issues:');
        this.log('1. Ensure the VSI server is running on the correct port');
        this.log('2. Check firewall rules allow connections to port 3000');
        this.log('3. Set API_BASE_URL environment variable if needed');
        this.log('4. In Docker, ensure proper network configuration');
        this.log('5. Check if server is bound to 0.0.0.0, not just 127.0.0.1');
        this.log('6. Verify JWT_SECRET is set for authentication');
    }
}

// Run diagnostics if script is called directly
if (require.main === module) {
    const diagnostic = new ConnectivityDiagnostic();
    diagnostic.runDiagnostics().catch(error => {
        console.error('Diagnostic failed:', error);
        process.exit(1);
    });
}

module.exports = ConnectivityDiagnostic;
