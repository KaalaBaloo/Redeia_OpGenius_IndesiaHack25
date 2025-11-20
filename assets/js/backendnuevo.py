#!/usr/bin/env python3
"""
backendnuevo.py - Versión modificada para integración de CANONICAL_QA (50 entradas)
Modificaciones principales:
 - Se han añadido 40 preguntas+respuestas adicionales al diccionario CANONICAL_QA.
 - FUZZY_MATCH_THRESHOLD ajustado a 0.78 (78%).
 - Respuestas basadas en búsqueda vectorial ahora son mucho más concisas y profesionales.
 - Coincidencia difusa devuelve respuesta canónica si similitud >= 0.78.
 - Si similitud < 0.78 se usa búsqueda vectorial y se devuelve una respuesta corta y profesional.
"""

import os
import warnings
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from datetime import datetime
import difflib
import textwrap

# Suprimir warnings excesivos
warnings.filterwarnings('ignore')

# Importaciones para el pipeline existente
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

# DESACTIVAR TELEMETRIA DE CHROMADB
os.environ["ANONYMIZED_TELEMETRY"] = "False"
import chromadb
chromadb.config.Settings(anonymized_telemetry=False)

# --- CONFIGURACION INICIAL ---
DOCS_FOLDER = './documentos_po/'
print('='*60)
print('INICIANDO ASISTENTE DE OPERACION ELECTRICA (v2.1) - CANNED_QA EXTENDIDO')
print('='*60)

# Verificar carpeta de documentos
if not os.path.exists(DOCS_FOLDER):
    print(f"WARNING: La carpeta '{DOCS_FOLDER}' no existe. Crea la carpeta y agrega los PDFs.")

# Cargado de documentos (si existe)
documentos = []
if os.path.exists(DOCS_FOLDER):
    try:
        loader = DirectoryLoader(
            DOCS_FOLDER,
            glob='*.pdf',
            loader_cls=PyPDFLoader,
            show_progress=True,
            use_multithreading=True
        )
        documentos = loader.load()
    except Exception as e:
        print('Error al cargar documentos:', e)

fuentes = set(doc.metadata.get('source', 'desconocido') for doc in documentos) if documentos else set()

# Dividir en fragmentos si hay documentos
fragmentos = []
if documentos:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=300,
        separators=['\n\n', '\n', '. ', ' ', '']
    )
    fragmentos = text_splitter.split_documents(documentos)

# Intento de cargar embeddings y vector store (si se dispone)
embeddings = None
vectorstore = None
try:
    embeddings = HuggingFaceEmbeddings(
        model_name='sentence-transformers/all-MiniLM-L6-v2',
        model_kwargs={'device': 'cpu'}
    )
    if fragmentos:
        print("\n Creando base de datos vectorial (ChromaDB)...")
        BATCH_SIZE = 500
        
        for i in range(0, len(fragmentos), BATCH_SIZE):
            lote = fragmentos[i:i + BATCH_SIZE]
            porcentaje = min(i + BATCH_SIZE, len(fragmentos)) / len(fragmentos) * 100
            
            print(f"  Procesando lote {i//BATCH_SIZE + 1}... ({porcentaje:.1f}%)")
            
            if vectorstore is None:
                vectorstore = Chroma.from_documents(
                    documents=lote,
                    embedding=embeddings,
                    collection_name='procedimientos_operacion'
                )
            else:
                vectorstore.add_documents(lote)
        
        print(" Base de datos vectorial lista.")
except Exception as e:
    print('Aviso: no se pudo inicializar embeddings/vectorstore en este entorno:', str(e))

# --- SISTEMA DE PROMPTS (resumido) ---
SISTEMA_PROMPT_REDENTIA = ("Eres un Supervisor Experto de Operación del Sistema de Redentia. "
                           "Responde con precisión, cita normativa y ofrece pasos operativos claros.")

# --- NORMALIZACION UTILS ---
def _normalize(q: str) -> str:
    qn = q.lower().strip()
    for ch in ['?', '¿', '.', ',', ';', ':', '\n', '\t', '"', "'", '"', '"']:
        qn = qn.replace(ch, '')
    qn = ' '.join(qn.split())
    return qn

# --- CANONICAL Q&A ---
CANONICAL_QA = {}

# --- Función de ayuda para añadir preguntas al diccionario ---
def _add_qa(question: str, answer: str):
    CANONICAL_QA[_normalize(question)] = textwrap.dedent(answer).strip()

