if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", function () {
    const promptArea = document.getElementById("prompt");
    const sendButton = document.getElementById("sendButton");
    const chatBox = document.getElementById("chat-box");
    const fileInput = document.getElementById("fileInput");
    const uploadButton = document.getElementById("uploadButton");
    const attachmentsPreview = document.getElementById("attachmentsPreview");

    let pendingAttachments = [];
    let isSending = false;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ

    // Функция для обновления состояния кнопки "Отправить"
    function updateSendButtonState() {
      // Если идёт отправка или хотя бы одно вложение превышает лимит — отключаем кнопку
      if (isSending || pendingAttachments.some(att => att.tooLarge)) {
        sendButton.disabled = true;
        sendButton.classList.add("disabled");
      } else {
        sendButton.disabled = false;
        sendButton.classList.remove("disabled");
      }
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

    // Обновленная функция рендеринга вложений
    function renderAttachmentsPreview() {
        attachmentsPreview.innerHTML = '';
        
        pendingAttachments.forEach((att, index) => {
            const div = document.createElement('div');
            div.className = 'attachment-preview';
            div.innerHTML = `
                <img src="${att.preview}" alt="Превью">
                <button class="remove-btn" data-index="${index}">×</button>
            `;
            attachmentsPreview.appendChild(div);
        });
        
        attachmentsPreview.style.display = pendingAttachments.length ? 'flex' : 'none';
    }

    // Вспомогательная функция для форматирования размера
    function formatFileSize(bytes) {
        if (bytes >= 1024 * 1024) return `${(bytes/(1024*1024)).toFixed(1)} МБ`;
        if (bytes >= 1024) return `${(bytes/1024).toFixed(0)} КБ`;
        return `${bytes} Б`;
    }

    function removeAttachment(index) {
      pendingAttachments.splice(index, 1);
      renderAttachmentsPreview();
    }

    // Функция загрузки файла с проверками по типу и размеру
    async function uploadFile(file) {
      if (!file.type.startsWith("image/")) {
        alert("Разрешены только изображения");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        pendingAttachments.push({
          url: URL.createObjectURL(file),
          fileName: file.name,
          tooLarge: true
        });
        renderAttachmentsPreview();
        return;
      }

      const base64 = await readFileAsDataURL(file);
      pendingAttachments.push({
        preview: base64, // Полный Data URL для превью
        base64: base64.split(',')[1], // Чистый base64 для отправки
        fileName: file.name,
        tooLarge: false
      });
      renderAttachmentsPreview();
    }

    // Отправка сообщения вместе с вложениями
    async function sendMessage() {
      if (isSending) return;
      if (pendingAttachments.some(att => att.tooLarge)) return;
      
      const promptText = promptArea.value.trim();
      if (!promptText && pendingAttachments.length === 0) return;
      
      isSending = true;
      sendButton.classList.add("disabled");
      updateSendButtonState();

      // Создаём элемент для отображения сообщения пользователя
      const messageContainer = document.createElement("div");
      messageContainer.className = "message-container";

      // Добавляем вложения (если имеются)
      if (pendingAttachments.length > 0) {
        const attachmentsDiv = document.createElement("div");
        attachmentsDiv.className = "attachment-message-group";
        const attachmentsToSend = [...pendingAttachments]; // Сохраняем копию
        attachmentsToSend.forEach(att => {
          const attDiv = document.createElement("div");
          attDiv.className = "attachment-message";
          if (isImage(att)) {
            const img = document.createElement("img");
            img.src = `data:image/png;base64,${att.base64}`;
            img.alt = att.fileName;
            img.style.maxWidth = "150px";
            img.style.borderRadius = "8px";
            attDiv.appendChild(img);
          } else {
            const link = document.createElement("a");
            link.href = att.url;
            link.target = "_blank";
            link.textContent = att.fileName;
            attDiv.appendChild(link);
          }
          attachmentsDiv.appendChild(attDiv);
        });
        messageContainer.appendChild(attachmentsDiv);
      }

      // Добавляем текст сообщения (если есть)
      if (promptText) {
        const userTextDiv = document.createElement("div");
        userTextDiv.className = "user-message";
        userTextDiv.textContent = promptText;
        messageContainer.appendChild(userTextDiv);
      }

      chatBox.appendChild(messageContainer);
      scrollToBottom();

      // Создаём контейнер для ответа ИИ
      const assistantContainer = document.createElement("div");
      assistantContainer.className = "assistant-message-container";
      chatBox.appendChild(assistantContainer);

      const assistantDiv = document.createElement("div");
      assistantDiv.className = "assistant-message";
      assistantDiv.innerHTML = `<div class="loading-spinner"></div>`;
      assistantContainer.appendChild(assistantDiv);
      scrollToBottom();

      // Формируем данные для отправки
      const content = {
          question: promptText,
          photo: pendingAttachments[0]?.base64 || null
      };

      // Очищаем поле ввода и предварительный просмотр вложений
      promptArea.value = "";
      promptArea.style.height = "auto";
      const attachmentsToSend = [...pendingAttachments]; // Сохраняем копию
      pendingAttachments = [];
      renderAttachmentsPreview();

      // Отправка запроса
      generateResponse(content, assistantContainer, assistantDiv);
    }

    // Генерация ответа ИИ с потоковой обработкой
    async function generateResponse(content, assistantContainer, assistantDiv) {
      let answer = "";
      let thinkText = "";
      let isThinking = false;
      let discussionDiv;

      function updateDiscussion() {
        if (!discussionDiv && thinkText.trim()) {
          discussionDiv = document.createElement("div");
          discussionDiv.className = "discussion-section";
          discussionDiv.innerHTML = `<div class="discussion-header">Рассуждение:<span class="toggle-arrow">▼</span></div><div class="discussion-content"></div>`;
          assistantContainer.insertBefore(discussionDiv, assistantDiv);
        }
        if (discussionDiv) {
          discussionDiv.querySelector(".discussion-content").textContent = thinkText.trim();
        }
      }

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            content: content,
            sessionId: "default" 
          })
        });
        if (!response.ok) throw new Error("Ошибка сервера");

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
                  // Обработка рассуждений
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
                    // Добавляем форматирование кода
                    if (content.includes("```")) {
                      content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<div class="code-block"><pre>$2</pre></div>');
                    }
                    
                    if (isThinking) {
                      thinkText += content;
                      updateDiscussion();
                    } else {
                      answer += content;
                      assistantDiv.innerHTML = answer.trim(); // Используем innerHTML для форматирования
                    }
                  }
                  scrollToBottom();
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
        console.error("Ошибка получения ответа:", error);
        assistantDiv.textContent = "Ошибка получения ответа";
        const retryButton = document.createElement("button");
        retryButton.className = "retry-button";
        retryButton.textContent = "Повторить запрос";
        retryButton.addEventListener("click", function () {
          // При повторном запросе деактивируем кнопку "Отправить"
          isSending = true;
          updateSendButtonState();
          assistantDiv.innerHTML = `<div class="loading-spinner"></div>`;
          generateResponse(content, assistantContainer, assistantDiv);
        });
        assistantDiv.appendChild(retryButton);
      } finally {
        isSending = false;
        sendButton.classList.remove("disabled");
        updateSendButtonState();
        scrollToBottom();
      }
    }

    // Прокрутка чата вниз
    function scrollToBottom() {
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Делегирование кликов для сворачивания/разворачивания области рассуждения
    document.addEventListener("click", function (e) {
      const header = e.target.closest(".discussion-header");
      if (header && header.parentElement) {
        header.parentElement.classList.toggle("collapsed");
      }
    });

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-btn')) {
            const index = e.target.dataset.index;
            pendingAttachments.splice(index, 1);
            renderAttachmentsPreview();
        }
    });
  });
} else {
  console.error("Ошибка: document не найден. Этот скрипт должен запускаться в браузере.");
} 