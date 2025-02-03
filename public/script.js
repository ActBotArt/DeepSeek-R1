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

    // Обработка клика по кнопке "скрепка" – открытие диалога выбора файла
    uploadButton.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });

    // Обработка выбора файла
    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) {
        uploadFile(file);
      }
      e.target.value = "";
    });

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

    // Рендеринг области предварительного просмотра вложений
    function renderAttachmentsPreview() {
      if (pendingAttachments.length === 0) {
        attachmentsPreview.style.display = "none";
        attachmentsPreview.innerHTML = "";
      } else {
        attachmentsPreview.style.display = "flex";
        attachmentsPreview.innerHTML = "";
        pendingAttachments.forEach((att, index) => {
          const attDiv = document.createElement("div");
          attDiv.className = "attachment-preview-item";
          
          // Если файл слишком большой – добавляем красную обводку
          if (att.tooLarge) {
            attDiv.style.border = "2px solid red";
          }
          
          if (isImage(att)) {
            const img = document.createElement("img");
            img.src = att.url;
            img.alt = att.fileName;
            attDiv.appendChild(img);
          } else {
            const link = document.createElement("a");
            link.href = att.url;
            link.target = "_blank";
            link.textContent = att.fileName;
            attDiv.appendChild(link);
          }
          
          if (att.tooLarge) {
            const warning = document.createElement("div");
            warning.textContent = "Файл слишком большой для обработки";
            warning.style.color = "red";
            warning.style.fontSize = "12px";
            attDiv.appendChild(warning);
          }
          
          // Кнопка удаления вложения
          const removeBtn = document.createElement("button");
          removeBtn.className = "remove-btn";
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", function () {
            removeAttachment(index);
          });
          attDiv.appendChild(removeBtn);
          attachmentsPreview.appendChild(attDiv);
        });
      }
      updateSendButtonState();
    }

    function removeAttachment(index) {
      pendingAttachments.splice(index, 1);
      renderAttachmentsPreview();
    }

    // Функция загрузки файла с проверками по типу и размеру
    async function uploadFile(file) {
      // Разрешаем только изображения и текстовые файлы
      if (!file.type.startsWith("image/") && !file.type.startsWith("text/")) {
        console.error("Недопустимый тип файла. Разрешены только изображения и текстовые файлы.");
        return;
      }

      // Если файл превышает лимит, помечаем его и не отправляем на сервер
      if (file.size > MAX_FILE_SIZE) {
        if (file.type.startsWith("image/")) {
          let preview = "";
          try {
            preview = await readFileAsDataURL(file);
          } catch (err) {
            console.error("Ошибка при чтении изображения:", err);
          }
          pendingAttachments.push({
            url: preview,
            fileName: file.name,
            type: file.type,
            tooLarge: true
          });
        } else if (file.type.startsWith("text/")) {
          pendingAttachments.push({
            fileName: file.name,
            type: file.type,
            textContent: "Файл слишком большой для обработки",
            tooLarge: true
          });
        }
        renderAttachmentsPreview();
        return;
      }

      // Если размер файла в пределах лимита, продолжаем загрузку
      if (file.type.startsWith("image/")) {
        let base64Data = "";
        try {
          base64Data = await readFileAsDataURL(file);
        } catch (err) {
          console.error("Ошибка чтения файла:", err);
        }
        const formData = new FormData();
        formData.append("image", file);
        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });
          if (!response.ok) throw new Error("Ошибка загрузки файла");
          const data = await response.json();
          if (data.url) {
            pendingAttachments.push({
              url: data.url,
              fileName: file.name,
              type: file.type,
              base64: base64Data,
              tooLarge: false
            });
            renderAttachmentsPreview();
          }
        } catch (error) {
          console.error("Ошибка загрузки файла:", error);
        }
      } else if (file.type.startsWith("text/")) {
        let textContent = "";
        try {
          textContent = await readFileAsText(file);
        } catch (err) {
          console.error("Ошибка чтения текстового файла:", err);
        }
        const formData = new FormData();
        // Используем то же поле для отправки
        formData.append("image", file);
        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });
          if (!response.ok) throw new Error("Ошибка загрузки файла");
          const data = await response.json();
          if (data.url) {
            pendingAttachments.push({
              url: data.url,
              fileName: file.name,
              type: file.type,
              textContent: textContent,
              tooLarge: false
            });
            renderAttachmentsPreview();
          }
        } catch (error) {
          console.error("Ошибка загрузки файла:", error);
        }
      }
    }

    // Отправка сообщения вместе с вложениями
    async function sendMessage() {
      if (isSending) return;
      // Если в pendingAttachments есть хотя бы один файл с tooLarge, не даём отправить сообщение
      if (pendingAttachments.some(att => att.tooLarge)) {
        return;
      }

      const promptText = promptArea.value.trim();
      if (!promptText && pendingAttachments.length === 0) return;

      isSending = true;
      sendButton.classList.add("disabled");
      updateSendButtonState();

      // Формируем запрос с данными вложений (содержимое или уведомление о слишком большом файле)
      let attachmentsInfo = "";
      pendingAttachments.forEach(att => {
        if (att.tooLarge) {
          attachmentsInfo += `[${att.type.startsWith("image/") ? "Изображение" : "Файл"} ${att.fileName}]:\nФайл слишком большой для обработки.\n\n`;
        } else {
          if (att.type.startsWith("image/")) {
            attachmentsInfo += `[Изображение ${att.fileName}]:\n${att.base64}\n\n`;
          } else {
            attachmentsInfo += `[Текстовый документ ${att.fileName}]:\n${att.textContent}\n\n`;
          }
        }
      });
      const finalPrompt = attachmentsInfo + promptText;

      // Создаём контейнер для сообщения пользователя
      const messageContainer = document.createElement("div");
      messageContainer.className = "message-container";

      // Добавляем вложения (если имеются)
      if (pendingAttachments.length > 0) {
        const attachmentsDiv = document.createElement("div");
        attachmentsDiv.className = "attachment-message-group";
        pendingAttachments.forEach(att => {
          const attDiv = document.createElement("div");
          attDiv.className = "attachment-message";
          if (isImage(att)) {
            const img = document.createElement("img");
            img.src = att.url;
            img.alt = att.fileName;
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

      // Очищаем поле ввода и предварительный просмотр вложений
      promptArea.value = "";
      promptArea.style.height = "auto";
      pendingAttachments = [];
      renderAttachmentsPreview();

      // Создаём контейнер для ответа ИИ
      const assistantContainer = document.createElement("div");
      assistantContainer.className = "assistant-message-container";
      chatBox.appendChild(assistantContainer);

      const assistantDiv = document.createElement("div");
      assistantDiv.className = "assistant-message";
      assistantDiv.innerHTML = `<div class="loading-spinner"></div>`;
      assistantContainer.appendChild(assistantDiv);
      scrollToBottom();

      // Отправляем запрос к ИИ с финальным промптом (вложения + текст)
      generateResponse(finalPrompt, assistantContainer, assistantDiv);
    }

    // Генерация ответа ИИ с потоковой обработкой
    async function generateResponse(prompt, assistantContainer, assistantDiv) {
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
          body: JSON.stringify({ prompt, sessionId: "default" })
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
                      assistantDiv.textContent = answer.trim();
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
          generateResponse(prompt, assistantContainer, assistantDiv);
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
  });
} else {
  console.error("Ошибка: document не найден. Этот скрипт должен запускаться в браузере.");
} 