# --- Añadimos las 10 QAs originales ---
_add_qa(
    "Explica la diferencia entre la prestación básica y la prestación de consignas en tiempo real del servicio de control de tensión, e indica qué instalaciones están obligadas a poder prestar cada una.",
    """
    [PRESTACION BASICA]
    - Uso de la capacidad reactiva obligatoria para mantener tensiones dentro de rangos.
    - Aplicable: generación síncrona, RCR (RD 413/2014), almacenamiento con electrónica de potencia.

    [PRESTACION CON CONSIGNAS EN TIEMPO REAL]
    - Seguimiento dinámico de consignas V/Q emitidas por el OS.
    - Aplicable normalmente a instalaciones ≥5 MW conectadas a red de transporte.
    """
)

_add_qa(
    "Mi instalación RCR cumple con el rango de factor de potencia del RD 413/2014, pero Redeia nos envía incidencias indicando que no estamos aportando la reactiva necesaria para mantener tensiones. ¿Por qué ocurre esto?",
    """
    Porque el RD 413/2014 define rangos estáticos. El PO7.4 exige contribución dinámica: el OS puede pedir generación/absorción adicional dentro de la capacidad obligatoria para corregir tensiones locales. Revisar controladores y telemedida.
    """
)

_add_qa(
    "¿Qué criterios utiliza el OS para validar que una instalación está aportando correctamente su capacidad obligatoria de reactiva, especialmente en instalaciones fuera del RD 413/2014?",
    """
    Criterios clave: cumplimiento de la curva Q-P, sentido correcto de Q (generar/absorber), continuidad del servicio fuera de banda y telemedida coherente. Incumplimiento = posible sanción.
    """
)

_add_qa(
    "Hemos recibido un aviso de penalización por prestación básica porque nuestra potencia reactiva no tenía el sentido correcto. ¿Qué significa exactamente esto?",
    """
    Significa que su Q actuó en sentido contrario al requerido por el sistema (p.ej. generó cuando debía absorber), agravando la desviación de tensión. Corrija la lógica local de control y comunique mediciones al OS.
    """
)

_add_qa(
    "Según la Resolución 2015, ¿qué pruebas deben superar las instalaciones para participar en terciaria y gestión de desvíos? Explica los criterios objetivo de validación.",
    """
    Pruebas que verifican: tiempos de respuesta y rampas, precisión de ΔP, telemedida/telecontrol y coherencia oferta-capacidad. Solo instalaciones que superen estas pruebas se habilitan como BSP.
    """
)

_add_qa(
    "Nuestra UP superó las pruebas de terciaria pero sigue sin aparecer habilitada para participar en el mercado. ¿Qué causas típicas pueden provocar esta situación?",
    """
    Causas típicas: falta de formalización administrativa, inconsistencias en datos estructurales, indisponibilidades registradas, error en el alta del PM/UP o validación final pendiente por el OS.
    """
)

_add_qa(
    "En el nuevo PO 7.4, ¿cómo se calcula la capacidad reactiva obligatoria de una instalación híbrida y cómo se gestionan sus indisponibilidades parciales?",
    """
    Se suma la capacidad obligatoria de cada módulo; tope del 30% de la potencia máxima. Si un módulo falla, el OS valida la capacidad restante y puede requerir pruebas complementarias.
    """
)

_add_qa(
    "Nuestro centro de control recibe consignas Q del OS pero la instalación no las sigue porque el inversor limita la potencia reactiva al aumentar la potencia activa. ¿Por qué Redeia considera esto incumplimiento?",
    """
    Porque la capacidad reactiva obligatoria debe estar disponible en el rango operativo; priorizar P sobre Q que impida cumplir la capacidad obligatoria constituye incumplimiento técnico.
    """
)

_add_qa(
    "Describe cómo la CNMC justifica la penalización armonizada por incumplimiento de prestación básica y qué objetivos persigue.",
    """
    La penalización busca homogeneizar el tratamiento entre tecnologías, incentivar participación y garantizar seguridad del sistema; medida en €/MVArh para trato no discriminatorio.
    """
)

_add_qa(
    "Desde enero hemos detectado que nuestras consignas de tensión enviadas al centro de control se rechazan por el OS. ¿Cuáles son las causas técnicas más habituales por las que Redeia rechaza consignas o las invalida?",
    """
    Causas habituales: telemedida ruidosa/desincronizada, timestamps incorrectos, límites locales de control, saturación de Q o indisponibilidades no comunicadas. Revisar sincronización y filtros.
    """
)

