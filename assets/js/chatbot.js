document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const chatBody = document.getElementById('chat-body');

    // --- Configuración para un LLM Open Source (Ej: Ollama) ---
    // URL por defecto para la API de Ollama
    const OLLAMA_API_ENDPOINT = 'http://localhost:11434/api/generate'; 
    
    // El modelo Open Source que quieres usar (debe estar descargado en Ollama)
    // Modelos populares: "llama3", "mixtral", "mistral"
    const LLM_MODEL = 'llama3'; 
    // ---------------------------------------------

    /**
     * Crea y añade un nuevo mensaje al cuerpo del chat.
     * ... (Función appendMessage es la misma que en el ejemplo anterior)
     */
    function appendMessage(text, sender) {
        const messageWrapper = document.createElement('div');
        const messageContent = document.createElement('div');
        
        messageWrapper.classList.add('message', `${sender}-message`);
        messageContent.classList.add('message-content');

        if (sender === 'bot') {
            const botAvatar = document.createElement('span');
            botAvatar.classList.add('material-icons', 'bot-avatar');
            botAvatar.textContent = 'chat_bubble_outline';
            messageWrapper.appendChild(botAvatar);
        }

        const paragraph = document.createElement('p');
        // Usamos innerHTML si queremos que el bot devuelva texto con saltos de línea (simples \n)
        paragraph.innerHTML = text.replace(/\n/g, '<br>'); 
        messageContent.appendChild(paragraph);

        messageWrapper.appendChild(messageContent);
        chatBody.appendChild(messageWrapper);
        
        chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    /**
     * Realiza la llamada a la API de Ollama para obtener la respuesta.
     * @param {string} message - El mensaje del usuario.
     */
    async function fetchLLMResponse(message) {
        // Añadir mensaje de carga
        appendMessage('🤖 El ChatBot (usando ' + LLM_MODEL + ') está pensando...', 'bot');
        const loadingMessage = chatBody.lastElementChild; 
        const loadingContent = loadingMessage.querySelector('.message-content p');

        // Estructura de la solicitud para la API de /api/generate de Ollama
        const requestBody = {
            model: LLM_MODEL,
            prompt: message,
            stream: false // Para recibir la respuesta completa de una vez
        };

        try {
            const response = await fetch(OLLAMA_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}. Asegúrate de que Ollama esté corriendo en ${OLLAMA_API_ENDPOINT} y que el modelo '${LLM_MODEL}' esté instalado.`);
            }
            
            const data = await response.json();
            
            // La respuesta de Ollama tiene el texto en el campo 'response'
            const llmText = data.response.trim();
            
            // Reemplazar el mensaje de carga con la respuesta real
            loadingMessage.remove(); 
            appendMessage(llmText, 'bot');

        } catch (error) {
            console.error('Error al obtener respuesta del LLM:', error);
            // Mostrar un mensaje de error más claro al usuario
            loadingContent.innerHTML = '🚨 **ERROR de Conexión:** ' + error.message;
            loadingContent.style.backgroundColor = '#ffcdd2'; // Color de error
        }
    }

    /**
     * Función principal para manejar el envío de mensajes.
     */
    function handleSendMessage() {
        const message = userInput.value.trim();

        if (message) {
            // Ocultar el prompt flotante
            const floatingPrompt = document.querySelector('.floating-prompt');
            if (floatingPrompt) {
                floatingPrompt.style.display = 'none';
            }
            
            // Mostrar mensaje de usuario
            appendMessage(message, 'user');
            
            // Llamar a la API
            fetchLLMResponse(message);
            
            // Limpiar input
            userInput.value = '';
        }
    }

    // --- Event Listeners ---
    sendButton.addEventListener('click', handleSendMessage);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });
});