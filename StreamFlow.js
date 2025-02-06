const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const xlsx = require('xlsx');
const mammoth = require('mammoth');

const app = express();
const port = 3001;


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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'text/plain',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/json'
        ];
        
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Разрешены только текстовые файлы (TXT, XLSX, DOCX, JSON)'));
        }
        cb(null, true);
    }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let sessions = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    
    try {
        const content = await parseFileContent(req.file);
        const txtPath = path.join(path.dirname(req.file.path), `${path.parse(req.file.filename).name}.txt`);
        fs.writeFileSync(txtPath, content);
        
        res.json({ 
            url: `/uploads/${path.basename(txtPath)}`,
            original: `/uploads/${req.file.filename}`
        });
    } catch (e) {
        res.status(500).send(`Ошибка обработки файла: ${e.message}`);
    }
});

app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get('http://localhost:11434/api/tags');
        const models = response.data.models
            .filter(m => !m.name.includes('vision')) // Убираем модели с поддержкой зрения
            .map(model => ({
                name: model.name,
                supports_files: true
            }));
        
        res.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Не удалось получить список моделей' });
    }
});

app.post('/api/generate', async (req, res) => {
    try {
        const { sessionId, content, model } = req.body;

        // Проверка наличия модели
        if (!model) {
            return res.status(400).json({ error: 'Модель не выбрана' });
        }

        // Проверяем наличие контента. Если текст пустой, проверяем, что есть хотя бы один файл с непустым содержимым.
        if (
            !content ||
            (content.question.trim() === "" &&
             (!content.files ||
              content.files.filter(f => f.content && f.content.trim() !== "").length === 0))
        ) {
            return res.status(400).json({ error: 'Пустой запрос' });
        }

        // Инициализируем сессию
        if (!sessions[sessionId]) {
            sessions[sessionId] = [{
                role: "system",
                content: "Отвечай только на русском языке"
            }];
        }

        const currentSession = sessions[sessionId];
        
        // Добавляем файлы как отдельные сообщения, если есть
        if (content.files && content.files.length > 0) {
            content.files.forEach(file => {
                currentSession.push({
                    role: "user",
                    content: `Документ: ${file.fileName}\nСодержимое:\n${file.content}`
                });
            });
        }

        // Добавляем текстовый вопрос
        if (content.question?.trim()) {
            currentSession.push({
                role: "user",
                content: content.question.trim()
            });
        }

        console.log("Контекст:", JSON.stringify(currentSession, null, 2));

        // Формируем тело запроса для Ollama
        const requestBody = {
            model: model,
            messages: currentSession,
            stream: true
        };

        // Отправляем запрос в Ollama
        const ollamaResponse = await axios.post('http://localhost:11434/api/chat', 
            requestBody,
            { 
                responseType: 'stream',
                validateStatus: (status) => status < 500 
            }
        );

        // Обработка ошибок Ollama
        if (ollamaResponse.status >= 400) {
            let errorData = '';
            ollamaResponse.data.on('data', chunk => errorData += chunk);
            ollamaResponse.data.on('end', () => {
                const error = JSON.parse(errorData);
                console.error('Ollama Error:', error);
                res.status(500).json({ error: error.error });
            });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let fullResponse = '';
        let buffer = ''; // Буфер для накопления частичных данных

        ollamaResponse.data.on('data', chunk => {
            buffer += chunk.toString();
            let parts = buffer.split('\n');
            // Оставляем последнюю часть, которая может быть неполной
            buffer = parts.pop();

            for (const line of parts) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                try {
                    const parsed = JSON.parse(trimmedLine);
                    const message = parsed.message;
                    if (message && message.content) {
                        fullResponse += message.content;
                        res.write(`data: ${JSON.stringify(message)}\n\n`);
                    }
                } catch (e) {
                    console.error('Ошибка при парсинге строки:', e);
                }
            }
        });

        ollamaResponse.data.on('end', () => {
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    const message = parsed.message;
                    if (message && message.content) {
                        fullResponse += message.content;
                        res.write(`data: ${JSON.stringify(message)}\n\n`);
                    }
                } catch (e) {
                    console.error('Ошибка при парсинге оставшихся данных:', e);
                }
            }
            // Добавляем ответ ассистента с обычным текстовым сообщением
            sessions[sessionId].push({ 
                role: 'assistant', 
                content: fullResponse 
            });
            res.end();
        });

        // Обработка ошибки в потоке данных
        ollamaResponse.data.on('error', err => {
            console.error('Ошибка потока данных:', err);
            res.write(`data: ${JSON.stringify({ error: 'Ошибка потока данных' })}\n\n`);
            res.end();
        });

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ 
            error: error.message || 'Internal Server Error' 
        });
    }
});

// Новая функция для парсинга файлов
async function parseFileContent(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    
    try {
        const buffer = fs.readFileSync(file.path);
        
        switch(ext) {
            case '.xlsx':
                const workbook = xlsx.read(buffer, {type: 'buffer'});
                return xlsx.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
            
            case '.docx':
                const {value} = await mammoth.extractRawText({buffer});
                return value;
            
            case '.json':
                const jsonData = JSON.parse(buffer.toString());
                return Object.entries(jsonData)
                    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                    .join('\n');
            
            default: // .txt
                return buffer.toString();
        }
    } catch (e) {
        throw new Error(`Ошибка чтения файла: ${e.message}`);
    }
}

app.listen(port, () => {
    console.log(`Server: http://localhost:${port}`);
});