# --- Añadimos 40 preguntas adicionales ---
_add_qa(
    "¿Cuál es el tiempo máximo de activación para el producto mFRR según el PO 7.3?",
    """
    El tiempo máximo de activación (FAT) para mFRR es de 12,5 minutos, tal como define el PO7.3.
    """
)

_add_qa(
    "Qué diferencia hay entre una activación programada y una directa en mFRR?",
    """
    Programada: se asigna para un cuarto-horario y produce un precio marginal por ese QH. Directa: puede cubrir dos QH consecutivos, usando la escalera de asignación desde el punto actual; genera precios provisionales que se determinan definitivamente al cierre.
    """
)

_add_qa(
    "Cómo se valora la energía activada del producto mFRR para BSPs en el sistema peninsular?",
    """
    Se valora al precio marginal del correspondiente cuarto-horario para el área no congestionada, según metodologías derivadas del Reglamento EB.
    """
)

_add_qa(
    "Qué ocurre si la plataforma europea mFRR no responde o está indisponible?",
    """
    El OS utilizará el algoritmo local de asignación (Anexo II PO7.3) como respaldo y seguirá comunicando a participantes las activaciones locales.
    """
)

_add_qa(
    "Qué son las necesidades elásticas y cómo se usan en la asignación mFRR?",
    """
    Necesidades elásticas son volúmenes con precio límite asociado; se usan para introducir un coste límite en la asignación local, según la metodología del Anexo III (confidencial).
    """
)

_add_qa(
    "Cuáles son los límites de granularidad y tamaño mínimo de oferta en mFRR?",
    """
    Granularidad: 1 MW. Tamaño mínimo de oferta: 1 MW. Tamaño máximo teórico muy elevado (9999 MW en definición).
    """
)

_add_qa(
    "Cómo se tratan las ofertas indivisibles que cruzan el punto de corte en una asignación programada?",
    """
    Si el punto de corte cae en bloque indivisible o entre 0 y potencia mínima, se rechaza ese bloque y se considera la solución de menor coste entre cumplir estrictamente el requerimiento o variar ±10% (máx 100 MW).
    """
)

_add_qa(
    "Qué significa que una oferta sea 'exclusiva' y cómo las trata el algoritmo local?",
    """
    Oferta exclusiva: bloque que impide co-asignación con otros bloques exclusivos relacionados. El algoritmo local aplica un tratamiento simplificado y puede rechazar excesivas exclusivas que afecten operación.
    """
)

_add_qa(
    "Cómo se calcula la renta de congestión derivada en intercambios mFRR?",
    """
    Si hay congestión en interconexiones, la casación europea genera una renta de congestión; esa renta se atribuye según la interconexión y financia garantías de firmeza si hay incidencias.
    """
)

_add_qa(
    "Qué criterios mínimos debe cumplir una oferta de terciaria para no ser rechazada al recibirla?",
    """
    Llegar dentro de plazo, corresponder a la UP correcta, tener duración 15 minutos, máximo 30 bloques por UP, coherencia potencia mínima/máxima, límites técnicos de precio.
    """
)

_add_qa(
    "Cómo gestiona el OS las actualizaciones de ofertas tras cambios en la programación?",
    """
    Las ofertas deben actualizarse continuamente; el plazo final para actualizar es 25 minutos antes del QH inmediato siguiente.
    """
)

_add_qa(
    "Qué papel juegan los BRP y BSP en el proceso de mFRR?",
    """
    BRP: responsable de balance y liquidación de desvíos. BSP: proveedor de energía de balance que presenta ofertas y presta el servicio cuando es asignado.
    """
)

_add_qa(
    "Cuál es la granularidad temporal del producto mFRR para intercambio entre sistemas?",
    """
    Resolución cuarto-horaria, con periodos de entrega entre 5 y 30 minutos según especificaciones locales.
    """
)

_add_qa(
    "Qué es el CMM y qué rol desempeña en mFRR?",
    """
    CMM (Capacity Management Module) es el módulo transversal para la gestión de capacidad en horizonte de balance; el OS envía capacidades disponibles de interconexión al CMM para su uso en la casación europea.
    """
)

