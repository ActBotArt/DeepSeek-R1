<!-- markdownlint-disable first-line-h1 -->
<!-- markdownlint-disable html -->
<!-- markdownlint-disable no-duplicate-header -->

<div align="center">
  <img src="https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/logo.svg?raw=true" width="60%" alt="DeepSeek-V3" />
</div>
<hr>
<div align="center" style="line-height: 1;">
  <a href="https://www.deepseek.com/" target="_blank" style="margin: 2px;">
    <img alt="Homepage" src="https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/badge.svg?raw=true" style="display: inline-block; vertical-align: middle;"/>
  </a>
  <a href="https://chat.deepseek.com/" target="_blank" style="margin: 2px;">
    <img alt="Chat" src="https://img.shields.io/badge/🤖%20Chat-DeepSeek%20V3-536af5?color=536af5&logoColor=white" style="display: inline-block; vertical-align: middle;"/>
  </a>
</div>

---

## 1. Introduction
Recently, **DeepSeek-R1** was introduced—a lightweight and efficient language model designed for streamlined deployment in resource-constrained environments, such as Node.js. Unlike its larger counterpart, **DeepSeek-V3**, which utilizes a Mixture of Experts (MoE) architecture with 671 billion parameters (activating only 37 billion per token), **DeepSeek-R1** is optimized for speed and simplicity. With **7 billion parameters**, it ensures responsive performance while maintaining minimal resource requirements. This adaptation was developed in response to a sudden surge in demand that temporarily overwhelmed the API service, providing a reliable and scalable solution for real-time applications.  

## 2. Brief Description of DeepSeek-R1-7b
**DeepSeek-R1-7b** is a lightweight language model with **7 billion parameters**, optimized for local deployment. Designed for Node.js environments, it ensures low latency and eliminates reliance on cloud services. While retaining core capabilities of its parent model (**DeepSeek-V3**), such as efficient resource management, **DeepSeek-R1-7b** features a simplified architecture for rapid deployment on standard hardware. Key advantages include:  
- **Data Privacy:** On-device data processing.  
- **Low Computational Costs:** Optimized for CPU with 8GB RAM.  
- **Seamless Integration:** Pre-built npm packages for quick application integration.  

## 3 How To Run Locally (NodeJS)

  1. You need to download and install [Ollama](https://ollama.com/download).

---

  2. Running Ollama on Different Operating Systems

#### Linux:  
Open the terminal: Ctrl + Alt + T or search for "Terminal" in the applications.  

#### macOS:  
Open the terminal: Cmd + Space and type "Terminal" or find it in the "Utilities" folder.  

#### Windows:  
Open the command prompt: Win + R, type cmd, and press Enter.  

---

Paste the command:  
```bash  
ollama run deepseek-r1:7b  
```  
Press Enter. The model will start downloading.

---

  3. Download and install [NodeJS version 20.16.0](https://node-js-org.vercel.app/en/blog/release/v20.16.0).

---

  4. Cloning the Repository  
Open the terminal (Linux/macOS) or command prompt (Windows).  
Paste the command to clone the repository:  
```bash  
git clone <repository_link>  
```

---

  5. Running the Project  
Navigate to the directory with the cloned repository:  
```bash  
cd <repository_folder_name>  
```

---

  6. Install Libraries  
```bash  
npm install express cors multer uuid axios  
```

---

  7. Run the Script

On Windows: Run the .bat file.
On Linux/macOS

Через команду:
   ```bash
   node StreamFlow.js
   ```
Через исполняемый файл:
   - Создайте файл `start.sh`
     ```bash
     touch start.sh
     ```
   - Добавьте в него:
     ```bash
     #!/bin/bash
     node StreamFlow.js
     ```
   - Сделайте его исполняемым:
     ```bash
     chmod +x start.sh
     ```
   - Запустите:
     ```bash
     ./start.sh
     ```

---

  8. Usage  
After completing all the steps, the project will be running locally, and you can start using it.

Notes:  
Ensure that all necessary dependencies and tools are installed.  
If errors occur, check if Ollama and NodeJS are installed correctly and if all steps in the instructions were followed properly.













