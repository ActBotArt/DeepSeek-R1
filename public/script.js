if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", function () {
    const promptArea = document.getElementById("prompt");
    const sendButton = document.getElementById("sendButton");
    const chatBox = document.getElementById("chat-box");
    const fileInput = document.getElementById("fileInput");
    const uploadButton = document.getElementById("uploadButton");
    const attachmentsPreview = document.getElementById("attachmentsPreview");
    const modelSelect = document.getElementById('modelSelect');

    let pendingAttachments = [];
    let isSending = false;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);

    const currentModel = {
        name: modelSelect.value,
        supportsImages: modelSelect.value.toLowerCase().includes('llava')
    };

    // В начале файла добавим глобальную переменную для хранения последнего запроса
    let lastRequest = null;

    // Добавьте эти переменные в начало DOMContentLoaded
    let isAutoScrollEnabled = true;
    const autoScrollButton = document.createElement('button');
    autoScrollButton.className = 'auto-scroll-button';
    autoScrollButton.innerHTML = '⬇';
    autoScrollButton.title = 'Прокрутить вниз';
    document.querySelector('.chat-box').appendChild(autoScrollButton);

    // Обновляем обработчик прокрутки
    let scrollTimeout;
    let lastScrollPosition = 0;

    chatBox.addEventListener('scroll', () => {
        const currentScrollPosition = chatBox.scrollTop;
        const isScrolledToBottom = Math.abs(chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight) < 50;
        
        // Убираем проверку isProcessingScroll для более плавной прокрутки
        clearTimeout(scrollTimeout);
        
        // Если пользователь прокрутил вверх более чем на 100px от низа
        if (!isScrolledToBottom && (chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight) > 100) {
            isAutoScrollEnabled = false;
            autoScrollButton.style.display = 'flex';
            autoScrollButton.classList.add('show');
        } else if (isScrolledToBottom) {
            // Если пользователь прокрутил в самый низ
            isAutoScrollEnabled = true;
            autoScrollButton.style.display = 'none';
            autoScrollButton.classList.remove('show');
        }
        
        lastScrollPosition = currentScrollPosition;
        
        scrollTimeout = setTimeout(() => {
            // Дополнительная проверка после остановки прокрутки
            const finalPosition = chatBox.scrollTop;
            const finalScrolledToBottom = Math.abs(chatBox.scrollHeight - finalPosition - chatBox.clientHeight) < 50;
            
            if (finalScrolledToBottom) {
                isAutoScrollEnabled = true;
                autoScrollButton.style.display = 'none';
                autoScrollButton.classList.remove('show');
            }
        }, 100); // Уменьшаем задержку
    });

    // Обновляем обработчик клика по кнопке
    autoScrollButton.addEventListener('click', () => {
        isAutoScrollEnabled = true; // Включаем автоследование
        chatBox.scrollTop = chatBox.scrollHeight; // Прокручиваем вниз
        autoScrollButton.style.display = 'none';
        autoScrollButton.classList.remove('show');
    });

    // Обновляем функцию updateSendButtonState
    function updateSendButtonState() {
        const hasText = promptArea.value.trim().length > 0;
        const isModelSelected = modelSelect.value && modelSelect.value !== 'Выберите модель...';
        
        // Упрощаем проверку - кнопка активна, если есть модель и не идет отправка
        sendButton.disabled = !isModelSelected || isSending;
        sendButton.classList.toggle('disabled', sendButton.disabled);
    }

    // Автоматическое изменение высоты текстового поля
    promptArea.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
    });

    // Обработка вставки (Ctrl+V) для фотографий/файлов из буфера обмена
    promptArea.addEventListener("paste", function (e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              uploadFile(file);
            }
            e.preventDefault();
          }
        }
      }
    });

    // Отправка сообщения по нажатию Enter (без Shift)
    promptArea.addEventListener("keypress", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendButton.addEventListener("click", sendMessage);

    // Поддержка drag and drop для загрузки файлов
    document.addEventListener("dragover", function (e) {
      e.preventDefault();
    });

    document.addEventListener("drop", function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          uploadFile(e.dataTransfer.files[i]);
        }
      }
    });

    // Чтение файла в формате DataURL (base64) для изображений
    function readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Ошибка чтения файла."));
        reader.readAsDataURL(file);
      });
    }

    // Чтение текстового файла
    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Ошибка чтения файла."));
        reader.readAsText(file);
      });
    }

    // Проверка, является ли файл изображением
    function isImage(att) {
      if (att.type) {
        return att.type.startsWith("image/");
      } else {
        const imageExtensions = [".jpg", ".jpeg", ".png", ".gif"];
        const lower = att.fileName.toLowerCase();
        return imageExtensions.some(ext => lower.endsWith(ext));
      }
    }

    // Обновлённая функция отображения вложений
    function renderAttachmentsPreview() {
        attachmentsPreview.innerHTML = '';
        
        if (pendingAttachments.length > 0) {
            attachmentsPreview.classList.add('has-files');
            
            pendingAttachments.forEach((att, index) => {
                const fileCard = document.createElement('div');
                fileCard.className = 'file-card';
                fileCard.innerHTML = `
                    <div class="file-content">
                        <div class="file-icon">${getFileIcon(att.fileName)}</div>
                        <div class="file-info">
                            <div class="file-name">${att.fileName}</div>
                            <div class="file-size">${formatFileSize(att.size)}</div>
                        </div>
                    </div>
                    <button class="delete-btn" data-index="${index}">&times;</button>
                `;
                attachmentsPreview.appendChild(fileCard);
            });
        } else {
            attachmentsPreview.classList.remove('has-files');
        }
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            txt: '📄',
            docx: '🗂️',
            xlsx: '🗃️',
            pdf: '📑',
            json: '🔖'
        };
        return icons[ext] || '📁';
    }

    // Вспомогательная функция для форматирования размера
    function formatFileSize(bytes) {
        if (bytes >= 1024 * 1024) return `${(bytes/(1024*1024)).toFixed(1)} MB`;
        if (bytes >= 1024) return `${(bytes/1024).toFixed(0)} KB`;
        return `${bytes} B`;
    }

    function getFileType(filename) {
        return ''; // Всегда возвращаем пустую строку
    }

    function removeAttachment(index) {
      pendingAttachments.splice(index, 1);
      renderAttachmentsPreview();
    }

    // Обновлённая функция загрузки файла
    async function uploadFile(file) {
      try {
        const allowedTypes = [
            'text/plain',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
            'application/json'
        ];
        
        if (!allowedTypes.includes(file.type)) {
            alert('Неподдерживаемый формат файла');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        const contentResponse = await fetch(result.url);
        const content = await contentResponse.text();

        const existingIndex = pendingAttachments.findIndex(a => a.fileName === file.name);
        if (existingIndex === -1) {
            pendingAttachments.push({
                type: 'text',
                fileName: file.name,
                content: content,
                size: file.size,
                tooLarge: file.size > MAX_FILE_SIZE,
                sent: false
            });
        } else {
            pendingAttachments[existingIndex] = {
                ...pendingAttachments[existingIndex],
                content: content
            };
        }
        
        renderAttachmentsPreview();
        updateSendButtonState();
        
      } catch (error) {
        alert(error.message);
      }
    }

    // Отправка сообщения вместе с вложениями
    async function sendMessage() {
      if (isSending || sendButton.disabled) return;
      
      const promptText = promptArea.value.trim();
      
      // Проверяем, есть ли что отправлять
      if (!promptText && pendingAttachments.length === 0) {
          alert('Введите сообщение или прикрепите файл');
          return;
      }

      // Сохраняем текущий запрос
      lastRequest = {
          text: promptText,
          attachments: [...pendingAttachments],
          model: document.getElementById('modelSelect').value
      };

      // Проверяем размер файлов только если они есть
      if (pendingAttachments.length > 0) {
          const hasLargeFiles = pendingAttachments.some(att => att.tooLarge);
          if (hasLargeFiles) {
              alert('Некоторые файлы превышают максимальный размер');
              return;
          }
      }
      
      isSending = true;
      sendButton.classList.add("disabled");
      updateSendButtonState();

      // Создаем копию массива вложений перед очисткой
      const attachments = [...pendingAttachments];
      pendingAttachments.length = 0;
      renderAttachmentsPreview();
      updateSendButtonState();

      // Создаем контейнер сообщения
      const messageContainer = document.createElement('div');
      messageContainer.className = 'message user-message';

      // Основной контент сообщения
      const messageContent = document.createElement('div');
      messageContent.className = 'message-content';
      
      // Добавляем файлы
      if (attachments.length > 0) {
          const filesContainer = document.createElement('div');
          filesContainer.className = 'files-container';
          
          attachments.forEach(file => {
              const fileElement = document.createElement('div');
              fileElement.className = 'file-preview';
              fileElement.innerHTML = `
                  <div class="file-content">
                      <div class="file-icon">${getFileIcon(file.fileName)}</div>
                      <div class="file-info">
                          <div class="file-name">${file.fileName}</div>
                          <div class="file-size">${formatFileSize(file.size)}</div>
                      </div>
                  </div>
              `;
              filesContainer.appendChild(fileElement);
          });
          messageContent.appendChild(filesContainer);
      }

      // Добавляем текст
      if (promptText) {
          const textElement = document.createElement('div');
          textElement.className = 'message-text';
          textElement.textContent = promptText;
          messageContent.appendChild(textElement);
      }

      messageContainer.appendChild(messageContent);
      chatBox.appendChild(messageContainer);

      // Очистка после отправки
      promptArea.value = '';
      pendingAttachments = [];
      renderAttachmentsPreview();
      updateSendButtonState();

      // Создаём контейнер для ответа ИИ
      const assistantContainer = document.createElement("div");
      assistantContainer.className = "assistant-message-container";
      assistantContainer.style.marginLeft = '0';
      assistantContainer.style.marginRight = 'auto';
      assistantContainer.style.alignItems = 'flex-start';
      chatBox.appendChild(assistantContainer);

      const assistantDiv = document.createElement("div");
      assistantDiv.className = "assistant-message";
      assistantDiv.innerHTML = `
          <div class="loading-container">
              <div class="loading-spinner"></div>
              <div class="loading-text">Обработка запроса...</div>
          </div>
      `;
      assistantContainer.appendChild(assistantDiv);
      scrollToBottom();

      // Формируем данные для отправки
      const content = {
          question: promptText,
          files: attachments.map(file => ({
              fileName: file.fileName,
              content: file.content
          }))
      };

      try {
          // Получаем выбранную модель
          const model = document.getElementById('modelSelect').value;
          if (!model || model === 'Выберите модель...') {
              throw new Error('Пожалуйста, выберите модель из списка');
          }

          // Отправка запроса с передачей выбранной модели
          await generateResponse(content, assistantContainer, assistantDiv, model);
      } catch (error) {
          console.error('Ошибка при отправке:', error);
          assistantDiv.innerHTML = `
              <div class="error-message">
                  ${error.message || 'Произошла ошибка при отправке сообщения'}
                  <button class="retry-button">Повторить</button>
              </div>
          `;
      } finally {
          isSending = false;
          sendButton.classList.remove("disabled");
          updateSendButtonState();
      }
    }

    // Генерация ответа ИИ с потоковой обработкой
    async function generateResponse(content, assistantContainer, assistantDiv, model) {
      let answer = "";
      let thinkText = "";
      let isThinking = false;
      let discussionDiv;
      let aiResponseDiv;
      
      // Сохраняем последний запрос для возможности повтора
      window.lastRequest = {content, model};

      // Удаляем старый assistantDiv
      assistantDiv.remove();

      // Создаем и показываем индикатор загрузки
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "loading-container";
      loadingDiv.innerHTML = `
          <div class="loading-spinner"></div>
          <div class="loading-text">Обработка запроса...</div>
      `;
      assistantContainer.appendChild(loadingDiv);

      function updateDiscussion() {
        if (!discussionDiv && thinkText.trim()) {
          discussionDiv = document.createElement("div");
          discussionDiv.className = "discussion-section";
          discussionDiv.innerHTML = `
              <div class="discussion-header">
                  <span class="toggle-arrow">▼</span>
                  <span>Рассуждение</span>
              </div>
              <div class="discussion-content"></div>
          `;
          
          assistantContainer.insertBefore(discussionDiv, loadingDiv);

          const header = discussionDiv.querySelector('.discussion-header');
          header.addEventListener('click', function() {
            discussionDiv.classList.toggle('collapsed');
            const arrow = header.querySelector('.toggle-arrow');
            arrow.textContent = discussionDiv.classList.contains('collapsed') ? '▶' : '▼';
          });
        }
        
        if (discussionDiv && thinkText.trim()) {
          const contentDiv = discussionDiv.querySelector(".discussion-content");
          contentDiv.textContent = thinkText.trim();
          discussionDiv.style.display = 'block';
        } else if (discussionDiv) {
          discussionDiv.style.display = 'none';
        }
      }

      function updateAIResponse() {
        if (!aiResponseDiv && answer.trim()) {
            aiResponseDiv = document.createElement("div");
            aiResponseDiv.className = "ai-response";
            assistantContainer.appendChild(aiResponseDiv);
            loadingDiv.remove();
        }
        
        if (aiResponseDiv && answer.trim()) {
            const formattedText = answer.trim()
                .replace(/\n\n+/g, '\n\n')
                .split('\n').map(line => {
                    if (line.match(/^[*-]\s/)) {
                        return `<span class="list-item">${line}</span>`;
                    }
                    return line;
                }).join('\n');
            
            aiResponseDiv.innerHTML = formattedText;
            aiResponseDiv.style.display = 'block';
            
            // Прокручиваем только если включено автоследование
            if (isAutoScrollEnabled) {
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        } else if (aiResponseDiv) {
            aiResponseDiv.style.display = 'none';
        }
      }

      try {
        if ((!content.question || content.question.trim() === "") && (!content.files || content.files.length === 0)) {
            throw new Error('Добавьте текст сообщения или прикрепите файлы');
        }

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'default-session',
                content: content,
                model: model
            })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Ошибка сервера');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith("data:")) {
              try {
                const parsed = JSON.parse(line.slice(5));
                if (parsed.content) {
                  let content = parsed.content;
                  if (content.includes("<think>")) {
                    isThinking = true;
                    content = content.replace("<think>", "");
                    thinkText += content;
                    updateDiscussion();
                  } else if (content.includes("</think>")) {
                    isThinking = false;
                    content = content.replace("</think>", "");
                    thinkText += content;
                    updateDiscussion();
                  } else {
                    if (isThinking) {
                      thinkText += content;
                      updateDiscussion();
                    } else {
                      answer += content;
                      updateAIResponse();
                    }
                    scrollToBottom();
                  }
                }
              } catch (parseError) {
                console.error("Ошибка парсинга:", parseError);
              }
            }
          }
        }
        if (!answer && !thinkText) {
          assistantDiv.textContent = "Пустой ответ от сервера";
        }
      } catch (error) {
        loadingDiv.remove();
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.innerHTML = `
            ❌ Ошибка: ${error.message}
            <button class="retry-button">Повторить</button>
        `;
        assistantContainer.appendChild(errorDiv);
      } finally {
        isSending = false;
        updateSendButtonState();
        scrollToBottom();
      }
    }

    // Обновляем функцию scrollToBottom
    function scrollToBottom() {
        if (isAutoScrollEnabled) {
            chatBox.scrollTop = chatBox.scrollHeight;
            lastScrollPosition = chatBox.scrollTop;
            autoScrollButton.style.display = 'none';
            autoScrollButton.classList.remove('show');
        }
    }

    // Обработчик удаления файлов
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) {
            const index = parseInt(e.target.getAttribute('data-index'));
            if (!isNaN(index) && index >= 0 && index < pendingAttachments.length) {
                pendingAttachments.splice(index, 1);
                renderAttachmentsPreview();
                updateSendButtonState();
            }
        }
    });

    // Новая функция для случайного выбора модели
    function selectRandomModel() {
        const options = modelSelect.options;
        const randomIndex = Math.floor(Math.random() * (options.length - 1)) + 1;
        modelSelect.selectedIndex = randomIndex;
        currentModel.name = modelSelect.value;
        updateSendButtonState();
    }

    // Обработчик кнопки случайной модели
    document.getElementById('randomModel').addEventListener('click', selectRandomModel);

    // Обновление загрузки моделей
    async function loadModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) throw new Error('Сервер моделей недоступен');
            const models = await response.json();
            
            // Очищаем предыдущие ошибки
            document.querySelectorAll('.model-error').forEach(el => el.remove());
            
            const select = document.getElementById('modelSelect');
            select.innerHTML = '<option value="" disabled selected>Выберите модель...</option>';
            
            if (models.length === 0) {
                showModelError('Нет доступных моделей. Запустите Ollama и обновите страницу');
                return;
            }
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                select.appendChild(option);
            });

            // Восстанавливаем сохранённую модель или выбираем случайную
            const savedModel = localStorage.getItem('selectedModel');
            if (savedModel && models.some(m => m.name === savedModel)) {
                modelSelect.value = savedModel;
            } else if(models.length > 0) {
                selectRandomModel();
            }
            updateSendButtonState();
        } catch (error) {
            console.error('Error loading models:', error);
            showModelError(`Ошибка загрузки моделей: ${error.message}`);
            selectRandomModel(); // Убираем вызов случайного выбора
        }
    }

    // Новая функция для отображения ошибок
    function showModelError(message) {
        // Удаляем старые ошибки
        document.querySelectorAll('.model-error').forEach(el => el.remove());
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'model-error';
        errorDiv.style.color = '#dc2626';
        errorDiv.style.padding = '10px';
        errorDiv.style.marginBottom = '1rem';
        errorDiv.innerHTML = `❌ ${message}`;
        
        const container = document.querySelector('.model-selector');
        container.parentNode.insertBefore(errorDiv, container.nextSibling);
        
        // Блокируем элементы интерфейса
        modelSelect.disabled = true;
        document.getElementById('randomModel').disabled = true;
        sendButton.disabled = true;
    }

    // Вызвать после загрузки страницы
    loadModels();

    // При загрузке страницы
    function loadSelectedModel() {
        const savedModel = localStorage.getItem('selectedModel');
        if (savedModel) {
            modelSelect.value = savedModel;
        }
    }

    // При изменении выбора
    modelSelect.addEventListener('change', () => {
        localStorage.setItem('selectedModel', modelSelect.value);
        updateSendButtonState();
    });

    // Обновим обработчик кнопки "Повторить"
    document.addEventListener('click', async function(e) {
        if (e.target.classList.contains('retry-button')) {
            if (!lastRequest) {
                console.error('Нет сохранённого запроса для повтора');
                return;
            }

            const assistantContainer = e.target.closest('.assistant-message-container');
            if (!assistantContainer) return;

            // Очищаем контейнер
            assistantContainer.innerHTML = '';

            // Создаём индикатор загрузки
            const loadingDiv = document.createElement("div");
            loadingDiv.className = "loading-container";
            loadingDiv.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Обработка запроса...</div>
            `;
            assistantContainer.appendChild(loadingDiv);

            try {
                // Формируем контент для повторного запроса
                const content = {
                    question: lastRequest.text,
                    files: lastRequest.attachments.map(file => ({
                        fileName: file.fileName,
                        content: file.content
                    }))
                };

                await generateResponse(
                    content,
                    assistantContainer,
                    loadingDiv,
                    lastRequest.model
                );
            } catch (error) {
                console.error('Ошибка при повторном запросе:', error);
                assistantContainer.innerHTML = `
                    <div class="error-message">
                        ${error.message || 'Произошла ошибка при повторной отправке'}
                        <button class="retry-button">Повторить</button>
                    </div>
                `;
            }
        }
    });

    // Обновим стили для кнопки "Повторить"
    const retryButtonStyles = `
    .retry-button {
        background: #4f46e5;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
        margin-top: 8px;
    }

    .retry-button:hover {
        background: #4338ca;
        transform: translateY(-1px);
    }

    .retry-button:active {
        transform: translateY(0);
    }

    .error-message {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #dc2626;
    }
    `;

    // Добавляем стили на страницу
    const styleSheet = document.createElement("style");
    styleSheet.textContent = retryButtonStyles;
    document.head.appendChild(styleSheet);

    // Добавьте обработчик для предотвращения закрытия при клике на input-area
    document.querySelector('.input-area').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Обновляем обработчик клика по кнопке загрузки
    uploadButton.addEventListener("click", function() {
        // Добавляем подсказку при клике на кнопку
        const allowedTypes = ['TXT', 'DOCX', 'XLSX', 'JSON'];
        fileInput.title = `Поддерживаемые форматы: ${allowedTypes.join(', ')}`;
        fileInput.click();
    });

    // Обновляем обработчик выбора файлов
    fileInput.addEventListener("change", function(e) {
        if (e.target.files) {
            Array.from(e.target.files).forEach(file => {
                uploadFile(file);
            });
        }
        // Очищаем input, чтобы можно было загрузить те же файлы повторно
        e.target.value = '';
    });
  });
} else {
  console.error("Ошибка: document не найден. Этот скрипт должен запускаться в браузере.");
} 