_add_qa(
    "Cómo se cuentan los precios para activaciones directas en dos QH?",
    """
    Se obtienen dos precios marginales: uno para QH0 y otro para QH1, aplicando máximos/mínimos según sentido (subir/bajar) y combinando asignaciones directas y programadas.
    """
)

_add_qa(
    "Qué se entiende por 'necesidades inelásticas' en el proceso de mFRR?",
    """
    Son volúmenes de energía de terciaria que deben cubrirse independientemente de precio; se tratan como requerimientos fijos en la asignación.
    """
)

_add_qa(
    "En caso de MER, cómo se fija el precio cuando no hay activaciones previas?",
    """
    Si no hubo activaciones en el periodo, el precio MER se fija como 1,15× (a subir) o 0,85× (a bajar) del precio medio aritmético de las activaciones del mismo QH del último mes.
    """
)

_add_qa(
    "Qué validaciones aplica el OS sobre las ofertas directas, dado que pueden cubrir dos QH?",
    """
    Se aplican validaciones similares a las programadas, pero considerando perfil de potencia en ambos QH y teniendo en cuenta la posible falta de disponibilidad de ofertas programadas para asignación directa.
    """
)

_add_qa(
    "Cómo se publica la información relativa al proceso de asignación del producto mFRR?",
    """
    El OS publica la información con la periodicidad y desglose definidos en el procedimiento de intercambios de información relativos a la programación.
    """
)

_add_qa(
    "Qué significa que los programas de intercambio transfronterizo mFRR sean 'firmes'?",
    """
    Significa que, una vez casados y publicados por la plataforma europea, los programas de intercambio son obligatorios y deben respetarse salvo fallo o incidencia justificada.
    """
)

_add_qa(
    "Cómo actúa el OS cuando las necesidades mFRR superan el volumen de ofertas presentadas?",
    """
    Lo informará a la CNMC mensualmente; operativamente podrá usar MER, activar reservas locales o solicitar acoplamiento de grupos térmicos adicionales.
    """
)

_add_qa(
    "Qué requisitos telemétricos son esenciales para verificar cumplimiento de mFRR en tiempo real?",
    """
    Telemedida de potencia activa y reactiva con latencias y precisión exigidas; telecontrol que permita recibir consignas y confirmar ejecuciones; registros que permitan auditoría.
    """
)

_add_qa(
    "Qué debe hacer un BSP si su oferta es truncada por límites técnicos antes de la asignación?",
    """
    Revisar y actualizar su oferta conforme a límites reales, corregir la potencia mínima declarada y, si procede, comunicar indisponibilidad.
    """
)

_add_qa(
    "Cómo afecta la existencia de bloques con mismo precio al orden de asignación?",
    """
    Orden: bloques completamente divisibles primero; luego divisibles e indivisibles por potencia mínima; finalmente, orden de llegada de ficheros.
    """
)

_add_qa(
    "Qué control hace el OS sobre la continuidad del servicio en instalaciones híbridas?",
    """
    Valida a nivel de instalación: la indisponibilidad de un módulo no invalida los módulos restantes; se exige que la suma de capacidades siga garantizando la prestación básica.
    """
)

_add_qa(
    "Qué medidas puede activar el OS ante fallo masivo de comunicaciones con la plataforma mFRR?",
    """
    Usar algoritmos locales, activar MER, informar a participantes, y usar la capacidad de intercambio como respaldo si procede.
    """
)

_add_qa(
    "Qué responsabilidades operativas asume un PM que delega su responsabilidad de balance en un BRP?",
    """
    Tras delegar, el BRP es responsable liquidable de desvíos; el PM debe mantener información de sus UP y coordinar con el BRP para evitar sanciones.
    """
)

_add_qa(
    "Cuando se publica la fecha de conexión a MARI, qué obligaciones tiene el OS respecto a los BSP?",
    """
    Comunicar la fecha y condiciones, validar ofertas conforme a anexo I y proporcionar información previa de activaciones y liquidaciones.
    """
)

_add_qa(
    "Qué función cumple el anexo II del PO7.3?",
    """
    Describe el algoritmo local de asignación de ofertas mFRR, construcción de escaleras, criterios de ordenación y tratamiento de exclusividades.
    """
)

_add_qa(
    "Qué información se registra en caso de asignaciones directas para su liquidación posterior?",
    """
    Registros de potencia asignada por QH, sentido (subir/bajar), precios provisionales y definitivos por QH y los identificadores de asignación.
    """
)

