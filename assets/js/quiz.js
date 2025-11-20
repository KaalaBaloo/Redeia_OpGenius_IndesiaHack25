document.addEventListener('DOMContentLoaded', () => {
    const quizContent = document.getElementById('quiz-content');
    const loadingMessage = document.getElementById('loading-message');
    const nextButton = document.getElementById('next-question-btn');
    
    // --- Configuración de la API (Ollama/llama3) ---
    const OLLAMA_API_ENDPOINT = 'http://localhost:11434/api/generate'; 
    const LLM_MODEL = 'llama3'; 
    
    let currentQuestionData = null; // Almacenará la pregunta y la respuesta correcta
    let questionCounter = 1;
    // ---------------------------------------------

    // --- PROMPT DE INGENIERÍA PARA OBTENER JSON ---
    // Le pedimos al LLM que nos dé la respuesta en el formato JSON que necesitamos.
    const LLM_PROMPT = `
        Genera una pregunta de autoevaluación de opción múltiple (A, B, C, D) 
        sobre 'Seguridad y criterios de operación (PO 1.x) del sistema eléctrico español'.
        La pregunta debe tener cuatro opciones y solo una debe ser correcta.
        
        Devuelve la respuesta SOLAMENTE en formato JSON, siguiendo este esquema:
        {
          "topic": "El tópico o título del PO",
          "question_number": ${questionCounter},
          "question": "La pregunta sobre el PO.",
          "options": {
            "A": "Opción A",
            "B": "Opción B",
            "C": "Opción C",
            "D": "Opción D"
          },
          "correct_answer": "La letra correcta (A, B, C o D)"
        }
        Asegúrate de que la salida sea un JSON válido.
    `;
    
    // --- LÓGICA DE INTERFAZ ---

    /**
     * Muestra la pregunta y las opciones en la interfaz.
     */
    function renderQuestion(data) {
        currentQuestionData = data;
        
        // 1. Actualizar encabezado
        document.getElementById('question-number').textContent = data.question_number;
        document.getElementById('quiz-topic').textContent = data.topic;

        // 2. Construir el HTML de la pregunta y opciones
        let html = `
            <div class="pill">Pregunta ${data.question_number}/12</div>
            <div class="question-box">${data.question}</div>
            <div class="subtitle">Elige la opción correcta:</div>
            <div class="options">
        `;
        
        // Iterar sobre las opciones
        const optionsKeys = Object.keys(data.options);
        optionsKeys.forEach(key => {
            html += `
                <div class="option" data-answer="${key}">
                    <b>${key})</b> ${data.options[key]}
                </div>
            `;
        });

        html += '</div>';
        
        // 3. Insertar y añadir Listeners
        quizContent.innerHTML = html;
        const options = quizContent.querySelectorAll('.option');
        options.forEach(option => {
            option.addEventListener('click', handleAnswerClick);
        });

        loadingMessage.style.display = 'none';
        quizContent.style.display = 'block';
    }

    /**
     * Maneja el clic en una opción.
     */
    function handleAnswerClick(event) {
        const selectedOption = event.currentTarget;
        const selectedAnswer = selectedOption.getAttribute('data-answer');
        const correctAnswer = currentQuestionData.correct_answer;
        
        // Desactivar clics en todas las opciones después de la selección
        quizContent.querySelectorAll('.option').forEach(option => {
            option.removeEventListener('click', handleAnswerClick);
            option.style.pointerEvents = 'none'; 
        });

        // Marcar la respuesta seleccionada
        if (selectedAnswer === correctAnswer) {
            // RESPUESTA CORRECTA: Marcar verde
            selectedOption.classList.add('correct-answer');
            loadingMessage.className = 'alert alert-success text-center mt-3';
            loadingMessage.innerHTML = '¡Respuesta Correcta! Excelente conocimiento del PO.';
        } else {
            // RESPUESTA INCORRECTA: Marcar rojo y mostrar la correcta en verde
            selectedOption.classList.add('incorrect-answer');
            // Encontrar la opción correcta y marcarla
            quizContent.querySelector(`[data-answer="${correctAnswer}"]`).classList.add('correct-answer');
            
            loadingMessage.className = 'alert alert-danger text-center mt-3';
            loadingMessage.innerHTML = `Respuesta Incorrecta. La opción correcta era **${correctAnswer}**.`;
        }

        loadingMessage.style.display = 'block';
        nextButton.style.display = 'block'; // Mostrar botón Siguiente
    }

    // --- LÓGICA DE CONEXIÓN LLM ---

    /**
     * Llama a la API de Ollama para obtener la pregunta en JSON.
     */
    async function fetchQuestion() {
        // Resetear la interfaz
        quizContent.style.display = 'none';
        nextButton.style.display = 'none';
        loadingMessage.className = 'alert alert-info text-center';
        loadingMessage.innerHTML = 'Generando pregunta con el LLM...';
        loadingMessage.style.display = 'block';

        const requestBody = {
            model: LLM_MODEL,
            prompt: LLM_PROMPT.replace(`"question_number": ${questionCounter},`, `"question_number": ${questionCounter},`),
            stream: false,
            // Importante: forzar la salida JSON
            format: "json", 
            options: {
                temperature: 0.7 // Un poco de creatividad para variar preguntas
            }
        };

        try {
            const response = await fetch(OLLAMA_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                 throw new Error(`Error HTTP ${response.status}. ¿Ollama está corriendo y configurado con CORS?`);
            }
            
            const data = await response.json();
            
            // Ollama devuelve el JSON dentro del campo 'response'
            const jsonText = data.response; 
            const questionData = JSON.parse(jsonText);
            
            renderQuestion(questionData);

        } catch (error) {
            console.error('Error al generar la pregunta del LLM:', error);
            loadingMessage.className = 'alert alert-danger text-center';
            loadingMessage.innerHTML = `🚨 **ERROR de Conexión:** No se pudo cargar la pregunta. ${error.message}`;
            nextButton.style.display = 'block'; // Permitir avanzar o reintentar
        }
    }
    
    // --- LISTENERS ---

    // Al hacer clic en Siguiente, incrementamos el contador y cargamos la nueva pregunta
    nextButton.addEventListener('click', () => {
        questionCounter++;
        // Resetear el prompt con el nuevo número de pregunta
        LLM_PROMPT.replace(/("question_number": )(\d+)/, `$1${questionCounter}`);
        fetchQuestion();
    });

    // Iniciar el quiz
    fetchQuestion();
});