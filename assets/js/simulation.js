


document.addEventListener('DOMContentLoaded', () => {
    const simulationMessage = document.getElementById('simulation-message');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-action-btn');
    const loadingSpinner = document.getElementById('loading-spinner');

    // --- Configuración de la API (Ollama/llama3) ---
    const OLLAMA_API_ENDPOINT = 'http://localhost:11434/api/generate';
    const LLM_MODEL = 'llama3'; 
    
    // El estado del juego se mantendrá en esta variable
    let simulationState = `
        Estado Actual: Inicio de la simulación.
        Instrucción: El usuario debe indicar su primera acción (ej, analizar, verificar o comprobar estado de la red eléctrica).
    `;
    
    // --- PROMPT DEL SISTEMA ---
    // Este prompt le dice al LLM que se comporte como el motor de la simulación
    const SYSTEM_PROMPT = `
        Genera simulaciones de operación eléctrica ficticias basadas en los Procedimientos de Operación (PO). Cada simulación debe representar un día completo de trabajo de un operador, dividido en 5 escenarios distintos, por ejemplo: subida de generación renovable, caída de demanda, sobrecarga en línea, variación de frecuencia y cierre de turno, aunque puedes inventar otros escenarios coherentes con los PO.

        Para cada escenario:
        Narrativa: Explica la situación con suficiente detalle y contexto técnico, de forma realista pero ficticia, como si fuera parte de una jornada completa. No debe superar las 150 palabras.
        Pista: Una pista por paso que ayude al jugador a completar la acción.
        Devolución: Texto que se muestra si la respuesta o acción es correcta para el contexto de la simulación.

        Requisitos:
        Mantener un lenguaje técnico pero accesible.
        Cada escenario debe ser distinto y coherente con la lógica de los PO, formando una jornada completa.
        Evitar información sensible o procedimientos reales de operación.
        La salida debe estar lista para usar como simulación interactiva de Nivel B.

        Formato sugerido de entrega:
        Escenario 1: Nombre
        Narrativa
        Pista

        Reglas:
        1. **Evalúa la acción del usuario** basándote en los Procedimientos de Operación (PO).
        2. **Responde narrando el resultado de la acción**. Si la acción es correcta y sigue los PO, describe el resultado y presenta el **siguiente paso lógico**.
        3. Si la acción es incorrecta, describe la consecuencia (ej: "el desvío empeora") y **pide una acción correctiva**.
        4. **Mantén la coherencia** con el último estado de la simulación.
        5. **Tu respuesta DEBE ser SOLAMENTE el texto narrativo** que debe aparecer en la interfaz. No uses prefijos, nombres o comentarios.
    `;
    
    // --- LÓGICA DE INTERACCIÓN ---

    /**
     * Envía la acción del usuario al LLM y actualiza la simulación.
     */
    async function sendActionToLLM(action) {
        
        // 1. Mostrar carga
        loadingSpinner.style.display = 'block';
        sendButton.disabled = true;
        userInput.disabled = true;
        
        // 2. Construir la historia completa para dar contexto al LLM
        const currentContext = `
            Contexto/Estado actual: ${simulationState}
            Acción del usuario: ${action}
            
            Basado en la acción del usuario y el contexto actual, continúa la simulación.
        `;

        // 3. Crear el cuerpo de la solicitud para Ollama
        const requestBody = {
            model: LLM_MODEL,
            // Utilizamos el prompt de sistema para guiar el comportamiento
            system: SYSTEM_PROMPT, 
            prompt: currentContext,
            stream: false,
        };

        try {
            const response = await fetch(OLLAMA_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                 throw new Error(`Error HTTP ${response.status}. Verifique la API y CORS.`);
            }
            
            const data = await response.json();
            const llmNarrative = data.response.trim();
            
            // 4. Actualizar la interfaz y el estado
            simulationMessage.innerHTML = llmNarrative.replace(/\n/g, '<br>');
            
            // Actualizar el estado para el siguiente turno (simplificado: usamos la última respuesta)
            simulationState = llmNarrative; 

        } catch (error) {
            console.error('Error en la simulación:', error);
            simulationMessage.innerHTML = `🚨 **ERROR DE CONEXIÓN:** No se pudo continuar la simulación. ${error.message}`;
        } finally {
            // 5. Ocultar carga y re-habilitar interfaz
            loadingSpinner.style.display = 'none';
            sendButton.disabled = false;
            userInput.disabled = false;
            userInput.value = '';
        }
    }

    /**
     * Función principal al enviar la acción.
     */
    function handleSendAction() {
        const action = userInput.value.trim();
        if (action) {
            sendActionToLLM(action);
        }
    }
    
    // --- LISTENERS ---
    sendButton.addEventListener('click', handleSendAction);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendAction();
        }
    });

    // Iniciar la simulación con un mensaje de bienvenida
    simulationMessage.innerHTML = `
        **Indique su PRIMERA acción operativa (ej: "Verificar estado de la red eléctrica").**
    `;
    
    // Ocultar spinner al inicio
    loadingSpinner.style.display = 'none';
});