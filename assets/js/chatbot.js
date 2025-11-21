
/**
 * chatbot.js - Frontend para el Backend de Redentia v2.1
 * Conecta con el backend en http://127.0.0.1:5000
 * Soporta respuestas canónicas y búsqueda vectorial
 */

// Configuración del backend
const BACKEND_URL = 'http://127.0.0.1:5000';

// Configuración para el paso de simplificación con LLama 3 (Ollama)
// NOTA: Esto asume que el backend de Python (en 5000) YA USA LLAMA 3 o que tienes otro endpoint LLM disponible.
// Si tu backend en :5000 ya devuelve la respuesta final, la simplificación debería hacerse allí.
// Para este ejemplo, simularé que el backend en :5000 devuelve la respuesta RAW (sin simplificar), 
// y el frontend llama a Ollama directamente para simplificar.
const OLLAMA_API_ENDPOINT = 'http://localhost:11434/api/generate'; // Usado solo para simplificación
const LLM_MODEL_SIMPLIFY = 'llama3'; // Modelo LLM para simplificación

// Estado de la aplicación
let isWaitingForResponse = false;

// Elementos del DOM
let chatBody;
let userInput;
let sendBtn;
let connectionStatus;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando ChatBot Redentia...');
    
    // Obtener referencias a elementos del DOM
    chatBody = document.getElementById('chat-body');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    connectionStatus = document.getElementById('connection-status');
    
    // Event listeners
    sendBtn.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    // Verificar conexión con el backend
    checkBackendConnection();
    
    // Enfocar el input
    userInput.focus();
});

// --- Funciones de Utilidad (checkBackendConnection, updateConnectionStatus, etc. se mantienen) ---

/**
 * Maneja el envío de mensajes (Modificado para la doble llamada)
 */
