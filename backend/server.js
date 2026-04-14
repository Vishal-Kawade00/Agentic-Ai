import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();
const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE & SECURITY
// ==========================================
app.use(helmet()); 
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 200, 
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ==========================================
// 2. STATELESS MULTER CONFIG (RAM Only)
// ==========================================
const upload = multer({
    storage: multer.memoryStorage(), 
    limits: { fileSize: 50 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('INVALID_FILE_TYPE'), false);
    }
});

// ==========================================
// 3. INGESTION ROUTES
// ==========================================
app.post('/api/upload', upload.single('pdf'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF file provided.' });

        // --- VISIBILITY LOGS ---
        const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
        console.log(`\n📂 [File Received] Name: "${req.file.originalname}" | Size: ${fileSizeMB} MB`);
        console.log(`📡 [Forwarding] Sending buffer to AI Engine at: ${process.env.COLAB_API_URL}`);

        const form = new FormData();
        form.append('file', req.file.buffer, { filename: req.file.originalname });

        const colabResponse = await axios.post(`${process.env.COLAB_API_URL}/process-pdf`, form, {
            headers: { ...form.getHeaders() },
            timeout: 15000 
        });

        console.log(`✅ [Handshake] AI Engine accepted file. Job ID: ${colabResponse.data.job_id}`);
        res.status(202).json(colabResponse.data);

    } catch (error) { 
        console.error(`⚠️ [Upload Error] Forwarding failed: ${error.message}`);
        next(error); 
    }
});

app.get('/api/status/:job_id', async (req, res, next) => {
    try {
        const colabResponse = await axios.get(`${process.env.COLAB_API_URL}/ingest-status/${req.params.job_id}`);
        
        // Only log completion to keep the console clean from polling noise
        if (colabResponse.data.status === 'completed') {
            console.log(`⚙️  [Status] Ingestion complete for Job: ${req.params.job_id}`);
        }
        
        res.status(200).json(colabResponse.data);
    } catch (error) {
        if (error.response?.status === 404) return res.status(404).json({ error: 'Job not found' });
        next(error);
    }
});

// ==========================================
// 4. THE STREAMING CHAT BRIDGE
// ==========================================
app.post('/api/ask', async (req, res, next) => {
    try {
        const { query, chat_history } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required.' });

        console.log(`💬 [Chat] Proxying query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);

        const response = await axios({
            method: 'post',
            url: `${process.env.COLAB_API_URL}/ask`,
            data: { query, chat_history },
            responseType: 'stream', 
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            timeout: 60000 
        });

        response.data.pipe(res);
    } catch (error) { next(error); }
});

// ==========================================
// 5. CENTRALIZED ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    if (err.message === 'INVALID_FILE_TYPE') return res.status(415).json({ error: 'Only PDFs are allowed.' });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Max file size is 50MB.' });
    if (err.code === 'ECONNREFUSED' || !err.response) {
        console.error("❌ [Engine Error] AI Engine is offline or Ngrok URL is invalid.");
        return res.status(503).json({ error: 'AI Engine unreachable.' });
    }
    
    res.status(err.response?.status || 500).json({ error: err.response?.data?.detail || 'Gateway Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 [System] Gateway Online | Port: ${PORT}`);
    console.log(`🔗 [Target] Forwarding to: ${process.env.COLAB_API_URL}`);
});