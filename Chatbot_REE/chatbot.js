/**
 * chatbot.js - Frontend para el Backend de Redentia v2.1
 * Conecta con el backend en http://127.0.0.1:5000
 * Soporta respuestas canónicas y búsqueda vectorial
 */

// Configuración del backend
const BACKEND_URL = 'http://127.0.0.1:5000';

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

/**
 * Verifica la conexión con el backend
 */
async function checkBackendConnection() {
    try {
        updateConnectionStatus('connecting');
        
        const response = await fetch(`${BACKEND_URL}/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend conectado:', data);
            updateConnectionStatus('connected', data);
        } else {
            throw new Error('Backend no disponible');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        updateConnectionStatus('disconnected');
    }
}

/**
 * Actualiza el indicador de estado de conexión
 */
function updateConnectionStatus(status, data = null) {
    if (!connectionStatus) return;
    
    const statusConfig = {
        connecting: {
            icon: 'circle',
            color: '#FFA500',
            text: 'Conectando...'
        },
        connected: {
            icon: 'check_circle',
            color: '#4CAF50',
            text: data ? `Conectado - ${data.canonical_qa_count} Q&A cargadas` : 'Conectado'
        },
        disconnected: {
            icon: 'error',
            color: '#f44336',
            text: 'Desconectado'
        }
    };
    
    const config = statusConfig[status];
    connectionStatus.innerHTML = `<i class="fas fa-${config.icon}" style="color: ${config.color}"></i> ${config.text}`;
}

/**
 * Maneja el envío de mensajes
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
        // Enviar pregunta al backend
        const response = await fetch(`${BACKEND_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: message
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remover indicador de "escribiendo..."
        removeTypingIndicator(typingIndicator);
        
        // Mostrar respuesta del bot
        addBotMessage(data);
        
    } catch (error) {
        console.error('❌ Error al enviar mensaje:', error);
        
        // Remover indicador de "escribiendo..."
        removeTypingIndicator(typingIndicator);
        
        // Mostrar mensaje de error
        addBotMessage({
            answer: '❌ **Error de conexión**\n\nNo se pudo conectar con el servidor. Por favor, verifica que:\n\n• El backend esté ejecutándose en http://127.0.0.1:5000\n• No haya problemas de red o firewall\n• Los PDFs estén cargados correctamente',
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