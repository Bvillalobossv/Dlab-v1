// -------- Configuración de clasificación (edita a gusto) --------
// Rango en dB (aprox. tras calibración) -> etiqueta, emoji y color
const CLASSES = [
  { min: -Infinity, max: 55,  label: "Tristeza",   emoji: "😔", color: "#3b82f6" },
  { min: 55,        max: 65,  label: "Ansiedad",   emoji: "😰", color: "#eab308" },
  { min: 65,        max: 75,  label: "Estrés",     emoji: "😣", color: "#f97316" },
  { min: 75,        max: 90,  label: "Enojo",      emoji: "😡", color: "#ef4444" },
  { min: 60,        max: 72,  label: "Alegría",    emoji: "😃", color: "#10b981", priority: 1 }, // Ejemplo de rango solapado opcional
];
// Nota: si hay solapes, gana el que tenga mayor "priority". Si no hay priority, el primero que cumpla.

const legendList = document.getElementById("legendList");
function renderLegend() {
  // mostrar sin duplicados por solapes (orden informativo)
  const shown = new Set();
  CLASSES.forEach(c => {
    const key = `${c.label}-${c.min}-${c.max}`;
    if (shown.has(key)) return;
    shown.add(key);
    const li = document.createElement("li");
    li.innerHTML = `<strong>${c.label}</strong> ${c.emoji} → ${c.min === -Infinity ? "≤" : ""}${c.min === -Infinity ? c.max : `${c.min}–${c.max}`} dB`;
    legendList.appendChild(li);
  });
}
renderLegend();

// -------- Estado y elementos UI --------
const toggleBtn   = document.getElementById("toggleBtn");
const dbValueEl   = document.getElementById("dbValue");
const barEl       = document.getElementById("bar");
const statusEl    = document.getElementById("status");
const calSlider   = document.getElementById("calibration");
const calValEl    = document.getElementById("calVal");
const smoothingEl = document.getElementById("smoothing");

let audioContext, analyser, sourceNode, mediaStream;
let dataBuf;
let rafId = null;
let running = false;
let smoothedDb = null;

function classify(db) {
  // Resolver solapes por prioridad
  let match = null;
  let bestPriority = -Infinity;
  for (const c of CLASSES) {
    if (db >= c.min && db < c.max) {
      const p = c.priority ?? 0;
      if (p > bestPriority) {
        bestPriority = p;
        match = c;
      } else if (match === null) {
        match = c;
      }
    }
  }
  return match;
}

function setStatus(label, emoji, color) {
  statusEl.innerHTML = `<span class="tag" style="border-color:${color}; color:${color}">${emoji} ${label}</span>`;
}

function setBar(db) {
  // Escala para barra (0–100%). Ajusta límites a conveniencia
  const minDb = 30;
  const maxDb = 90;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  const pct = ((clamped - minDb) / (maxDb - minDb)) * 100;
  barEl.style.width = `${pct}%`;
}

function rmsToDb(rms) {
  // Evitar log(0)
  const min = 1e-8;
  const val = Math.max(min, rms);
  return 20 * Math.log10(val);
}

function computeRmsFloat(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    sum += x * x;
  }
  return Math.sqrt(sum / buffer.length);
}

function stop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  if (audioContext) {
    // No cerramos completamente para iOS; pero aquí sí para liberar
    audioContext.close().catch(()=>{});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  running = false;
  toggleBtn.textContent = "🎙️ Activar micrófono";
  dbValueEl.textContent = "—";
  setBar(30);
  setStatus("Sin medición", "⏸️", "#a8b3cf");
}

async function start() {
  try {
    // Requiere HTTPS y gesto del usuario en iOS
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = parseFloat(smoothingEl.value);

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);

    dataBuf = new Float32Array(analyser.fftSize);

    running = true;
    toggleBtn.textContent = "⏹️ Detener";
    loop();
  } catch (err) {
    console.error(err);
    alert("No se pudo acceder al micrófono. Asegúrate de otorgar permisos y usar HTTPS.");
    stop();
  }
}

function loop() {
  if (!running) return;

  analyser.getFloatTimeDomainData(dataBuf);
  const rms = computeRmsFloat(dataBuf);
  let db = rmsToDb(rms);

  // Calibración para aproximar dB SPL (ajuste empírico)
  const calibration = parseInt(calSlider.value, 10) || 0;
  db += calibration;

  // Suavizado exponencial simple
  if (smoothedDb == null) smoothedDb = db;
  smoothedDb = smoothedDb * 0.8 + db * 0.2;

  // Mostrar
  const shown = Math.max(0, Math.round(smoothedDb));
  dbValueEl.textContent = isFinite(shown) ? shown : "—";
  setBar(shown);

  const cls = classify(shown);
  if (cls) setStatus(cls.label, cls.emoji, cls.color);

  rafId = requestAnimationFrame(loop);
}

// UI bindings
toggleBtn.addEventListener("click", async () => {
  if (running) stop();
  else start();
});

calSlider.addEventListener("input", () => {
  calValEl.textContent = calSlider.value;
});

smoothingEl.addEventListener("change", () => {
  if (analyser) analyser.smoothingTimeConstant = parseFloat(smoothingEl.value);
});

// Estado inicial
setBar(30);
setStatus("Sin medición", "⏸️", "#a8b3cf");

// Advertencia básica si no hay soporte
if (!navigator.mediaDevices?.getUserMedia) {
  alert("Este navegador no soporta getUserMedia(). Prueba con Chrome/Edge/Firefox o Safari reciente.");
}
