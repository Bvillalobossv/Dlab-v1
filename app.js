// -------- Manejo de pantallas --------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.getElementById("btnStart").addEventListener("click", () => {
  showScreen("screen2");
});

document.getElementById("btnNext").addEventListener("click", () => {
  showScreen("screen3");
});

document.getElementById("btnRetry")?.addEventListener("click", () => {
  showScreen("screen3");
});

// -------- Configuración de clasificación --------
const CLASSES = [
  { min: -Infinity, max: 55,  label: "Tristeza", emoji: "🌧️", color: "#3b82f6" },
  { min: 55,        max: 65,  label: "Ansiedad", emoji: "🌊", color: "#eab308" },
  { min: 65,        max: 75,  label: "Estrés",   emoji: "⚡", color: "#f97316" },
  { min: 75,        max: 90,  label: "Enojo",    emoji: "🔥", color: "#ef4444" },
  { min: 60,        max: 72,  label: "Alegría",  emoji: "🌟", color: "#10b981", priority: 1 },
];

// Indicadores con imágenes
const INDICATORS = {
  Alegría:  { emoji: "🌟", img: "images/ind-alegria.png",   range: "60–72 dB" },
  Enojo:    { emoji: "🔥", img: "images/ind-enojo.png",     range: "75–90 dB" },
  Estrés:   { emoji: "⚡", img: "images/ind-estres.png",    range: "65–80 dB" },
  Ansiedad: { emoji: "🌊", img: "images/ind-ansiedad.png",  range: "55–70 dB" },
  Tristeza: { emoji: "🌧️", img: "images/ind-tristeza.png", range: "35–55 dB" }
};

const toggleBtn   = document.getElementById("toggleBtn");
const dbValueEl   = document.getElementById("dbValue");
const barEl       = document.getElementById("bar");
const statusEl    = document.getElementById("status");
const calSlider   = document.getElementById("calibration");
const calValEl    = document.getElementById("calVal");
const smoothingEl = document.getElementById("smoothing");

let audioContext, analyser, sourceNode, mediaStream;
let dataBuf;

// ---- Historial por días ----
let allDays = []; // [{ day: 1, measurements: [60, 62] }]
let currentDay = 1;

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
  statusEl.innerHTML = `<span class="tag" style="border-color:${color}; color:${color}">${emoji} ${label}</span>`;
}

function rmsToDb(rms) {
  const min = 1e-8;
  const val = Math.max(min, rms);
  return 20 * Math.log10(val);
}

function computeRmsFloat(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

async function startMeasurement() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = parseFloat(smoothingEl.value);

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);

    dataBuf = new Float32Array(analyser.fftSize);

    // Mostrar estado de análisis
    dbValueEl.textContent = "…";
    setStatus("Analizando ambiente laboral...", "⏳", "#0ea5e9");
    barEl.style.width = "0%";

    let samples = [];
    const duration = 5000; // ms
    const interval = 100;  // ms

    const intervalId = setInterval(() => {
      analyser.getFloatTimeDomainData(dataBuf);
      const rms = computeRmsFloat(dataBuf);
      let db = rmsToDb(rms);

      const calibration = parseInt(calSlider.value, 10) || 0;
      let dbMapped = Math.round(30 + ((db + 60) / 60) * 60 + calibration);

      samples.push(dbMapped);
    }, interval);

    setTimeout(() => {
      clearInterval(intervalId);

      if (samples.length === 0) {
        dbValueEl.textContent = "—";
        setStatus("Sin datos", "⚠️", "#f59e0b");
        return;
      }

      const avg = Math.round(samples.reduce((a,b)=>a+b,0) / samples.length);
      dbValueEl.textContent = avg;
      barEl.style.width = `${((avg-30)/60)*100}%`;

      const cls = classify(avg);
      if (cls) setStatus(cls.label, cls.emoji, cls.color);

      showResults(avg, cls);

      mediaStream.getTracks().forEach(t => t.stop());
      audioContext.close();
    }, duration);

  } catch (err) {
    console.error(err);
    alert("No se pudo acceder al micrófono. Asegúrate de otorgar permisos y usar HTTPS.");
  }
}

// -------- Mostrar resultados --------
function showResults(avg, cls) {
  showScreen("screen4");

  document.getElementById("resultsSummary").textContent =
    `Esta semana los decibeles fueron ${avg} dB. Voces ${cls.label.toLowerCase()} de lo habitual.`;

  // Guardar en el día actual
  let today = allDays.find(d => d.day === currentDay);
  if (!today) {
    today = { day: currentDay, measurements: [] };
    allDays.push(today);
  }
  today.measurements.push(avg);

  // Indicador actual
  const current = INDICATORS[cls.label];
  document.getElementById("currentIndicator").innerHTML = `
    <img src="${current.img}" alt="${cls.label}">
    <p>${current.emoji} <strong>${cls.label}</strong></p>
    <p>${current.range}</p>
  `;

  // Carrusel de todos
  const allDiv = document.getElementById("allIndicators");
  allDiv.innerHTML = "";
  Object.entries(INDICATORS).forEach(([key, val]) => {
    allDiv.innerHTML += `
      <div class="indicator-card">
        <img src="${val.img}" alt="${key}">
        <p>${val.emoji} ${key}</p>
        <p>${val.range}</p>
      </div>
    `;
  });

  renderCharts();
}

// -------- Gráficos con Chart.js --------
let dailyChartInstance, summaryChartInstance;

function renderCharts() {
  const today = allDays.find(d => d.day === currentDay);

  // --- Gráfico diario ---
  const ctx1 = document.getElementById("dailyChart").getContext("2d");
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(ctx1, {
    type: "line",
    data: {
      labels: today.measurements.map((_, i) => `Medición ${i+1}`),
      datasets: [{
        label: `Día ${currentDay}`,
        data: today.measurements,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Decibeles" } },
        x: { title: { display: true, text: "Mediciones" } }
      }
    }
  });

  // --- Gráfico resumen ---
  const ctx2 = document.getElementById("summaryChart").getContext("2d");
  if (summaryChartInstance) summaryChartInstance.destroy();
  const labels = allDays.map(d => `Día ${d.day}`);
  const averages = allDays.map(d => {
    const sum = d.measurements.reduce((a,b)=>a+b,0);
    return Math.round(sum / d.measurements.length);
  });

  summaryChartInstance = new Chart(ctx2, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Promedio diario",
        data: averages,
        backgroundColor: "rgba(16,185,129,0.6)",
        borderColor: "#10b981",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Decibeles" } },
        x: { title: { display: true, text: "Días" } }
      }
    }
  });
}

// -------- Botón "Nuevo día" --------
document.getElementById("btnNewDay")?.addEventListener("click", () => {
  currentDay++;
  alert(`Has iniciado el Día ${currentDay}. ¡Realiza nuevas mediciones!`);
});

// -------- UI binding --------
toggleBtn.addEventListener("click", startMeasurement);
calSlider.addEventListener("input", () => { calValEl.textContent = calSlider.value; });
