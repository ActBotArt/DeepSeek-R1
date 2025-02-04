const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

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
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        allowedTypes.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Invalid file type'));
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

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/generate', async (req, res) => {
    try {
        const { sessionId, content } = req.body;

        if (!sessions[sessionId]) sessions[sessionId] = [];

        // Формируем массив контента
        const messageContent = [];
        
        // Добавляем изображение если есть
        if (content.photo) {
            messageContent.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${content.photo}`
                }
            });
        }

        // Добавляем текст только если он не пустой
        if (content.question && content.question.trim().length > 0) {
            messageContent.push({
                type: "text",
                text: content.question.trim()
            });
        }

        // Проверяем наличие контента
        if (messageContent.length === 0) {
            return res.status(400).json({ error: "Пустой запрос" });
        }

        // Если в вопросе есть русские символы, добавляем системное сообщение
        if (/[а-яё]/i.test(content.question || '')) {
            sessions[sessionId].push({
                role: 'system',
                content: 'Отвечай только на русском языке'
            });
        }

        // Добавляем сообщение пользователя
        sessions[sessionId].push({
            role: 'user',
            content: messageContent
        });

        const currentMessages = sessions[sessionId];
        console.log("Контекст:", JSON.stringify(currentMessages, null, 2));

        // Формируем сообщения для Ollama
        const ollamaMessages = currentMessages.map(msg => {
            if (msg.role === 'user') {
                // Для пользовательских сообщений объединяем контент
                return {
                    role: msg.role,
                    content: msg.content.map(item => {
                        if (item.type === 'text') return item.text;
                        if (item.type === 'image_url') return `[Image: ${item.image_url.url}]`;
                        return '';
                    }).join('\n')
                };
            }
            return msg; // Системные и ассистентские сообщения остаются без изменений
        });

        const ollamaResponse = await axios.post('http://localhost:11434/api/chat', {
            model: 'deepseek-r1:7b',
            messages: ollamaMessages, // Используем преобразованные сообщения
            stream: true,
        }, { 
            responseType: 'stream',
            validateStatus: (status) => status < 500 
        });

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

app.listen(port, () => {
    console.log(`Server: http://localhost:${port}`);
});
