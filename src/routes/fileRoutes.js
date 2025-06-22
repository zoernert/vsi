const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// NO AUTHENTICATION MIDDLEWARE - These routes are public

// Download file by UUID (no authentication required)
router.get('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Validate UUID format (with or without extension)
        const uuidPart = fileId.split('.')[0];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuidPart)) {
            return res.status(400).json({ error: 'Invalid file ID format' });
        }
        
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        
        // Find file with matching UUID (regardless of extension)
        const files = fs.readdirSync(uploadsDir).filter(file => 
            file.startsWith(uuidPart)
        );
        
        if (files.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const fileName = files[0]; // Take the first match
        const filePath = path.join(uploadsDir, fileName);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Get file stats
        const stats = fs.statSync(filePath);
        
        // Set appropriate headers
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        // Determine content type based on extension
        const ext = path.extname(fileName).toLowerCase();
        const contentTypes = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif'
        };
        
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        console.log(`File downloaded: ${fileName} (${fileId})`);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Get file info by UUID (no authentication required)
router.get('/files/:fileId/info', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Validate UUID format (with or without extension)
        const uuidPart = fileId.split('.')[0];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuidPart)) {
            return res.status(400).json({ error: 'Invalid file ID format' });
        }
        
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        
        // Find file with matching UUID
        const files = fs.readdirSync(uploadsDir).filter(file => 
            file.startsWith(uuidPart)
        );
        
        if (files.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const fileName = files[0];
        const filePath = path.join(uploadsDir, fileName);
        const stats = fs.statSync(filePath);
        
        res.json({
            fileId: uuidPart,
            fileName: fileName,
            size: stats.size,
            uploadedAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(fileName),
            downloadUrl: `/api/files/${uuidPart}`
        });
        
    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({ error: 'Failed to get file info' });
    }
});

module.exports = router;