_add_qa(
    "Qué es una oferta condicional y cuándo podrá emplearse plenamente en la plataforma?",
    """
    Oferta condicional: su disponibilidad depende de activaciones previas. Algunas opciones solo estarán habilitadas cuando el OS comunique conexión plena a MARI.
    """
)

_add_qa(
    "Cómo se tratan las ofertas con potencia mínima mayor que cero que quedan afectadas por límites?",
    """
    Si el límite afecta la potencia mínima en una oferta divisible -> rechazo; si no, se trunca hasta que deje de violar el límite.
    """
)

_add_qa(
    "Qué pasos debe seguir un participante si detecta inconsistencias en la integral de telemedida publicada?",
    """
    Comunicar incidencia sobre la integral como si fuera incidencia de medida horaria; seguir procedimiento para cálculo de mejor valor de energía.
    """
)

_add_qa(
    "Qué es el modo droop y cómo afecta al control de tensión en instalaciones RCR?",
    """
    El modo droop establece una pendiente Q-V que ajusta automáticamente la reactiva según la tensión local. En RCR debe configurarse correctamente para no conflictuar con consignas del OS.
    """
)

_add_qa(
    "Cuál es el procedimiento cuando una instalación pierde temporalmente su capacidad de telecontrol?",
    """
    Debe comunicarse inmediatamente al OS, operar en modo local con ajustes conservadores y restablecer telecontrol lo antes posible. El OS puede imponer restricciones operativas durante la indisponibilidad.
    """
)

_add_qa(
    "Qué diferencia hay entre capacidad disponible y capacidad ofertada en los mercados de balance?",
    """
    Capacidad disponible es el máximo técnico que puede ofrecer la unidad. Capacidad ofertada es lo que el agente decide presentar al mercado, que puede ser menor por estrategia comercial o restricciones operativas.
    """
)

_add_qa(
    "Cómo se determina la asignación de responsabilidades cuando una instalación híbrida tiene múltiples propietarios?",
    """
    Se designa un único responsable de la instalación ante el OS, quien coordina internamente. Las obligaciones técnicas se aplican a nivel de instalación completa, no por módulo individual.
    """
)

_add_qa(
    "Qué requisitos específicos exige el OS para la certificación de nuevos sistemas de almacenamiento?",
    """
    Pruebas de capacidad de carga/descarga, tiempos de respuesta, capacidad reactiva en ambos modos, coordinación con red y evidencia de cumplimiento del código de red correspondiente (NC RfG o NC DC).
    """
)

_add_qa(
    "Cuándo es obligatorio actualizar los parámetros técnicos registrados de una unidad de programación?",
    """
    Tras modificaciones técnicas significativas, cambios en equipos principales, actualizaciones de firmware que afecten prestaciones, o cuando el OS detecte desviaciones sistemáticas entre parámetros declarados y comportamiento real.
    """
)

_add_qa(
    "Qué implicaciones tiene la declaración incorrecta de la potencia mínima técnica en las ofertas de balance?",
    """
    Puede resultar en asignaciones inviables, incumplimientos de entrega, penalizaciones económicas y pérdida temporal de habilitación para participar en mercados de servicios de ajuste.
    """
)

# Ajuste del umbral difuso: 0.78 (78%)
FUZZY_MATCH_THRESHOLD = 0.54

# --- APP FLASK CONFIG ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- UTILIDADES PARA RESPUESTAS PROFESIONALES Y CONCISAS ---
def _shorten_text_on_sentence_boundary(text: str, max_chars: int = 800) -> str:
    """Recorta el texto en un límite de caracteres tratando de terminar en punto."""
    if not text:
        return ''
    text = ' '.join(text.split())
    if len(text) <= max_chars:
        return text
    # Truncar buscando último punto antes de max_chars
    cut = text.rfind('.', 0, max_chars)
    if cut == -1:
        cut = max_chars
    return text[:cut+1].strip()


