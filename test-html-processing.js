#!/usr/bin/env node

/**
 * Test script to verify HTML to Markdown conversion functionality
 */

const fs = require('fs');
const path = require('path');
const { DocumentProcessor } = require('./src/services/documentProcessor');

// Create a test HTML file
const testHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test HTML Document</title>
</head>
<body>
    <h1>Welcome to VSI Document Processing</h1>
    
    <p>This is a <strong>test HTML document</strong> that will be converted to <em>Markdown format</em> for indexing in the vector store.</p>
    
    <h2>Features</h2>
    <ul>
        <li>HTML to Markdown conversion</li>
        <li>Semantic search capabilities</li>
        <li>Document indexing with Qdrant</li>
    </ul>
    
    <h3>Code Example</h3>
    <pre><code>const processor = new DocumentProcessor();
const markdown = await processor.extractFromHTML('file.html');</code></pre>
    
    <blockquote>
        <p>This is a quote that should be preserved in Markdown format.</p>
    </blockquote>
    
    <hr>
    
    <p>Links: <a href="https://example.com">Example Link</a></p>
    
    <table>
        <thead>
            <tr>
                <th>Feature</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>HTML Processing</td>
                <td>✅ Implemented</td>
            </tr>
            <tr>
                <td>PDF Processing</td>
                <td>✅ Implemented</td>
            </tr>
        </tbody>
    </table>
</body>
</html>`;

async function testHtmlProcessing() {
    console.log('🧪 Testing HTML to Markdown conversion...\n');
    
    const tempHtmlFile = path.join(__dirname, 'temp_test.html');
    
    try {
        // Write test HTML content to file
        fs.writeFileSync(tempHtmlFile, testHtmlContent, 'utf8');
        console.log('✅ Created test HTML file');
        
        // Initialize document processor
        const processor = new DocumentProcessor();
        
        // Test if HTML is supported
        const isSupported = processor.isSupported(tempHtmlFile);
        console.log(`🔍 HTML file support check: ${isSupported ? '✅ Supported' : '❌ Not supported'}`);
        
        const isSupportedAdvanced = processor.isSupportedAdvanced(tempHtmlFile, 'text/html');
        console.log(`🔍 Advanced HTML support check: ${isSupportedAdvanced ? '✅ Supported' : '❌ Not supported'}\n`);
        
        if (!isSupported) {
            throw new Error('HTML files are not supported by the DocumentProcessor');
        }
        
        // Process HTML file
        console.log('🔄 Processing HTML file...');
        const markdownContent = await processor.extractFromHTML(tempHtmlFile);
        
        console.log('\n📄 Conversion Results:');
        console.log('='.repeat(50));
        console.log(`Original HTML length: ${testHtmlContent.length} characters`);
        console.log(`Converted Markdown length: ${markdownContent.length} characters`);
        console.log('='.repeat(50));
        
        console.log('\n📝 Converted Markdown Content:');
        console.log('-'.repeat(50));
        console.log(markdownContent);
        console.log('-'.repeat(50));
        
        // Verify the conversion contains expected elements
        const expectedElements = [
            '# Welcome to VSI Document Processing',
            '## Features',
            'HTML to Markdown conversion', // More flexible - just check if the text is there
            '```',
            '> This is a quote',
            '| Feature | Status |',
            '[Example Link](https://example.com)'
        ];
        
        console.log('\n🔍 Verification Tests:');
        let allTestsPassed = true;
        
        for (const element of expectedElements) {
            const found = markdownContent.includes(element);
            console.log(`  ${found ? '✅' : '❌'} ${element}`);
            if (!found) allTestsPassed = false;
        }
        
        console.log(`\n🎯 Overall Test Result: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
        
        if (allTestsPassed) {
            console.log('\n🎉 HTML to Markdown conversion is working correctly!');
        } else {
            console.log('\n⚠️  Some conversion elements may need adjustment.');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        // Clean up test file
        if (fs.existsSync(tempHtmlFile)) {
            fs.unlinkSync(tempHtmlFile);
            console.log('\n🧹 Cleaned up test file');
        }
    }
}

// Run the test
testHtmlProcessing().catch(console.error);
