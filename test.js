const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

class APITester {
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.token = null;
        this.testCollection = null;
        this.documentId = null;
        this.openApiSpec = null;
        this.startTime = Date.now();
        this.backendProcess = null;
        this.backendOutput = [];
        this.backendStarted = false;
        
        console.log(`🚀 Starting API Test Suite`);
        console.log(`📡 Backend URL: ${this.baseUrl}`);
        console.log(`⏰ Test started at: ${new Date().toISOString()}\n`);
    }

    getBaseUrl() {
        // Try multiple environment variable patterns
        const candidates = [
            process.env.BASE_URL,
            process.env.API_BASE_URL,
            process.env.SERVER_URL,
            `http://localhost:${process.env.PORT || 3000}`
        ];

        for (const url of candidates) {
            if (url) {
                return url.replace(/\/$/, ''); // Remove trailing slash
            }
        }

        console.warn('⚠️ No base URL found in environment variables, using default');
        return 'http://localhost:3000';
    }

    async checkBackendHealth() {
        console.log('🏥 Checking backend health...');
        try {
            const response = await axios.get(`${this.baseUrl}/api/health`, { 
                timeout: 5000 
            });
            
            if (response.status === 200) {
                console.log('✅ Backend is already running and healthy');
                return true;
            }
        } catch (error) {
            console.log('❌ Backend is not responding');
            return false;
        }
        return false;
    }

    async startBackend() {
        console.log('🔄 Starting backend with npm start...');
        
        return new Promise((resolve, reject) => {
            this.backendProcess = spawn('npm', ['start'], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });

            let startupTimeout;
            let healthCheckInterval;
            let outputBuffer = '';

            // Capture all output
            this.backendProcess.stdout.on('data', (data) => {
                const output = data.toString();
                outputBuffer += output;
                this.backendOutput.push(`[STDOUT] ${output}`);
                
                // Look for startup indicators
                if (output.includes('Server running on port') || 
                    output.includes('🚀 Server running') ||
                    output.includes('server started')) {
                    console.log('📡 Backend startup detected...');
                }
            });

            this.backendProcess.stderr.on('data', (data) => {
                const output = data.toString();
                outputBuffer += output;
                this.backendOutput.push(`[STDERR] ${output}`);
                
                // Log errors immediately
                if (output.includes('Error') || output.includes('ERROR')) {
                    console.log(`⚠️ Backend error: ${output.trim()}`);
                }
            });

            this.backendProcess.on('error', (error) => {
                console.error('❌ Failed to start backend process:', error.message);
                clearTimeout(startupTimeout);
                clearInterval(healthCheckInterval);
                reject(new Error(`Backend process failed to start: ${error.message}`));
            });

            this.backendProcess.on('exit', (code, signal) => {
                if (!this.backendStarted) {
                    console.error(`❌ Backend process exited early with code ${code}, signal ${signal}`);
                    clearTimeout(startupTimeout);
                    clearInterval(healthCheckInterval);
                    reject(new Error(`Backend exited early with code ${code}`));
                }
            });

            // Wait for backend to be ready
            console.log('⏳ Waiting for backend to start (max 30 seconds)...');
            
            let attempts = 0;
            const maxAttempts = 60; // 30 seconds with 0.5s intervals
            
            healthCheckInterval = setInterval(async () => {
                attempts++;
                
                try {
                    const isHealthy = await this.checkBackendHealth();
                    if (isHealthy) {
                        console.log('✅ Backend is ready!');
                        this.backendStarted = true;
                        clearTimeout(startupTimeout);
                        clearInterval(healthCheckInterval);
                        resolve();
                        return;
                    }
                } catch (error) {
                    // Continue trying
                }

                if (attempts >= maxAttempts) {
                    console.error('❌ Backend startup timeout after 30 seconds');
                    clearInterval(healthCheckInterval);
                    reject(new Error('Backend startup timeout'));
                }
            }, 500);

            // Overall timeout
            startupTimeout = setTimeout(() => {
                console.error('❌ Backend startup timeout');
                clearInterval(healthCheckInterval);
                reject(new Error('Backend startup timeout after 30 seconds'));
            }, 30000);
        });
    }

    async ensureBackendRunning() {
        const isRunning = await this.checkBackendHealth();
        
        if (!isRunning) {
            await this.startBackend();
        }
        
        return true;
    }

    async stopBackend() {
        if (this.backendProcess && !this.backendProcess.killed) {
            console.log('🛑 Stopping backend process...');
            
            return new Promise((resolve) => {
                this.backendProcess.on('exit', () => {
                    console.log('✅ Backend process stopped');
                    resolve();
                });

                // Try graceful shutdown first
                this.backendProcess.kill('SIGTERM');
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!this.backendProcess.killed) {
                        console.log('🔨 Force killing backend process...');
                        this.backendProcess.kill('SIGKILL');
                        resolve();
                    }
                }, 5000);
            });
        }
    }

    printBackendOutput() {
        if (this.backendOutput.length > 0) {
            console.log('\n' + '='.repeat(60));
            console.log('📋 BACKEND OUTPUT LOG');
            console.log('='.repeat(60));
            
            // Show last 50 lines of output
            const recentOutput = this.backendOutput.slice(-50);
            recentOutput.forEach(line => {
                console.log(line.trim());
            });
            
            if (this.backendOutput.length > 50) {
                console.log(`\n... (showing last 50 of ${this.backendOutput.length} total lines)`);
            }
            
            console.log('='.repeat(60));
        }
    }

    async expectSuccess(operation, expectedStatus = 200) {
        try {
            const response = await operation();
            
            if (response.status !== expectedStatus) {
                throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
            }
            
            return response;
        } catch (error) {
            if (error.response) {
                console.error(`❌ ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
            } else {
                console.error(`❌ Network/Request Error: ${error.message}`);
            }
            throw error;
        }
    }

    async expectError(operation, expectedStatus) {
        try {
            const response = await operation();
            throw new Error(`Expected error with status ${expectedStatus}, but got success with status ${response.status}`);
        } catch (error) {
            if (error.response && error.response.status === expectedStatus) {
                return error.response;
            }
            throw error;
        }
    }

    logStep(step, description) {
        console.log(`\n📋 Step ${step}: ${description}`);
        console.log('─'.repeat(50));
    }

    logSuccess(message) {
        console.log(`✅ ${message}`);
    }

    logMetric(label, value) {
        console.log(`📊 ${label}: ${value}`);
    }

    // Step 1: Download and validate OpenAPI spec
    async downloadOpenApiSpec() {
        this.logStep(1, 'Downloading OpenAPI Specification');
        
        const response = await this.expectSuccess(() => 
            axios.get(`${this.baseUrl}/openapi.json`)
        );
        
        this.openApiSpec = response.data;
        
        // Validate OpenAPI spec structure
        if (!this.openApiSpec.openapi && !this.openApiSpec.swagger) {
            throw new Error('Invalid OpenAPI specification: missing version field');
        }
        
        if (!this.openApiSpec.paths) {
            throw new Error('Invalid OpenAPI specification: missing paths');
        }
        
        const endpointCount = Object.keys(this.openApiSpec.paths).length;
        this.logSuccess(`OpenAPI spec downloaded successfully`);
        this.logMetric('API Version', this.openApiSpec.info?.version || 'unknown');
        this.logMetric('Total Endpoints', endpointCount);
        this.logMetric('API Title', this.openApiSpec.info?.title || 'unknown');
        
        return this.openApiSpec;
    }

    // Step 2: Login with demo/demo credentials
    async login() {
        this.logStep(2, 'Authenticating with demo/demo credentials');
        
        const loginData = {
            username: 'demo',
            password: 'demo'
        };
        
        console.log(`🔑 Attempting login with username: ${loginData.username}`);
        
        const response = await this.expectSuccess(() => 
            axios.post(`${this.baseUrl}/api/auth/login`, loginData)
        );
        
        const data = response.data;
        
        if (!data.success) {
            throw new Error(`Login failed: ${data.message || 'Unknown error'}`);
        }
        
        if (!data.token) {
            throw new Error('Login response missing token');
        }
        
        this.token = data.token;
        
        this.logSuccess('Authentication successful');
        this.logMetric('User ID', data.user?.id || 'unknown');
        this.logMetric('Username', data.user?.username || 'unknown');
        this.logMetric('Admin Status', data.user?.isAdmin ? 'Yes' : 'No');
        this.logMetric('Token Preview', `${this.token.substring(0, 20)}...`);
        
        return data;
    }

    // Step 3: Get current collections
    async getCollections() {
        this.logStep(3, 'Retrieving user collections');
        
        const response = await this.expectSuccess(() => 
            axios.get(`${this.baseUrl}/api/collections`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            })
        );
        
        const collections = Array.isArray(response.data) ? response.data : response.data.collections || [];
        
        this.logSuccess('Collections retrieved successfully');
        this.logMetric('Collection Count', collections.length);
        
        if (collections.length > 0) {
            console.log('📁 Existing Collections:');
            collections.forEach((col, index) => {
                console.log(`   ${index + 1}. ${col.name} (ID: ${col.id}) - ${col.document_count || 0} documents`);
            });
        } else {
            console.log('📁 No existing collections found');
        }
        
        return collections;
    }

    // Step 4: Create test collection
    async createTestCollection() {
        this.logStep(4, 'Creating test collection');
        
        const timestamp = Date.now();
        const collectionName = `test_${timestamp}`;
        
        const collectionData = {
            name: collectionName,
            description: `Test collection created at ${new Date().toISOString()}`
        };
        
        console.log(`📁 Creating collection: ${collectionName}`);
        
        const response = await this.expectSuccess(() => 
            axios.post(`${this.baseUrl}/api/collections`, collectionData, {
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            }), 201
        );
        
        const data = response.data;
        
        if (!data.success && !data.data && !data.id) {
            throw new Error('Collection creation response missing required data');
        }
        
        // Handle different response formats
        this.testCollection = data.data || data || { name: collectionName };
        
        this.logSuccess('Test collection created successfully');
        this.logMetric('Collection Name', this.testCollection.name || collectionName);
        this.logMetric('Collection ID', this.testCollection.id || 'unknown');
        this.logMetric('Collection Description', this.testCollection.description || 'none');
        
        return this.testCollection;
    }

    // Step 5: Verify collection exists and is empty
    async verifyCollectionExists() {
        this.logStep(5, 'Verifying collection exists and is empty');
        
        const collections = await this.getCollections();
        const testCollectionName = this.testCollection.name;
        
        const foundCollection = collections.find(col => 
            col.name === testCollectionName || col.id === this.testCollection.id
        );
        
        if (!foundCollection) {
            throw new Error(`Test collection '${testCollectionName}' not found in collections list`);
        }
        
        const documentCount = foundCollection.document_count || foundCollection.documentsCount || 0;
        
        if (documentCount !== 0) {
            throw new Error(`Expected collection to be empty, but found ${documentCount} documents`);
        }
        
        this.logSuccess('Collection exists and is empty as expected');
        this.logMetric('Collection Found', 'Yes');
        this.logMetric('Document Count', documentCount);
        
        // Update our test collection with the found data
        this.testCollection = foundCollection;
        
        return foundCollection;
    }

    // Step 6: Upload test PDF
    async uploadTestPdf() {
        this.logStep(6, 'Uploading test PDF file');
        
        const testPdfPath = path.join(__dirname, 'test.pdf');
        
        // Check if test.pdf exists
        if (!fs.existsSync(testPdfPath)) {
            console.log('📄 test.pdf not found, creating a sample PDF file...');
            
            // Create a simple test file with some content
            const testContent = `Test PDF Document
            
This is a test document created for API testing purposes.

Key Topics:
1. API Testing - This document demonstrates file upload functionality
2. Vector Storage - The content will be processed and stored as embeddings
3. Document Processing - This tests the backend's ability to handle PDF files
4. Search Capabilities - The uploaded content should be searchable

Test Information:
- Created: ${new Date().toISOString()}
- Purpose: Backend API validation
- File Type: Text file (simulated PDF)

This document contains enough content to be chunked and processed by the embedding service.
The content should be retrievable through search and AI chat functionality.`;
            
            fs.writeFileSync(testPdfPath, testContent, 'utf8');
            console.log('✅ Created test.pdf with sample content');
        }
        
        const stats = fs.statSync(testPdfPath);
        console.log(`📄 File: ${testPdfPath}`);
        this.logMetric('File Size', `${(stats.size / 1024).toFixed(2)} KB`);
        
        const form = new FormData();
        form.append('file', fs.createReadStream(testPdfPath), {
            filename: 'test.pdf',
            contentType: 'application/pdf'
        });
        
        const collectionId = this.testCollection.id;
        console.log(`📤 Uploading to collection ID: ${collectionId}`);
        
        // Use server-sent events endpoint for upload progress
        const uploadUrl = `${this.baseUrl}/api/upload/${collectionId}`;
        
        const response = await this.expectSuccess(() => 
            axios.post(uploadUrl, form, {
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    ...form.getHeaders()
                },
                timeout: 60000 // 60 second timeout
            })
        );
        
        // Handle SSE response or regular JSON response
        let uploadResult;
        if (typeof response.data === 'string') {
            // Parse SSE data if needed
            const lines = response.data.split('\n');
            const dataLines = lines.filter(line => line.startsWith('data: '));
            if (dataLines.length > 0) {
                const lastDataLine = dataLines[dataLines.length - 1];
                uploadResult = JSON.parse(lastDataLine.substring(6));
            }
        } else {
            uploadResult = response.data;
        }
        
        this.logSuccess('PDF upload completed');
        this.logMetric('Upload Status', uploadResult?.success || uploadResult?.type || 'success');
        
        if (uploadResult?.data) {
            this.logMetric('Chunks Stored', uploadResult.data.chunksStored || 'unknown');
            this.logMetric('Total Chunks', uploadResult.data.totalChunks || 'unknown');
            this.logMetric('Processing Time', `${uploadResult.data.processingTimeMs || 0}ms`);
            this.documentId = uploadResult.data.document?.id;
        }
        
        return uploadResult;
    }

    // Step 7: Verify document upload and chunks
    async verifyDocumentUpload() {
        this.logStep(7, 'Verifying document upload and chunks');
        
        // Get updated collection info
        const collections = await this.getCollections();
        const updatedCollection = collections.find(col => 
            col.name === this.testCollection.name || col.id === this.testCollection.id
        );
        
        if (!updatedCollection) {
            throw new Error('Test collection not found after upload');
        }
        
        const documentCount = updatedCollection.document_count || updatedCollection.documentsCount || 0;
        
        if (documentCount === 0) {
            throw new Error('Expected at least 1 document after upload, but collection is still empty');
        }
        
        this.logSuccess('Document upload verified');
        this.logMetric('Documents in Collection', documentCount);
        
        // Get detailed collection info if available
        try {
            const detailResponse = await this.expectSuccess(() => 
                axios.get(`${this.baseUrl}/api/collections/${this.testCollection.id}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
            );
            
            const collectionDetails = detailResponse.data;
            this.logMetric('Collection Size', collectionDetails.stats?.totalContentSize || 'unknown');
            this.logMetric('Average Document Size', collectionDetails.stats?.avgContentSize || 'unknown');
        } catch (error) {
            console.log('ℹ️ Could not fetch detailed collection stats');
        }
        
        // Try to get documents list
        try {
            const docsResponse = await this.expectSuccess(() => 
                axios.get(`${this.baseUrl}/api/collections/${this.testCollection.id}/documents`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
            );
            
            const documents = docsResponse.data.data || docsResponse.data;
            if (Array.isArray(documents) && documents.length > 0) {
                this.documentId = documents[0].id;
                this.logMetric('First Document ID', this.documentId);
                this.logMetric('Document Filename', documents[0].filename || 'unknown');
            }
        } catch (error) {
            console.log('ℹ️ Could not fetch documents list');
        }
        
        return updatedCollection;
    }

    // Step 8: Test AI chat functionality
    async testAiChat() {
        this.logStep(8, 'Testing AI chat functionality');
        
        const question = 'Provide a summary of the key topics';
        const chatData = {
            question: question,
            maxResults: 5
        };
        
        console.log(`🤖 Asking: "${question}"`);
        
        const response = await this.expectSuccess(() => 
            axios.post(`${this.baseUrl}/api/collections/${this.testCollection.id}/ask`, chatData, {
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout for AI processing
            })
        );
        
        const chatResult = response.data;
        
        if (!chatResult.success && !chatResult.data && !chatResult.answer) {
            throw new Error('AI chat response missing required data');
        }
        
        const aiData = chatResult.data || chatResult;
        const answer = aiData.answer || aiData.response || 'No answer received';
        const sources = aiData.sources || [];
        
        this.logSuccess('AI chat completed successfully');
        this.logMetric('Answer Length', `${answer.length} characters`);
        this.logMetric('Sources Retrieved', sources.length);
        this.logMetric('Context Used', aiData.contextUsed ? 'Yes' : 'No');
        
        console.log('\n🤖 AI Response:');
        console.log(`"${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}"`);
        
        if (sources.length > 0) {
            console.log('\n📚 Sources:');
            sources.slice(0, 3).forEach((source, index) => {
                console.log(`   ${index + 1}. ${source.filename || source.id} (similarity: ${source.similarity || source.score || 'unknown'})`);
            });
        }
        
        return chatResult;
    }

    // Step 9: Delete document
    async deleteDocument() {
        this.logStep(9, 'Deleting uploaded document');
        
        if (!this.documentId) {
            console.log('⚠️ Document ID not available, skipping individual document deletion');
            return;
        }
        
        console.log(`🗑️ Deleting document ID: ${this.documentId}`);
        
        const response = await this.expectSuccess(() => 
            axios.delete(`${this.baseUrl}/api/collections/${this.testCollection.id}/documents/${this.documentId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            })
        );
        
        this.logSuccess('Document deleted successfully');
        
        // Verify document is gone
        const collections = await this.getCollections();
        const updatedCollection = collections.find(col => 
            col.name === this.testCollection.name || col.id === this.testCollection.id
        );
        
        const documentCount = updatedCollection?.document_count || updatedCollection?.documentsCount || 0;
        this.logMetric('Documents Remaining', documentCount);
        
        return response.data;
    }

    // Step 10: Delete test collection
    async deleteTestCollection() {
        this.logStep(10, 'Deleting test collection');
        
        console.log(`🗑️ Deleting collection: ${this.testCollection.name} (ID: ${this.testCollection.id})`);
        
        const response = await this.expectSuccess(() => 
            axios.delete(`${this.baseUrl}/api/collections/${this.testCollection.id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            })
        );
        
        this.logSuccess('Test collection deleted successfully');
        
        return response.data;
    }

    // Step 11: Verify collection deletion
    async verifyCollectionDeleted() {
        this.logStep(11, 'Verifying collection deletion');
        
        const collections = await this.getCollections();
        const foundCollection = collections.find(col => 
            col.name === this.testCollection.name || col.id === this.testCollection.id
        );
        
        if (foundCollection) {
            throw new Error(`Test collection '${this.testCollection.name}' still exists after deletion`);
        }
        
        this.logSuccess('Collection deletion verified - collection no longer exists');
        this.logMetric('Collection Found', 'No');
        this.logMetric('Final Collection Count', collections.length);
        
        return true;
    }

    // Final summary
    async printSummary() {
        const totalTime = Date.now() - this.startTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUITE SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ All tests passed successfully!`);
        console.log(`⏱️ Total execution time: ${(totalTime / 1000).toFixed(2)} seconds`);
        console.log(`🌐 Backend URL: ${this.baseUrl}`);
        console.log(`🔑 Authentication: Working`);
        console.log(`📁 Collection Management: Working`);
        console.log(`📄 File Upload: Working`);
        console.log(`🤖 AI Chat: Working`);
        console.log(`🗑️ Cleanup: Working`);
        
        if (this.backendStarted) {
            console.log(`🚀 Backend Auto-Start: Working`);
        } else {
            console.log(`🚀 Backend: Already Running`);
        }
        
        console.log('='.repeat(60));
        
        // Cleanup test file
        const testPdfPath = path.join(__dirname, 'test.pdf');
        if (fs.existsSync(testPdfPath)) {
            try {
                fs.unlinkSync(testPdfPath);
                console.log('🧹 Cleaned up test.pdf file');
            } catch (error) {
                console.log('⚠️ Could not clean up test.pdf file');
            }
        }
        
        // Stop backend if we started it
        if (this.backendStarted && this.backendProcess) {
            console.log('🛑 Stopping auto-started backend...');
            await this.stopBackend();
        }
    }

    // Main test runner
    async run() {
        try {
            // Ensure backend is running first
            await this.ensureBackendRunning();
            
            await this.downloadOpenApiSpec();
            await this.login();
            await this.getCollections();
            await this.createTestCollection();
            await this.verifyCollectionExists();
            await this.uploadTestPdf();
            await this.verifyDocumentUpload();
            await this.testAiChat();
            await this.deleteDocument();
            await this.deleteTestCollection();
            await this.verifyCollectionDeleted();
            await this.printSummary();
            
        } catch (error) {
            console.error('\n❌ TEST FAILED');
            console.error('─'.repeat(50));
            console.error(`Error: ${error.message}`);
            
            if (error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
            
            console.error(`\n⏱️ Failed after: ${((Date.now() - this.startTime) / 1000).toFixed(2)} seconds`);
            
            // Show backend output for debugging
            if (this.backendStarted) {
                this.printBackendOutput();
            }
            
            // Attempt cleanup
            if (this.testCollection && this.token) {
                console.log('\n🧹 Attempting cleanup...');
                try {
                    await this.deleteTestCollection();
                    console.log('✅ Cleanup successful');
                } catch (cleanupError) {
                    console.error('❌ Cleanup failed:', cleanupError.message);
                }
            }
            
            // Stop backend if we started it
            if (this.backendStarted && this.backendProcess) {
                await this.stopBackend();
            }
            
            process.exit(1);
        } finally {
            // Always attempt to stop backend if we started it
            if (this.backendStarted && this.backendProcess) {
                await this.stopBackend();
            }
        }
    }
}

// Run the test
if (require.main === module) {
    const tester = new APITester();
    tester.run();
}

module.exports = APITester;