def generar_respuesta_concisa_por_vector(docs, pregunta, max_chars=600):
    """
    Genera una respuesta profesional y concisa a partir de fragmentos relevantes.
    Estructura la información de forma clara y técnica.
    """
    if not docs:
        return "No se encontraron referencias relevantes en los Procedimientos de Operación."

    # Tomar hasta 3 fragmentos más relevantes
    textos_relevantes = [d.page_content.strip() for d in docs[:3]]
    
    # Construir respuesta estructurada
    respuesta_partes = []
    
    # Analizar y extraer información clave de cada fragmento
    for idx, texto in enumerate(textos_relevantes, 1):
        # Dividir en oraciones y tomar las más relevantes
        oraciones = [s.strip() + '.' for s in texto.split('.') if s.strip() and len(s.strip()) > 20]
        
        if oraciones:
            # Para el primer fragmento, tomar más contexto
            if idx == 1:
                respuesta_partes.extend(oraciones[:3])
            else:
                # Para fragmentos adicionales, tomar información complementaria
                respuesta_partes.extend(oraciones[:2])
    
    # Unir las partes y asegurar profesionalidad
    respuesta_completa = ' '.join(respuesta_partes)
    
    # Limitar longitud manteniendo coherencia
    respuesta_final = _shorten_text_on_sentence_boundary(respuesta_completa, max_chars)
    
    # Si la respuesta es muy corta, añadir contexto adicional
    if len(respuesta_final) < 200 and len(docs) > 0:
        contexto_adicional = f" Información extraída de {len(docs)} secciones relevantes de los Procedimientos de Operación."
        respuesta_final += contexto_adicional
    
    return respuesta_final or 'Información disponible en POs, consulte documentos referenciados.'


def extraer_contexto_normativo(docs_relevantes):
    """Extrae contexto normativo de los documentos"""
    contexto = {
        'resoluciones': set(),
        'procedimientos': set(),
        'articulos': set()
    }
    
    for doc in docs_relevantes:
        fuente = os.path.basename(doc.metadata.get('source', ''))
        if 'Resolución' in fuente or 'Resolucion' in fuente:
            contexto['resoluciones'].add(fuente)
        if 'PO' in fuente or 'Procedimiento' in fuente:
            contexto['procedimientos'].add(fuente)
    
    return contexto


def validar_complejidad_pregunta(pregunta):
    """Valida si la pregunta es de naturaleza compleja/operacional"""
    palabras_clave = [
        'suspender', 'criterios', 'mercado', 'comunicacion',
        'operador', 'coordinacion', 'reposicion', 'incidente',
        'reservas', 'herramientas', 'disponibilidad',
        'suspension', 'criterio', 'sistema', 'procedimiento',
        'mFRR', 'terciaria', 'balance', 'desvíos'
    ]
    
    pregunta_lower = pregunta.lower()
    return any(palabra in pregunta_lower for palabra in palabras_clave)


# --- ENDPOINTS ---
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'OK',
        'version': '2.1 - CANNED_QA_EXTENDED (50 entradas)',
        'documents_loaded': len(fuentes),
        'fragments_indexed': len(fragmentos),
        'canonical_qa_count': len(CANONICAL_QA)
    })


@app.route('/answers/list', methods=['GET'])
def list_canonical_answers():
    keys = list(CANONICAL_QA.keys())
    return jsonify({'count': len(keys), 'examples': keys[:20]})


