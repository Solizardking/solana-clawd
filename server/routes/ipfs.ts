import { Router } from 'express';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'));
    }
    cb(null, true);
  }
});

// Handle file upload and metadata
router.post('/ipfs', upload.single('file'), async (req, res) => {
  try {
    console.log('IPFS upload request headers:', req.headers);
    console.log('IPFS upload request body:', req.body);
    console.log('IPFS upload request file:', req.file);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate required fields
    const { name, symbol, description } = req.body;
    if (!name || !symbol || !description) {
      return res.status(400).json({ error: 'Missing required metadata fields' });
    }

    // For now, just return a mock response
    // In production, this would upload to actual IPFS
    const mockMetadataUri = `https://pump.fun/metadata/${Date.now()}`;

    // Set proper content type header
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      uri: mockMetadataUri,
      name,
      symbol,
      description
    });
  } catch (error) {
    console.error('IPFS upload error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to upload to IPFS'
    });
  }
});

export default router;