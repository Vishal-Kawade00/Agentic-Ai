import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

dotenv.config();

const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE & SECURITY
// ==========================================
app.use(helmet()); // Sets HTTP security headers
app.use(cors({
    origin: process.env.CLIENT_URL, // Restrict to your React app
    methods: ['POST']
}));
app.use(express.json());

// API Rate Limiting: Max 50 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50,
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ==========================================
// 2. FILE VALIDATION & MULTER CONFIG
// ==========================================
const storage = multer.diskStorage({
    destination: 'uploads/'
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // Strict 20MB file size limit
    },
    fileFilter: (req, file, cb) => {
        // Only accept PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('INVALID_FILE_TYPE'), false);
        }
    }
});

// ==========================================
// 3. THE RAG ORCHESTRATOR ROUTE
// ==========================================
app.post('/api/upload', upload.single('pdf'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file provided.' });
        }

        console.log(`[PROCESS] Received valid PDF: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

        const filePath = req.file.path;
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), req.file.originalname);

        console.log('[NETWORK] Forwarding to AI Inference Engine...');

        // Forward to Python FastApi (Google Colab)
        const colabResponse = await axios.post(`${process.env.COLAB_API_URL}/process-pdf`, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 60000*5 // 30-second timeout so requests don't hang forever
        });

        // Cleanup: Delete the local file immediately
        fs.unlinkSync(filePath);
        console.log('[CLEANUP] Temporary file purged from Gateway.');

        res.status(200).json({
            status: 'success',
            data: colabResponse.data
        });

    } catch (error) {
        // Ensure file is deleted even if the AI API fails
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // Pass the error to the global error handler
        next(error); 
    }
});

// ==========================================
// ROUTE 2: THE CHAT BRIDGE (/api/ask)
// ==========================================
app.post('/api/ask', async (req, res, next) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required.' });
        }

        console.log(`[NETWORK] Forwarding query to AI Engine: "${query}"`);

        // Forward to Python FastApi (Google Colab)
        const colabResponse = await axios.post(`${process.env.COLAB_API_URL}/ask`, { query }, {
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            timeout: 60000 // 60 seconds for generation
        });

        res.status(200).json(colabResponse.data);

    } catch (error) {
        next(error); 
    }
});

// ==========================================
// 4. CENTRALIZED ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);

    if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(415).json({ error: 'Unsupported Media Type. Only PDFs are allowed.' });
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
    }

    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
         return res.status(503).json({ error: 'AI Engine is currently unreachable.' });
    }

    res.status(err.response?.status || 500).json({ 
        error: err.response?.data?.error || 'Internal API Gateway Error' 
    });
});

// ==========================================
// 5. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`✅ [READY] Production API Gateway running on port ${PORT}`);
});