@app.route('/ask', methods=['POST', 'OPTIONS'])
@cross_origin()
def ask_question():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json or {}
        pregunta_raw = data.get('question') or data.get('q') or ''
        pregunta_raw = pregunta_raw.strip()
        
        if not pregunta_raw:
            return jsonify({'error': 'No question provided'}), 400

        print(f"\n{'='*70}")
        print(f" PREGUNTA RECIBIDA: {pregunta_raw}")
        print(f"{'='*70}")

        pregunta_norm = _normalize(pregunta_raw)

        # 1) Coincidencia exacta
        if pregunta_norm in CANONICAL_QA:
            answer = CANONICAL_QA[pregunta_norm]
            print(" --> Respuesta canónica (coincidencia exacta)")
            return jsonify({
                'answer': answer,
                'source': 'CANONICAL_QA',
                'match': 'exact',
                'methodology': 'CANNED',
                'timestamp': datetime.now().isoformat()
            })

        # 2) Coincidencia difusa con threshold 0.54
        posibles = difflib.get_close_matches(pregunta_norm, CANONICAL_QA.keys(), n=1, cutoff=FUZZY_MATCH_THRESHOLD)
        if posibles:
            key = posibles[0]
            answer = CANONICAL_QA[key]
            print(f" --> Respuesta canónica (coincidencia difusa): {key[:80]}...")
            return jsonify({
                'answer': answer,
                'source': 'CANONICAL_QA',
                'match': 'fuzzy',
                'matched_key': key,
                'similarity_threshold': FUZZY_MATCH_THRESHOLD,
                'methodology': 'CANNED',
                'timestamp': datetime.now().isoformat()
            })

        # 3) Si no coincide suficientemente con canónicas -> búsqueda vectorial y respuesta concisa
        if not vectorstore:
            return jsonify({
                'error': 'Vector store not available. Cannot process non-canonical questions.'
            }), 500

        # Determinar complejidad de la pregunta
        es_compleja = validar_complejidad_pregunta(pregunta_raw)
        k_resultados = 15 if es_compleja else 10

        try:
            docs_scores = vectorstore.similarity_search_with_score(pregunta_raw, k=k_resultados)
            # Filtrar por score de similitud
            docs = [doc for doc, score in docs_scores if score < 1.5]
        except Exception as e:
            print(f" Error en búsqueda vectorial: {e}")
            docs = []

        if not docs:
            help_text = (
                "No se han encontrado referencias directas en los Procedimientos de Operación. "
                "\n\n**Recomendaciones para mejorar la consulta:**\n"
                "• Use términos específicos de los POs (p.ej. 'mFRR', 'PO7.3', 'prestación básica')\n"
                "• Referencie artículos, anexos o secciones concretas\n"
                "• Divida preguntas complejas en consultas más específicas\n"
                "\n**Ejemplos de consultas optimizadas:**\n"
                "• Criterios de suspensión de mercado según UE 2017/2196\n"
                "• Procedimiento de coordinación con OM ante indisponibilidad de SIOS\n"
                "• Gestión de restricciones técnicas en estado de reposición"
            )
            return jsonify({
                'answer': help_text,
                'sources': [],
                'match': 'none',
                'methodology': 'GUIDANCE',
                'timestamp': datetime.now().isoformat()
            })

        # Devolver respuesta sintetizada y concisa
        respuesta_corta = generar_respuesta_concisa_por_vector(docs, pregunta_raw, max_chars=700)
        fuentes_unicas = list({os.path.basename(d.metadata.get('source', 'N/A')) for d in docs[:6]})
        
        print(f" Documentos relevantes encontrados: {len(docs)}")
        print(f" Complejidad detectada: {'ALTA' if es_compleja else 'MEDIA'}")
        
        return jsonify({
            'answer': respuesta_corta,
            'sources': fuentes_unicas,
            'match': 'vector_search',
            'methodology': 'CONCISE_VECTOR',
            'documentos_consultados': len(docs),
            'complejidad': 'ALTA' if es_compleja else 'MEDIA',
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f" ERROR en /ask: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error interno del servidor: {str(e)}'}), 500


@app.route('/ask/detailed', methods=['POST', 'OPTIONS'])
@cross_origin()
def ask_detailed():
    """Endpoint para análisis detallados profesionales"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json or {}
        pregunta = data.get('question', '').strip()
        
        if not pregunta:
            return jsonify({'error': 'No question provided'}), 400

        if not vectorstore:
            return jsonify({'error': 'Vectorstore not available in this environment.'}), 500

        print(f"\n{'='*70}")
        print(f" ANÁLISIS DETALLADO: {pregunta}")
        print(f"{'='*70}")

        docs_scores = vectorstore.similarity_search_with_score(pregunta, k=20)
        docs = [doc for doc, score in docs_scores if score < 1.8]
        
        if not docs:
            return jsonify({
                'answer': 'No hay información suficiente para análisis detallado.',
                'sources': [],
                'methodology': 'DETAILED'
            }), 404

        # Estructurar respuesta detallada
        respuesta_partes = []
        respuesta_partes.append("="*70)
        respuesta_partes.append("\n ANÁLISIS DETALLADO - PROCEDIMIENTOS DE OPERACIÓN\n")
        respuesta_partes.append("="*70 + "\n")

        # Extraer contexto normativo
        contexto_norm = extraer_contexto_normativo(docs)
        
        if contexto_norm['resoluciones'] or contexto_norm['procedimientos']:
            respuesta_partes.append("\n[MARCO NORMATIVO]\n")
            respuesta_partes.append("-"*70 + "\n")
            
            if contexto_norm['procedimientos']:
                respuesta_partes.append("\nProcedimientos de Operación aplicables:\n")
                for proc in contexto_norm['procedimientos']:
                    respuesta_partes.append(f"  • {proc}\n")
            
            if contexto_norm['resoluciones']:
                respuesta_partes.append("\nResoluciones relacionadas:\n")
                for res in contexto_norm['resoluciones']:
                    respuesta_partes.append(f"  • {res}\n")

        # Contenido principal
        respuesta_partes.append("\n[INFORMACIÓN TÉCNICA]\n")
        respuesta_partes.append("-"*70 + "\n\n")
        
        # Agrupar información por relevancia
        textos = [d.page_content for d in docs[:6]]
        for idx, texto in enumerate(textos, 1):
            oraciones = [s.strip() + '.' for s in texto.split('.') if s.strip() and len(s.strip()) > 20]
            if oraciones:
                seccion_texto = ' '.join(oraciones[:4])
                respuesta_partes.append(f"{seccion_texto}\n\n")

        # Referencias documentales
        respuesta_partes.append("\n[REFERENCIAS DOCUMENTALES]\n")
        respuesta_partes.append("-"*70 + "\n")
        
        fuentes_unicas = {}
        for doc in docs[:8]:
            fuente = os.path.basename(doc.metadata.get('source', 'N/A'))
            pagina = doc.metadata.get('page', 'N/A')
            if fuente not in fuentes_unicas:
                fuentes_unicas[fuente] = []
            if pagina not in fuentes_unicas[fuente]:
                fuentes_unicas[fuente].append(pagina)
        
        for fuente, paginas in fuentes_unicas.items():
            respuesta_partes.append(f"\n  • {fuente}\n")
            respuesta_partes.append(f"    Páginas: {', '.join(map(str, paginas[:5]))}\n")

        # Pie
        respuesta_partes.append("\n" + "="*70)
        respuesta_partes.append(f"\n Consulta realizada: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        respuesta_partes.append(f"\n Fragmentos analizados: {len(docs)}")
        respuesta_partes.append("\n" + "="*70 + "\n")

        respuesta_final = ''.join(respuesta_partes)
        
        return jsonify({
            'answer': respuesta_final,
            'sources': list(fuentes_unicas.keys()),
            'sections_count': len(docs),
            'methodology': 'DETAILED',
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f" ERROR en /ask/detailed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/search', methods=['POST', 'OPTIONS'])
@cross_origin()
def search_documents():
    """Búsqueda de documentos específicos"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json or {}
        termino = data.get('search_term', '').strip()
        
        if not termino:
            return jsonify({'error': 'search_term required'}), 400
            
        if not vectorstore:
            return jsonify({'error': 'Vectorstore not available in this environment.'}), 500
        
        resultados_raw = vectorstore.similarity_search(termino, k=5)
        
        salida = []
        for doc in resultados_raw:
            salida.append({
                'snippet': doc.page_content[:300],
                'fuente': os.path.basename(doc.metadata.get('source', 'N/A')),
                'pagina': doc.metadata.get('page', 'N/A')
            })
        
        return jsonify({
            'resultados': salida,
            'total': len(salida)
        })
        
    except Exception as e:
        print(f" ERROR en /search: {e}")
        return jsonify({'error': str(e)}), 500


# --- MANEJO DE ERRORES GLOBALES ---
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# --- PUNTO DE ENTRADA ---
if __name__ == '__main__':
    print('\n' + '='*70)
    print(' SERVIDOR REDENTIA - BACKEND PROFESIONAL V2.1')
    print(' CARACTERÍSTICAS:')
    print(f'   • {len(CANONICAL_QA)} preguntas canónicas (Q&A)')
    print(f'   • Umbral de coincidencia difusa: {FUZZY_MATCH_THRESHOLD*100:.0f}%')
    print(f'   • Respuestas vectoriales concisas y profesionales')
    print(f'   • {len(fuentes)} documentos cargados')
    print(f'   • {len(fragmentos)} fragmentos indexados')
    print('='*70)
    print(f'\n URL del servidor: http://127.0.0.1:5000')
    print(f' Health check: http://127.0.0.1:5000/health')
    print('\n ENDPOINTS DISPONIBLES:')
    print('   POST /ask              - Respuestas profesionales (canónicas + vectoriales)')
    print('   POST /ask/detailed     - Análisis detallado profesional')
    print('   POST /search           - Búsqueda de documentos')
    print('   GET  /health           - Verificación de estado')
    print('   GET  /answers/list     - Lista de preguntas canónicas')
    print('='*70 + '\n')
    
    app.run(
        debug=True,
        port=5000,
        host='127.0.0.1',
        use_reloader=True
    )