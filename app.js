// -------- Manejo de pantallas --------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.getElementById("btnStart").addEventListener("click", () => showScreen("screen2"));
document.getElementById("btnNext").addEventListener("click", () => showScreen("screen3"));

// -------- Configuración --------
const CLASSES = [
  { min: -Infinity, max: 55, label: "Tristeza", emoji: "🌧️", color: "#3b82f6", img: "tristeza.png" },
  { min: 55, max: 65, label: "Ansiedad", emoji: "🌊", color: "#6366f1", img: "ansiedad.png" },
  { min: 65, max: 75, label: "Estrés", emoji: "⚡", color: "#f59e0b", img: "estres.png" },
  { min: 75, max: 90, label: "Enojo", emoji: "🔥", color: "#ef4444", img: "enojo.png" },
  { min: 60, max: 72, label: "Alegría", emoji: "🌟", color: "#10b981", img: "alegria.png", priority: 1 }
];

const toggleBtn = document.getElementById("toggleBtn");
const dbValueEl = document.getElementById("dbValue");
const barEl = document.getElementById("bar");
const statusEl = document.getElementById("status");
const calSlider = document.getElementById("calibration");
const calValEl = document.getElementById("calVal");

let audioContext, analyser, sourceNode, mediaStream, dataBuf;
let history = [];

// -------- Funciones --------
function classify(db) {
  let match = null, bestPriority = -Infinity;
  for (const c of CLASSES) {
    if (db >= c.min && db < c.max) {
      const p = c.priority ?? 0;
      if (p > bestPriority) { bestPriority = p; match = c; }
      else if (match === null) { match = c; }
    }
  }
  return match;
}

function setStatus(label, emoji, color) {
  statusEl.innerHTML = `<span class="tag" style="border-color:${color};color:${color}">${emoji} ${label}</span>`;
}

function rmsToDb(rms) {
  const min = 1e-8;
  return 20 * Math.log10(Math.max(min, rms));
}

function computeRmsFloat(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

async function startMeasurement() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);
    dataBuf = new Float32Array(analyser.fftSize);

    dbValueEl.textContent = "…";
    setStatus("Analizando ambiente laboral...", "⏳", "#0ea5e9");
    barEl.style.width = "0%";

    let samples = [];
    const duration = 5000;
    const interval = 100;

    const intervalId = setInterval(() => {
      analyser.getFloatTimeDomainData(dataBuf);
      const rms = computeRmsFloat(dataBuf);
      let db = rmsToDb(rms);
      let dbMapped = Math.round(30 + ((db + 60) / 60) * 60);
      samples.push(dbMapped);
    }, interval);

    setTimeout(() => {
      clearInterval(intervalId);

      if (samples.length === 0) {
        setStatus("Sin datos", "⚠️", "#f59e0b");
        return;
      }

      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      history.push(avg);

      const cls = classify(avg);
      setStatus(cls.label, cls.emoji, cls.color);

      renderResults(avg, cls);
      mediaStream.getTracks().forEach(t => t.stop());
      audioContext.close();
    }, duration);

  } catch (err) {
    console.error(err);
    alert("No se pudo acceder al micrófono.");
  }
}

function renderResults(avg, cls) {
  showScreen("screen4");

  // Texto resumen
  document.getElementById("summaryText").textContent = `Esta semana los decibeles fueron ${avg} dB. Voces ${cls.label.toLowerCase()} de lo habitual.`;

  // Indicador actual
  document.getElementById("currentIndicator").innerHTML = `
    <div class="card">
      <img src="${cls.img}">
      <h4>${cls.emoji} ${cls.label}</h4>
      <p>${cls.min}–${cls.max} dB</p>
    </div>
  `;

  // Gráfico histórico
  const ctx = document.getElementById("historyChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((_, i) => "Día " + (i + 1)),
      datasets: [{
        label: "Decibeles",
        data: history,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)"
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

// -------- Eventos --------
toggleBtn.addEventListener("click", startMeasurement);
calSlider.addEventListener("input", () => { calValEl.textContent = calSlider.value; });

// Carrusel → detalle
document.querySelectorAll("#indicatorsCarousel .card").forEach(card => {
  card.addEventListener("click", () => {
    const ind = card.dataset.indicator;
    showIndicatorDetail(ind);
  });
});

function showIndicatorDetail(ind) {
  const details = {
    alegria: `🌟 Alegría (60–75 dB)\n✨ ¡Tu voz está brillando de alegría! Se nota entusiasmo y buena vibra.\n🎮 Dato curioso: cuando sonríes al hablar, tus cuerdas vocales vibran distinto.\n👉 Mini-reto: intenta grabarte diciendo una frase con y sin sonrisa.`,
    enojo: `🔥 Enojo (75–90 dB)\n😤 Tu voz está encendida como una llama.\n📚 Dato curioso: al enojarnos, los músculos del cuello se tensan.\n👉 Juego rápido: antes de responder, pon un temporizador de 10s y respira.`,
    estres: `⚡ Estrés (65–80 dB)\n⏳ Tu voz suena como un motor acelerado.\n🔍 Dato curioso: el estrés activa la adrenalina.\n👉 Ejercicio: coloca una mano en tu abdomen y respira profundo 5 veces.`,
    ansiedad: `🌊 Ansiedad (55–70 dB)\n💙 Tu voz tiene olas de inestabilidad.\n🧠 Dato curioso: cuando estamos ansiosos, el cuerpo tiembla levemente.\n👉 Dinámica: lee un texto en voz alta muy lentamente como narrador.`,
    tristeza: `🌧️ Tristeza (35–55 dB)\n🌥️ Tu voz se escucha bajita y sin energía.\n📖 Dato curioso: la tristeza activa menos músculos en la laringe.\n👉 Mini-desafío: cambia de lugar y vuelve a hablar, tu entorno puede ayudar.`
  };
  document.getElementById("indicatorDetail").innerHTML = `<pre>${details[ind]}</pre>`;
  showScreen("screen5");
}
