const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        allowedTypes.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Invalid file type'));
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sessions = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/generate', async (req, res) => {
    try {
        const { prompt, sessionId } = req.body;

        if (!sessions[sessionId]) sessions[sessionId] = [];

        const messages = [
            ...sessions[sessionId],
            { role: 'user', content: prompt }
        ];

        const ollamaResponse = await axios.post('http://localhost:11434/api/chat', {
            // Можете использовать любую модель!
			model: 'deepseek-r1:7b',
            messages,
            stream: true,
        }, { responseType: 'stream' });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let fullResponse = '';
        ollamaResponse.data.on('data', chunk => {
            try {
                const lines = chunk.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    const { message } = JSON.parse(line);
                    if (message?.content) {
                        fullResponse += message.content;
                        res.write(`data: ${JSON.stringify(message)}\n\n`);
                    }
                }
            } catch (e) {
                console.error('Parsing error:', e);
            }
        });

        ollamaResponse.data.on('end', () => {
            sessions[sessionId] = [...messages, { role: 'assistant', content: fullResponse }];
            res.end();
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server: http://localhost:${port}`);
});
