#!/usr/bin/env node

/**
 * Integration Test for External Content Frontend Features
 * Tests the complete integration of external content into the main VSI frontend
 */

const { chromium } = require('playwright');
const path = require('path');

async function testFrontendIntegration() {
    console.log('🧪 Testing External Content Frontend Integration...\n');
    
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        // Navigate to the main application
        console.log('📍 Navigating to VSI application...');
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        
        // Check if the agents module is loaded
        console.log('🔍 Checking if agents module is available...');
        const agentsNavExists = await page.locator('a[onclick*="agents"]').count() > 0;
        if (agentsNavExists) {
            console.log('✅ Agents navigation found');
        } else {
            console.log('❌ Agents navigation not found');
            return;
        }
        
        // Click on agents navigation
        console.log('🎯 Clicking on Agents navigation...');
        await page.click('a[onclick*="agents"]');
        await page.waitForTimeout(1000);
        
        // Look for the start research session button
        console.log('🔍 Looking for Start Research Session button...');
        const startSessionBtn = page.locator('button[onclick*="showCreateSessionModal"]');
        const btnExists = await startSessionBtn.count() > 0;
        
        if (btnExists) {
            console.log('✅ Start Research Session button found');
            
            // Click the button to open modal
            console.log('🎯 Opening Create Session Modal...');
            await startSessionBtn.click();
            await page.waitForTimeout(1000);
            
            // Check if external sources section exists
            console.log('🔍 Checking for External Content Sources section...');
            const externalSourcesSection = page.locator('.card-header:has-text("🌐 External Content Sources")');
            const sectionExists = await externalSourcesSection.count() > 0;
            
            if (sectionExists) {
                console.log('✅ External Content Sources section found');
                
                // Test enabling external sources
                console.log('🎯 Testing external sources toggle...');
                const enableCheckbox = page.locator('#enableExternalSources');
                await enableCheckbox.check();
                await page.waitForTimeout(500);
                
                // Check if configuration becomes visible
                const configSection = page.locator('#externalSourcesConfig');
                const isVisible = await configSection.isVisible();
                
                if (isVisible) {
                    console.log('✅ External sources configuration visible when enabled');
                    
                    // Test configuration fields
                    console.log('🔍 Testing configuration fields...');
                    
                    const webSearchCheck = page.locator('#enableWebSearch');
                    const webBrowsingCheck = page.locator('#enableWebBrowsing');
                    const maxSourcesInput = page.locator('#maxExternalSources');
                    const providerSelect = page.locator('#searchProvider');
                    const urlsTextarea = page.locator('#externalUrls');
                    
                    const allFieldsExist = await Promise.all([
                        webSearchCheck.count(),
                        webBrowsingCheck.count(),
                        maxSourcesInput.count(),
                        providerSelect.count(),
                        urlsTextarea.count()
                    ]).then(counts => counts.every(count => count > 0));
                    
                    if (allFieldsExist) {
                        console.log('✅ All configuration fields found');
                        
                        // Test setting values
                        console.log('🎯 Testing configuration values...');
                        await webSearchCheck.check();
                        await webBrowsingCheck.check();
                        await maxSourcesInput.fill('8');
                        await providerSelect.selectOption('google');
                        await urlsTextarea.fill('https://example.com\\nhttps://test.com');
                        
                        console.log('✅ Configuration values set successfully');
                        
                        // Test form submission preparation
                        console.log('🔍 Testing form data collection...');
                        await page.fill('input[name="name"]', 'Test Research Session');
                        await page.fill('textarea[name="query"]', 'Test research query with external sources');
                        
                        console.log('✅ Form filled successfully');
                        console.log('✅ Frontend integration test completed successfully!');
                        
                    } else {
                        console.log('❌ Missing configuration fields');
                    }
                } else {
                    console.log('❌ External sources configuration not visible when enabled');
                }
            } else {
                console.log('❌ External Content Sources section not found');
            }
        } else {
            console.log('❌ Start Research Session button not found');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await browser.close();
    }
}

// Test API endpoints
async function testAPIEndpoints() {
    console.log('\\n🌐 Testing External Content API Endpoints...');
    
    try {
        // Test config endpoint
        const configResponse = await fetch('http://localhost:3000/api/external/config');
        if (configResponse.ok) {
            const config = await configResponse.json();
            console.log('✅ External content config endpoint working');
            console.log('📋 Config:', JSON.stringify(config, null, 2));
        } else {
            console.log('❌ External content config endpoint failed');
        }
    } catch (error) {
        console.log('❌ Error testing config endpoint:', error.message);
    }
}

async function main() {
    console.log('🚀 Starting External Content Integration Tests\\n');
    
    // Check if server is running
    try {
        const response = await fetch('http://localhost:3000/api/health');
        if (response.ok) {
            console.log('✅ VSI server is running\\n');
        } else {
            console.log('❌ VSI server not responding properly');
            return;
        }
    } catch (error) {
        console.log('❌ VSI server not accessible:', error.message);
        console.log('💡 Please start the server with: npm start');
        return;
    }
    
    await testAPIEndpoints();
    
    // Check if Playwright is available
    try {
        await testFrontendIntegration();
    } catch (error) {
        if (error.message.includes('playwright')) {
            console.log('⚠️  Playwright not available for browser testing');
            console.log('💡 Install with: npm install -D playwright');
            console.log('🔧 Manual test: Open http://localhost:3000 and test the Agents section');
        } else {
            throw error;
        }
    }
    
    console.log('\\n🎉 Integration test completed!');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testFrontendIntegration, testAPIEndpoints };
