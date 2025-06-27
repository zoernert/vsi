const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function simpleUploadTest() {
    const baseURL = 'http://localhost:3000';
    
    try {
        // 1. Login
        console.log('1. Logging in...');
        const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
            username: 'demo',
            password: 'demo'
        });
        const token = loginResponse.data.token;
        console.log('✅ Login successful');
        
        // 2. Create collection
        console.log('2. Creating collection...');
        const collectionResponse = await axios.post(`${baseURL}/api/collections`, {
            name: `debug_test_${Date.now()}`,
            description: 'Debug test collection'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const collection = collectionResponse.data.data;
        console.log('Collection response:', JSON.stringify(collection, null, 2));
        console.log(`✅ Collection created: ID ${collection.id}, UUID ${collection.uuid}`);
        
        // 3. Upload file
        console.log('3. Uploading file...');
        const form = new FormData();
        form.append('file', fs.createReadStream('./test.pdf'));
        
        const uploadResponse = await axios.post(`${baseURL}/api/upload/${collection.id}`, form, {
            headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${token}`
            }
        });
        
        console.log('✅ Upload completed');
        
        // 4. Check database directly
        console.log('4. Checking database...');
        // This will be done manually with docker exec
        
        console.log(`\nCollection ID: ${collection.id}`);
        console.log(`Collection UUID: ${collection.uuid}`);
        console.log('Now check the database with:');
        console.log(`docker exec -it vsi-postgres-dev psql -U vsi_user -d vsi_db -c "SELECT COUNT(*) FROM documents WHERE collection_id = ${collection.id} OR collection_uuid = '${collection.uuid}';"`)
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

simpleUploadTest();
