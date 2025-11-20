import tkinter as tk
from tkinter import messagebox, ttk
import json
import random
import os
from datetime import datetime

# --- CONFIGURACIÓN Y DATOS ---

# Archivo para guardar puntuaciones
SCORE_FILE = "puntuaciones_ree.json"

# SIMULACIÓN DE EXTRACCIÓN DE DATOS
# En un caso real, aquí usaríamos 'pdfplumber' para leer los P.O. descargados
# y una IA para generar estas preguntas dinámicamente.
# Por ahora, creamos un banco de preguntas manual para que el código sea funcional.

BASEDATOS_PREGUNTAS = [
    {
        "po": "P.O. 1.1",
        "dificultad": "Baja",
        "pregunta": "¿Quién es el responsable de la operación del sistema eléctrico?",
        "opciones": ["El Operador del Sistema (REE)", "Las distribuidoras", "El Ministerio", "Los generadores"],
        "correcta": 0 # Índice de la respuesta correcta
    },
    {
        "po": "P.O. 3.1",
        "dificultad": "Media",
        "pregunta": "¿Cuál es el margen de reserva rodante mínimo?",
        "opciones": ["500 MW", "Depende de la demanda", "El mayor grupo generador", "1000 MW"],
        "correcta": 1
    },
    {
        "po": "P.O. 7.2",
        "dificultad": "Alta",
        "pregunta": "¿En qué plazo debe comunicarse una indisponibilidad fortuita?",
        "opciones": ["En 24 horas", "Inmediatamente", "Antes de 15 minutos", "Al final del día"],
        "correcta": 2
    },
    # Puedes añadir cientos de preguntas aquí o cargarlas desde un Excel/CSV
]

class CuestionarioApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Entrenador P.O. Red Eléctrica")
        self.root.geometry("600x500")
        
        self.puntuacion = 0
        self.preguntas_actuales = []
        self.pregunta_index = 0
        
        self.setup_ui()
        
    def setup_ui(self):
        # Pantalla de Inicio
        self.frame_inicio = tk.Frame(self.root, padx=20, pady=20)
        self.frame_inicio.pack(expand=True, fill="both")
        
        tk.Label(self.frame_inicio, text="Cuestionario P.O. Red Eléctrica", font=("Arial", 18, "bold")).pack(pady=20)
        
        tk.Label(self.frame_inicio, text="Selecciona Dificultad:", font=("Arial", 12)).pack(pady=5)
        
        self.dificultad_var = tk.StringVar(value="Baja")
        combo = ttk.Combobox(self.frame_inicio, textvariable=self.dificultad_var, values=["Baja", "Media", "Alta"], state="readonly")
        combo.pack(pady=10)
        
        btn_start = tk.Button(self.frame_inicio, text="Comenzar Test", command=self.iniciar_test, bg="#007bff", fg="white", font=("Arial", 12))
        btn_start.pack(pady=20)
        
        btn_historial = tk.Button(self.frame_inicio, text="Ver Historial", command=self.ver_historial)
        btn_historial.pack(pady=5)

        # Frame del Cuestionario (oculto al inicio)
        self.frame_quiz = tk.Frame(self.root, padx=20, pady=20)

    def iniciar_test(self):
        nivel = self.dificultad_var.get()
        # Filtramos preguntas por dificultad
        self.preguntas_actuales = [p for p in BASEDATOS_PREGUNTAS if p["dificultad"] == nivel]
        
        if not self.preguntas_actuales:
            messagebox.showerror("Error", f"No hay preguntas cargadas para dificultad {nivel}")
            return
            
        random.shuffle(self.preguntas_actuales)
        self.puntuacion = 0
        self.pregunta_index = 0
        
        self.frame_inicio.pack_forget()
        self.frame_quiz.pack(expand=True, fill="both")
        self.mostrar_pregunta()

    def mostrar_pregunta(self):
        # Limpiar frame anterior
        for widget in self.frame_quiz.winfo_children():
            widget.destroy()
            
        if self.pregunta_index < len(self.preguntas_actuales):
            data = self.preguntas_actuales[self.pregunta_index]
            
            # Encabezado
            tk.Label(self.frame_quiz, text=f"Pregunta {self.pregunta_index + 1} de {len(self.preguntas_actuales)}", fg="gray").pack()
            tk.Label(self.frame_quiz, text=f"Puntuación: {self.puntuacion}", font=("Arial", 10, "bold")).pack(pady=5)
            
            # Texto Pregunta
            tk.Label(self.frame_quiz, text=data["pregunta"], font=("Arial", 14), wraplength=500, justify="center").pack(pady=20)
            
            # Opciones
            for idx, opcion in enumerate(data["opciones"]):
                btn = tk.Button(self.frame_quiz, text=opcion, command=lambda i=idx: self.verificar_respuesta(i), font=("Arial", 11), width=40)
                btn.pack(pady=5)
                
        else:
            self.finalizar_test()

    def verificar_respuesta(self, indice_elegido):
        correcta = self.preguntas_actuales[self.pregunta_index]["correcta"]
        
        if indice_elegido == correcta:
            self.puntuacion += 1
            messagebox.showinfo("Correcto", "¡Respuesta Correcta!")
        else:
            resp_texto = self.preguntas_actuales[self.pregunta_index]["opciones"][correcta]
            messagebox.showerror("Incorrecto", f"Fallaste. La correcta era:\n{resp_texto}")
            
        self.pregunta_index += 1
        self.mostrar_pregunta()

    def finalizar_test(self):
        self.guardar_puntuacion()
        msg = f"Test finalizado.\nPuntuación final: {self.puntuacion} / {len(self.preguntas_actuales)}"
        messagebox.showinfo("Resultados", msg)
        self.frame_quiz.pack_forget()
        self.frame_inicio.pack(expand=True, fill="both")

    def guardar_puntuacion(self):
        nuevo_registro = {
            "fecha": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "dificultad": self.dificultad_var.get(),
            "puntos": self.puntuacion,
            "total": len(self.preguntas_actuales)
        }
        
        historial = []
        if os.path.exists(SCORE_FILE):
            with open(SCORE_FILE, "r") as f:
                try:
                    historial = json.load(f)
                except:
                    historial = []
        
        historial.append(nuevo_registro)
        
        with open(SCORE_FILE, "w") as f:
            json.dump(historial, f, indent=4)

    def ver_historial(self):
        if not os.path.exists(SCORE_FILE):
            messagebox.showinfo("Historial", "Aún no hay puntuaciones guardadas.")
            return
            
        with open(SCORE_FILE, "r") as f:
            data = json.load(f)
            
        texto = "Últimas 5 puntuaciones:\n\n"
        for d in data[-5:]: # Mostrar solo las ultimas 5
            texto += f"{d['fecha']} | {d['dificultad']} | {d['puntos']}/{d['total']}\n"
            
        messagebox.showinfo("Historial", texto)

if __name__ == "__main__":
    root = tk.Tk()
    app = CuestionarioApp(root)
    root.mainloop()