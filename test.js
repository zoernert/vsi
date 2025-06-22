const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000/api';

async function runTest() {
    let userId = '';
    let token = '';

    console.log('--- Starting API Test Script ---');

    // 1. Register a new user
    console.log('\n1. Registering a new user...');
    try {
        const registerRes = await axios.post(`${API_BASE_URL}/auth/register`);
        userId = registerRes.data.userId;
        token = registerRes.data.token;
        console.log('Registration successful:');
        console.log(`  User ID: ${userId}`);
        console.log(`  Token: ${token.substring(0, 30)}...`);
    } catch (error) {
        console.error('Registration failed:', error.response ? error.response.data : error.message);
        return;
    }

    // 2. Create a collection for the user
    console.log('\n2. Creating a collection for the user...');
    try {
        const collectionRes = await axios.post(`${API_BASE_URL}/collections`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Collection creation successful:', collectionRes.data.message);
    } catch (error) {
        console.error('Collection creation failed:', error.response ? error.response.data : error.message);
        // If collection already exists, it's fine for a test run, but log it.
        if (error.response && error.response.status === 409) {
            console.log('  (Collection might have existed from a previous run, continuing...)');
        } else {
            return;
        }
    }

    // 3. Upload test.pdf
    console.log('\n3. Uploading test.pdf...');
    const filePath = path.join(__dirname, 'test.pdf'); // Assumes test.pdf is in the root directory

    if (!fs.existsSync(filePath)) {
        console.error(`Error: test.pdf not found at ${filePath}. Please create a dummy test.pdf file.`);
        console.error('Example: echo "This is a test PDF file." > test.pdf');
        return;
    }

    // Check file size before upload
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = fileStats.size / (1024 * 1024);
    console.log(`  File size: ${fileSizeInMB.toFixed(2)} MB`);

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), 'test.pdf');

    try {
        console.log('  Uploading file...');
        const uploadRes = await axios.post(`${API_BASE_URL}/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            },
            timeout: 60000 // 60 second timeout for large files
        });
        console.log('File upload successful:');
        console.log(uploadRes.data);
    } catch (error) {
        console.error('File upload failed:');
        if (error.response) {
            console.error('  Status:', error.response.status);
            console.error('  Error:', error.response.data);
        } else {
            console.error('  Error:', error.message);
        }
        return;
    }

    console.log('\n--- API Test Script Finished ---');
}

runTest();
