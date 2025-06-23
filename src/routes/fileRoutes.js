const express = require('express');
const { FileService } = require('../services/fileService');

const router = express.Router();
const fileService = new FileService();

// Download file by UUID (NO AUTHENTICATION REQUIRED)
router.get('/files/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        
        console.log(`File download request for UUID: ${uuid}`);
        
        const file = await fileService.getFile(uuid);
        
        if (!file) {
            console.log(`File not found: ${uuid}`);
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', file.mime_type);
        res.setHeader('Content-Length', file.file_size);
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        
        // Send the file data
        res.send(file.file_data);
        
        console.log(`✅ File downloaded: ${file.original_name} (${file.file_size} bytes)`);
        
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Get file info by UUID (NO AUTHENTICATION REQUIRED)
router.get('/files/:uuid/info', async (req, res) => {
    try {
        const { uuid } = req.params;
        
        const fileInfo = await fileService.getFileInfo(uuid);
        
        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Return file metadata (without file data)
        res.json({
            uuid: fileInfo.uuid,
            originalName: fileInfo.original_name,
            mimeType: fileInfo.mime_type,
            fileSize: fileInfo.file_size,
            uploadedBy: fileInfo.uploaded_by,
            uploadedAt: fileInfo.uploaded_at
        });
        
    } catch (error) {
        console.error('Error getting file info:', error);
        res.status(500).json({ error: 'Failed to get file info' });
    }
});

module.exports = router;
