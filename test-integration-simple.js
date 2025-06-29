#!/usr/bin/env node

/**
 * Simple Integration Test for External Content Features
 * Tests API endpoints and provides manual testing guidance
 */

const fetch = require('node-fetch');

async function testAPIEndpoints() {
    console.log('🌐 Testing External Content API Endpoints...\n');
    
    try {
        // Test config endpoint
        console.log('📋 Testing config endpoint...');
        const configResponse = await fetch('http://localhost:3000/api/external/config');
        if (configResponse.ok) {
            const config = await configResponse.json();
            console.log('✅ External content config endpoint working');
            console.log('📋 Config:', JSON.stringify(config, null, 2));
        } else {
            console.log('❌ External content config endpoint failed:', configResponse.status);
        }
    } catch (error) {
        console.log('❌ Error testing config endpoint:', error.message);
    }

    try {
        // Test search endpoint with sample data
        console.log('\n🔍 Testing search endpoint...');
        const searchResponse = await fetch('http://localhost:3000/api/external/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: 'artificial intelligence trends 2024', 
                provider: 'duckduckgo',
                maxResults: 3
            })
        });
        
        if (searchResponse.ok) {
            const searchResult = await searchResponse.json();
            console.log('✅ External content search endpoint working');
            console.log('📋 Sample results:', JSON.stringify(searchResult, null, 2));
        } else {
            console.log('❌ External content search endpoint failed:', searchResponse.status);
            const errorText = await searchResponse.text();
            console.log('Error details:', errorText);
        }
    } catch (error) {
        console.log('❌ Error testing search endpoint:', error.message);
    }

    try {
        // Test browse endpoint with sample data  
        console.log('\n🌐 Testing browse endpoint...');
        const browseResponse = await fetch('http://localhost:3000/api/external/browse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: 'https://httpbin.org/json',
                extractContent: true
            })
        });
        
        if (browseResponse.ok) {
            const browseResult = await browseResponse.json();
            console.log('✅ External content browse endpoint working');
            console.log('📋 Sample result:', JSON.stringify(browseResult, null, 2));
        } else {
            console.log('❌ External content browse endpoint failed:', browseResponse.status);
        }
    } catch (error) {
        console.log('❌ Error testing browse endpoint:', error.message);
    }
}

function printManualTestInstructions() {
    console.log('\n📝 Manual Frontend Integration Test Instructions:\n');
    console.log('1. Open http://localhost:3000 in your browser');
    console.log('2. Click on "Agents" in the left navigation');
    console.log('3. Click the "Start Research Session" button');
    console.log('4. Look for the "🌐 External Content Sources" card section');
    console.log('5. Check the "Enable external web sources" checkbox');
    console.log('6. Verify that the configuration options appear:');
    console.log('   - Web Search checkbox');
    console.log('   - Web Browsing checkbox');
    console.log('   - Max External Sources input');
    console.log('   - Search Provider dropdown');
    console.log('   - Additional URLs textarea');
    console.log('7. Fill in the form fields:');
    console.log('   - Session Name: "Test External Sources"');
    console.log('   - Research Query: "Latest AI developments 2024"');
    console.log('   - Enable external sources and set preferences');
    console.log('8. Click "Start Research" to test session creation');
    console.log('9. Check browser console for any JavaScript errors');
    
    console.log('\n✅ Expected Configuration Structure:');
    const expectedConfig = {
        "researchTopic": "Latest AI developments 2024",
        "preferences": {
            "name": "Test External Sources",
            "description": "Testing external sources integration",
            "externalContent": {
                "enableExternalSources": true,
                "enableWebSearch": true,
                "enableWebBrowsing": true,
                "maxExternalSources": 5,
                "searchProvider": "duckduckgo",
                "externalUrls": ["https://example.com"]
            }
        }
    };
    console.log(JSON.stringify(expectedConfig, null, 2));
}

async function main() {
    console.log('🚀 External Content Integration Test\n');
    
    // Check if server is running
    try {
        const response = await fetch('http://localhost:3000/api/health');
        if (response.ok) {
            console.log('✅ VSI server is running\n');
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
    printManualTestInstructions();
    
    console.log('\n🎉 Integration test completed!');
    console.log('💡 Check the manual test instructions above to verify frontend integration');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testAPIEndpoints };
