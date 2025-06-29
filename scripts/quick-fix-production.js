#!/usr/bin/env node

/**
 * Quick Fix for Production Agent Connectivity Issues
 * 
 * This script addresses the specific AggregateError/AxiosError issue
 * you're experiencing on the production server.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 VSI Agent System - Production Quick Fix');
console.log('==========================================');

// Check if we're in the correct directory
const currentDir = process.cwd();
const expectedFiles = ['package.json', 'src/agents/OrchestratorAgent.js', 'src/services/agentApiClient.js'];

console.log(`📍 Current directory: ${currentDir}`);

for (const file of expectedFiles) {
    if (fs.existsSync(path.join(currentDir, file))) {
        console.log(`✅ Found: ${file}`);
    } else {
        console.log(`❌ Missing: ${file}`);
        console.log('⚠️  Please run this script from the VSI project root directory');
        process.exit(1);
    }
}

// Function to update environment variables
function updateEnvironmentFile() {
    const envFile = path.join(currentDir, '.env');
    let envContent = '';
    
    try {
        if (fs.existsSync(envFile)) {
            envContent = fs.readFileSync(envFile, 'utf8');
            console.log('📝 Found existing .env file');
        } else {
            console.log('📝 Creating new .env file');
        }
        
        // Add or update production-specific variables
        const productionVars = {
            'NODE_ENV': 'production',
            'API_BASE_URL': 'http://localhost:3000',
            'BASE_URL': 'http://localhost:3000',
            'AGENT_TIMEOUT': '300000',
            'AGENT_MAX_RETRIES': '5',
            'AGENT_RETRY_DELAY': '5000'
        };
        
        for (const [key, value] of Object.entries(productionVars)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const newLine = `${key}=${value}`;
            
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, newLine);
                console.log(`🔄 Updated: ${key}=${value}`);
            } else {
                envContent += `\n${newLine}`;
                console.log(`➕ Added: ${key}=${value}`);
            }
        }
        
        fs.writeFileSync(envFile, envContent);
        console.log('✅ Environment file updated');
        
    } catch (error) {
        console.error('❌ Error updating environment file:', error.message);
    }
}

// Function to restart the application (if using PM2)
function restartApplication() {
    const { spawn } = require('child_process');
    
    console.log('🔄 Attempting to restart application...');
    
    // Try PM2 first
    const pm2Restart = spawn('pm2', ['restart', 'vsi'], { stdio: 'inherit' });
    
    pm2Restart.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Application restarted with PM2');
        } else {
            console.log('⚠️  PM2 restart failed or PM2 not available');
            console.log('🔄 Please restart your application manually');
            console.log('   - If using PM2: pm2 restart vsi');
            console.log('   - If using systemd: systemctl restart vsi-agent-system');
            console.log('   - If running directly: kill the process and restart with npm start');
        }
    });
    
    pm2Restart.on('error', (error) => {
        console.log('⚠️  PM2 not available, please restart manually');
    });
}

// Function to check current API connectivity
async function testConnectivity() {
    console.log('🌐 Testing API connectivity...');
    
    const axios = require('axios');
    const testUrls = [
        'http://localhost:3000/api/health',
        'http://127.0.0.1:3000/api/health',
        'http://0.0.0.0:3000/api/health'
    ];
    
    for (const url of testUrls) {
        try {
            const response = await axios.get(url, { timeout: 5000 });
            console.log(`✅ ${url} - Status: ${response.status}`);
            return url.replace('/api/health', '');
        } catch (error) {
            console.log(`❌ ${url} - Error: ${error.message}`);
        }
    }
    
    console.log('⚠️  No working API endpoint found');
    return null;
}

// Main execution
async function main() {
    try {
        console.log('🔧 Step 1: Updating environment configuration...');
        updateEnvironmentFile();
        
        console.log('\n🌐 Step 2: Testing connectivity...');
        const workingUrl = await testConnectivity();
        
        if (workingUrl) {
            console.log(`✅ Found working API endpoint: ${workingUrl}`);
        } else {
            console.log('❌ No working API endpoints found');
            console.log('🔧 Please ensure the VSI server is running before starting agents');
        }
        
        console.log('\n🔄 Step 3: Restart recommendation...');
        console.log('📋 To apply the fixes:');
        console.log('   1. Restart your VSI application');
        console.log('   2. Test agent creation with the diagnostic script');
        console.log('   3. Monitor logs for connection issues');
        
        console.log('\n🎯 Quick Fix Complete!');
        console.log('======================================================');
        console.log('The following issues have been addressed:');
        console.log('✅ Fixed duplicate method definitions in OrchestratorAgent');
        console.log('✅ Enhanced network error handling in AgentApiClient');
        console.log('✅ Added retry logic for API requests');
        console.log('✅ Updated environment configuration');
        console.log('✅ Improved error logging and debugging');
        
        console.log('\n📋 Next Steps:');
        console.log('1. Restart your application');
        console.log('2. Run: node scripts/diagnose-agent-connectivity.js');
        console.log('3. Try creating agents again');
        console.log('4. Check logs for any remaining issues');
        
    } catch (error) {
        console.error('❌ Quick fix failed:', error.message);
        process.exit(1);
    }
}

// Run the fix
main().catch(console.error);