async function handleSendMessage() {
    const message = userInput.value.trim();
    
    if (!message || isWaitingForResponse) {
        return;
    }
    
    // Limpiar input
    userInput.value = '';
    
    // Remover mensaje flotante si existe
    removeFloatingPrompt();
    
    // Mostrar mensaje del usuario
    addUserMessage(message);
    
    // Deshabilitar input mientras se procesa
    isWaitingForResponse = true;
    userInput.disabled = true;
    sendBtn.disabled = true;
    
    // Mostrar indicador de "escribiendo..."
    const typingIndicator = showTypingIndicator();
    
    try {
        // --- PASO 1: Obtener respuesta inicial del backend (Técnica) ---
        const backendResponse = await fetch(`${BACKEND_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: message
            })
        });
        
        if (!backendResponse.ok) {
            throw new Error(`Error HTTP: ${backendResponse.status}`);
        }
        
        const data = await backendResponse.json();
        
        // --- PASO 2: Simplificar la respuesta obtenida ---
        const simplifiedAnswer = await simplifyBotResponse(data.answer, data.methodology, message);
        
        // Reemplazar la respuesta técnica por la simplificada
        data.answer = simplifiedAnswer;
        
        // Remover indicador de "escribiendo..."
        removeTypingIndicator(typingIndicator);
        
        // Mostrar respuesta del bot
        addBotMessage(data);
        
    } catch (error) {
        console.error('❌ Error al enviar mensaje o simplificar:', error);
        
        // Remover indicador de "escribiendo..."
        removeTypingIndicator(typingIndicator);
        
        // Mostrar mensaje de error
        addBotMessage({
            answer: '❌ **Error de procesamiento**\n\nHubo un problema al contactar al backend o al simplificar la respuesta. Verifique su conexión y el servicio de Ollama (llama3).',
            sources: [],
            methodology: 'ERROR'
        });
    } finally {
        // Rehabilitar input
        isWaitingForResponse = false;
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

/**
 * Llama al LLM (Llama 3 en Ollama) para simplificar una respuesta.
 * Solo simplifica si la respuesta proviene de una búsqueda en POs (vectorial).
 */
async function simplifyBotResponse(rawText, methodology, query) {
    // Si la respuesta es una respuesta canónica o un error, no la simplificamos
    if (methodology !== 'CONCISE_VECTOR' && methodology !== 'DETAILED') {
        return rawText;
    }

    const SIMPLIFICATION_PROMPT = `
    Analiza la siguiente pregunta ${query}. Si tiene relacon con procedimientos de operación o documentos técnicos de la red eléctrica, convierte el texto proporcionado en un formato claro y profesional para que pueda ser comprendido por un operador de forma efectiva. Si no tiene relación, responde únicamente con "No tengo suficiente información para responder a esa pregunta." y omite el resto del prompt.

    Convierte el siguiente texto sobre procedimientos de operación o documento técnico relacionado con la operación de la red eléctrica en un formato claro y profesional, para que pueda ser comprendido por un operador de forma efectiva. Mantén la precisión técnica y usa un lenguaje directo y comprensible, evitando jerga innecesaria. Asegúrate de que todos los detalles importantes y técnicos estén incluidos y sean fáciles de entender para la correcta ejecución de las tareas operativas.

    Si no dispones de suficiente información para responder de manera adecuada o precisa, responde únicamente con el siguiente mensaje:
    "No tengo suficiente información para responder a esa pregunta."

    No agregues información adicional ni comentarios innecesarios en estos casos. Utiliza documentación disponible online, como la web de Redentia o el BOE, para complementar y verificar los procedimientos cuando sea necesario.
        
        TEXTO ORIGINAL:
        ---
        ${rawText}
        ---
        RESPUESTA:
    `;

    const requestBody = {
        model: LLM_MODEL_SIMPLIFY,
        prompt: SIMPLIFICATION_PROMPT,
        stream: false,
        options: {
            temperature: 0.1 // Baja temperatura para mantener la precisión
        }
    };

    try {
        const response = await fetch(OLLAMA_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            // Si falla la simplificación, devolvemos el texto original
            console.warn(`⚠️ Error al llamar a Ollama para simplificar (${response.status}). Devolviendo texto original.`);
            return rawText; 
        }
        
        const data = await response.json();
        return data.response.trim();

    } catch (error) {
        // Si hay un error de red, devolvemos el texto original
        console.warn('⚠️ Fallo de conexión para la simplificación. Devolviendo texto original.', error);
        return rawText; 
    }
}

/**
 * Añade un mensaje del usuario al chat
 */
function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>${escapeHtml(text)}</p>
        </div>
        <span class="material-icons user-avatar">
            person
        </span>
    `;
    
    chatBody.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Añade un mensaje del bot al chat
 */
function addBotMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    // Formatear la respuesta
    const formattedAnswer = formatBotResponse(data.answer);
    
    // Construir HTML del mensaje
    let messageHTML = `
        <span class="material-icons bot-avatar">
            chat_bubble_outline
        </span>
        <div class="message-content">
            ${formattedAnswer}
    `;
    
    // Añadir metadata si existe
    if (data.methodology) {
        const methodologyLabel = getMethodologyLabel(data.methodology, data.match);
        messageHTML += `
            <div class="message-metadata">
                <span class="methodology-badge">${methodologyLabel}</span>
        `;
        
        // Mostrar fuentes si existen
        if (data.sources && data.sources.length > 0) {
            messageHTML += `
                <span class="sources-label">
                    <i class="fas fa-file-pdf"></i> Fuentes consultadas:
                </span>
                <div class="sources-list">
                    ${data.sources.map(source => `<span class="source-item">${source}</span>`).join('')}
                </div>
            `;
        }
        
        // Mostrar información adicional
        if (data.documentos_consultados) {
            messageHTML += `<span class="doc-count">${data.documentos_consultados} documentos analizados</span>`;
        }
        
        if (data.complejidad) {
            messageHTML += `<span class="complexity">Complejidad: ${data.complejidad}</span>`;
        }
        
        messageHTML += `</div>`;
    }
    
    messageHTML += `</div>`;
    
    messageDiv.innerHTML = messageHTML;
    chatBody.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Formatea la respuesta del bot con markdown simple
 */
function formatBotResponse(text) {
    if (!text) return '<p>Sin respuesta</p>';
    
    // Escapar HTML
    text = escapeHtml(text);
    
    // Convertir saltos de línea a <br>
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');
    
    // Negritas con **texto**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Listas con viñetas (• o -)
    text = text.replace(/^[•\-]\s+(.+)/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Secciones con [TITULO]
    text = text.replace(/\[(.*?)\]/g, '<h3 class="section-title">$1</h3>');
    
    // Envolver en párrafo si no hay etiquetas
    if (!text.includes('<p>') && !text.includes('<h3>') && !text.includes('<ul>')) {
        text = `<p>${text}</p>`;
    }
    
    return text;
}

/**
 * Obtiene la etiqueta de metodología
 */
function getMethodologyLabel(methodology, match) {
    const labels = {
        'CANNED': match === 'exact' ? '🎯 Respuesta Exacta' : '✨ Respuesta Canónica',
        'CONCISE_VECTOR': '📚 Búsqueda en POs',
        'DETAILED': '🔍 Análisis Detallado',
        'GUIDANCE': '💡 Guía de Consulta',
        'ERROR': '❌ Error'
    };
    
    return labels[methodology] || '📋 Respuesta';
}

/**
 * Muestra el indicador de "escribiendo..."
 */
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    typingDiv.innerHTML = `
        <span class="material-icons bot-avatar">
            chat_bubble_outline
        </span>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <p style="font-size: 0.9em; color: #666; margin-top: 5px;">Analizando Procedimientos de Operación...</p>
        </div>
    `;
    
    chatBody.appendChild(typingDiv);
    scrollToBottom();
    
    return typingDiv;
}

/**
 * Remueve el indicador de "escribiendo..."
 */
function removeTypingIndicator(indicator) {
    if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
    }
}

/**
 * Remueve el mensaje flotante inicial
 */
function removeFloatingPrompt() {
    const floatingPrompt = document.querySelector('.floating-prompt');
    if (floatingPrompt) {
        floatingPrompt.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            if (floatingPrompt.parentNode) {
                floatingPrompt.parentNode.removeChild(floatingPrompt);
            }
        }, 300);
    }
}

/**
 * Hace scroll al final del chat
 */
function scrollToBottom() {
    setTimeout(() => {
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 100);
}

/**
 * Escapa caracteres HTML para prevenir XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Exportar funciones para debugging
window.chatbotDebug = {
    checkConnection: checkBackendConnection,
    sendMessage: handleSendMessage,
    backendUrl: BACKEND_URL
};

// En la función addUserMessage en chatbot.js:
messageDiv.innerHTML = `
    <div class="message-content">
        <p>${escapeHtml(text)}</p>
    </div>
    <span class="material-icons user-avatar">
        person
    </span>
`;