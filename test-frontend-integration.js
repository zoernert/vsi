/**
 * Test External Content Integration in Main Frontend
 * Tests the external source configuration in the agents modal
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Testing external content integration...');
    
    // Function to test external sources configuration
    function testExternalSourcesConfig() {
        // Navigate to agents view
        if (window.app && window.app.agents) {
            console.log('✓ App and agents module available');
            
            // Test showing the create session modal
            try {
                window.app.agents.showCreateSessionModal();
                console.log('✓ Create session modal opened');
                
                // Test external sources checkbox
                setTimeout(() => {
                    const enableExternalSources = document.getElementById('enableExternalSources');
                    const externalSourcesConfig = document.getElementById('externalSourcesConfig');
                    
                    if (enableExternalSources && externalSourcesConfig) {
                        console.log('✓ External sources elements found');
                        
                        // Test toggling the checkbox
                        enableExternalSources.checked = true;
                        enableExternalSources.dispatchEvent(new Event('change'));
                        
                        setTimeout(() => {
                            if (externalSourcesConfig.style.display !== 'none') {
                                console.log('✓ External sources config shows when enabled');
                                
                                // Test configuration fields
                                const webSearchCheck = document.getElementById('enableWebSearch');
                                const webBrowsingCheck = document.getElementById('enableWebBrowsing');
                                const maxSources = document.getElementById('maxExternalSources');
                                const searchProvider = document.getElementById('searchProvider');
                                const externalUrls = document.getElementById('externalUrls');
                                
                                if (webSearchCheck && webBrowsingCheck && maxSources && searchProvider && externalUrls) {
                                    console.log('✓ All external sources configuration fields found');
                                    
                                    // Test setting values
                                    webSearchCheck.checked = true;
                                    webBrowsingCheck.checked = true;
                                    maxSources.value = '8';
                                    searchProvider.value = 'google';
                                    externalUrls.value = 'https://example.com\nhttps://test.com';
                                    
                                    console.log('✓ External sources configuration values set');
                                    console.log('✅ External content integration test completed successfully');
                                } else {
                                    console.error('✗ Missing external sources configuration fields');
                                }
                            } else {
                                console.error('✗ External sources config not visible when enabled');
                            }
                        }, 100);
                    } else {
                        console.error('✗ External sources elements not found');
                    }
                }, 500);
                
            } catch (error) {
                console.error('✗ Error opening create session modal:', error);
            }
        } else {
            console.error('✗ App or agents module not available');
        }
    }
    
    // Wait for the app to be fully loaded
    setTimeout(testExternalSourcesConfig, 1000);
});

// Export test function for manual testing
window.testExternalSourcesConfig = function() {
    console.log('Running manual external sources config test...');
    testExternalSourcesConfig();
};
