let currentQuestions = [];
let currentIndex = 0;
let score = 0;

// --- CONEXIÓN CON OLLAMA ---
async function startLocalGeneration() {
    // Referencias a elementos del DOM
    const difficulty = document.getElementById('difficulty').value;
    const specificPoList = document.getElementById('specific-po').value;
    
    // NOTA: Si no tienes un input con id="model-name", usa un string fijo:
    // const model = document.getElementById('model-name') ? document.getElementById('model-name').value : "llama3";
    const model = "gemma3:12b"; // O el modelo que tengas instalado (ej: mistral, llama2, etc)

    // 1. MOSTRAR PANTALLA DE CARGA
    const overlay = document.getElementById('full-loading-screen');
    const overlayText = document.getElementById('overlay-text');
    
    overlay.style.display = 'flex'; // Mostramos el overlay
    overlayText.innerText = "Analizando P.O. solicitados...";

    const prompt = `
    Genera un objeto JSON con 5 preguntas técnicas tipo test sobre los "Procedimientos de Operación (P.O.) del sistema eléctrico español".
    
    El contenido de las preguntas debe centrarse ÚNICAMENTE en estos P.O.: ${specificPoList}.
    
    Dificultad: ${difficulty}.
    
    Usa EXACTAMENTE este esquema JSON (sin markdown, solo json puro):
    {
        "preguntas": [
            {
                "po": "P.O. X.X", 
                "texto": "¿Pregunta aquí?",
                "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
                "correcta": 0,
                "dificultad": "${difficulty}"
            }
        ]
    }
    IMPORTANTE: 
    - "correcta" es el índice numérico (0, 1, 2 o 3).
    - NO escribas texto introductorio.
    `;

    try {
        overlayText.innerText = "Generando preguntas con IA...";
        
        const response = await fetch("http://localhost:11434/api/chat", { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gemma3:12b", // O el modelo que tengas instalado
                messages: [{ role: "user", content: prompt }],
                format: "json",
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error("Fallo de conexión con Ollama. Revisa si está ejecutándose.");
        }

        overlayText.innerText = "Procesando respuesta...";
        const data = await response.json();
        
        // Parseamos la respuesta
        const contentObj = JSON.parse(data.message.content);
        
        if (!contentObj.preguntas || contentObj.preguntas.length === 0) {
            throw new Error("La IA no devolvió preguntas válidas.");
        }

        currentQuestions = contentObj.preguntas;
        
        // 2. OCULTAR CARGA E INICIAR JUEGO
        overlay.style.display = 'none'; 
        startGame();

    } catch (error) {
        // Si falla, quitamos la carga y mostramos error
        overlay.style.display = 'none';
        alert("ERROR: " + error.message + "\n\nAsegúrate de tener Ollama corriendo (ollama serve).");
        console.error(error);
    }
}

// --- FUNCIONES AUXILIARES DEL JUEGO ---

function updateStatus(msg) {
    // Esta función ya no es crítica porque usamos el overlay, pero la dejamos por si acaso
    const statusText = document.getElementById('status-text');
    if(statusText) statusText.innerText = msg;
}

function startGame() {
    currentIndex = 0;
    score = 0;
    showScreen('quiz-screen');
    loadQuestion();
}
function loadQuestion() {
    const q = currentQuestions[currentIndex];
    
    document.getElementById('progress-text').innerText = `Pregunta ${currentIndex + 1} / ${currentQuestions.length}`;
    document.getElementById('question-text').innerText = `[${q.po}] ${q.texto}`;

    const container = document.getElementById('options-container');
    container.innerHTML = '';

    q.opciones.forEach((opt, idx) => {
        const btn = document.createElement('button');
        // CAMBIO: Usamos 'option-btn' que definimos en tu CSS unificado
        btn.className = 'option-btn'; 
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(idx, btn);
        container.appendChild(btn);
    });
}

function handleAnswer(selectedIdx, btn) {
    const q = currentQuestions[currentIndex];
    const correctIdx = q.correcta;
    // Seleccionamos todos los botones generados
    const buttons = document.getElementById('options-container').querySelectorAll('button');
    
    const pointsMap = { "Baja": 1, "Media": 2, "Alta": 3 };
    const pointsToAdd = pointsMap[q.dificultad] || 1;

    // 1. Deshabilitar todos los botones para que no se pueda pulsar más veces
    buttons.forEach(b => b.disabled = true);

    // 2. Lógica de colores
    if (selectedIdx === correctIdx) {
        // CASO ACIERTO: El botón pulsado se pone VERDE
        score += pointsToAdd;
        btn.classList.add('correct');
        btn.innerHTML += ` <span style="float:right; font-weight:bold;">+${pointsToAdd} PTS</span>`;
    } else {
        // CASO ERROR: 
        // a) El botón pulsado se pone ROJO
        btn.classList.add('incorrect');
        
        // b) Buscamos la respuesta correcta y la ponemos VERDE para que el usuario aprenda
        buttons[correctIdx].classList.add('correct');
    }

    // Actualizar puntuación
    document.getElementById('score-badge').innerText = score + " Pts";

    // Pasar a la siguiente
    setTimeout(() => {
        currentIndex++;
        if (currentIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            endGame();
        }
    }, 2500);
}

function endGame() {
    showScreen('result-screen');
    document.getElementById('final-score').innerText = score;
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.style.display = 'none'; // Ocultar todas
        s.classList.remove('active');
    });
    const activeScreen = document.getElementById(id);
    activeScreen.style.display = 'block'; // Mostrar la deseada
    activeScreen.classList.add('active');
}