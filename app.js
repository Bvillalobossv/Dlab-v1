// -------- Manejo de pantallas --------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// Botones de navegación existentes
document.getElementById("btnStart").addEventListener("click", () => showScreen("screen2"));
document.getElementById("btnNext").addEventListener("click", () => showScreen("screen3"));
document.getElementById("btnRetry")?.addEventListener("click", () => showScreen("screen3"));
document.getElementById("btnBackResults")?.addEventListener("click", () => showScreen("screen4"));

// Tabs (en resultados)
document.getElementById("tabNoise")?.addEventListener("click", () => {
  setActiveTab("tabNoise");
  showScreen("screen4");
});
document.getElementById("tabScan")?.addEventListener("click", () => {
  setActiveTab("tabScan");
  showScreen("screen6");
});
function setActiveTab(which) {
  document.querySelectorAll(".segment").forEach(b => b.classList.remove("active"));
  document.getElementById(which).classList.add("active");
}

// -------- Configuración de clasificación --------
const CLASSES = [
  { min: -Infinity, max: 55,  label: "Tristeza", emoji: "🌧️", color: "#3b82f6" },
  { min: 55,        max: 65,  label: "Ansiedad", emoji: "🌊", color: "#eab308" },
  { min: 65,        max: 75,  label: "Estrés",   emoji: "⚡", color: "#f97316" },
  { min: 75,        max: 90,  label: "Enojo",    emoji: "🔥", color: "#ef4444" },
  { min: 60,        max: 72,  label: "Alegría",  emoji: "🌟", color: "#10b981", priority: 1 },
];

// Indicadores con imágenes y descripciones
const INDICATORS = {
  Alegría: {
    emoji: "🌟",
    img: "images/ind-alegria.png",
    range: "60–72 dB",
    description:
      `✨ ¡Tu voz está brillando de alegría! Se nota entusiasmo y buena vibra.
🎮 Dato curioso: cuando sonríes al hablar, tus cuerdas vocales vibran distinto.
👉 Mini-reto: intenta grabarte diciendo una frase con y sin sonrisa…`
  },
  Enojo: {
    emoji: "🔥",
    img: "images/ind-enojo.png",
    range: "75–90 dB",
    description:
      `😤 Tu voz transmite enojo o tensión.
📚 Dato curioso: al enojarnos, los músculos del cuello se tensan y la voz suena más fuerte.
👉 Juego rápido: respira 10s antes de responder.`
  },
  Estrés: {
    emoji: "⚡",
    img: "images/ind-estres.png",
    range: "65–80 dB",
    description:
      `⏳ Tu voz suena acelerada bajo estrés.
🔍 Dato curioso: el estrés activa la adrenalina y acelera el ritmo.
👉 Ejercicio: respira profundamente 5 veces con mano en el abdomen.`
  },
  Ansiedad: {
    emoji: "🌊",
    img: "images/ind-ansiedad.png",
    range: "55–70 dB",
    description:
      `💙 La ansiedad hace tu voz temblorosa o inestable.
🧠 Dato curioso: el cuerpo tiembla levemente y eso se refleja en la voz.
👉 Dinámica: lee un texto lentamente como narrador de audiolibro.`
  },
  Tristeza: {
    emoji: "🌧️",
    img: "images/ind-tristeza.png",
    range: "35–55 dB",
    description:
      `🌥️ Tu voz se escucha bajita y sin energía.
📖 Dato curioso: la tristeza activa menos músculos en la laringe.
👉 Mini-desafío: habla en un lugar con más luz o abre una ventana.`
  }
};

// -------- Refs UI --------
const toggleBtn   = document.getElementById("toggleBtn");
const dbValueEl   = document.getElementById("dbValue");
const barEl       = document.getElementById("bar");
const statusEl    = document.getElementById("status");
const calSlider   = document.getElementById("calibration");
const calValEl    = document.getElementById("calVal");
const smoothingEl = document.getElementById("smoothing");

// Estado
let audioContext, analyser, sourceNode, mediaStream;
let dataBuf;
let history = []; // guardamos promedios por sesión
let lastAvgDb = null; // último promedio calculado

// -------- Utilidades --------
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

// -------- Medición de ruido --------
async function startMeasurement() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = parseFloat(smoothingEl.value);

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);

    dataBuf = new Float32Array(analyser.fftSize);

    dbValueEl.textContent = "…";
    setStatus("Analizando ambiente...", "⏳", "#0ea5e9");
    barEl.style.width = "0%";

    let samples = [];
    const duration = 5000;   // ms
    const interval = 100;    // ms

    const intervalId = setInterval(() => {
      analyser.getFloatTimeDomainData(dataBuf);
      const rms = computeRmsFloat(dataBuf);
      let db = rmsToDb(rms);

      const calibration = parseInt(calSlider.value, 10) || 0;
      let dbMapped = Math.round(30 + ((db + 60) / 60) * 60 + calibration); // mapea aprox 30-90 dBFS -> dB SPL aprox
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
      lastAvgDb = avg;
      dbValueEl.textContent = avg;
      barEl.style.width = `${((avg-30)/60)*100}%`;

      const cls = classify(avg);
      if (cls) setStatus(cls.label, cls.emoji, cls.color);

      history.push(avg);
      showResults(avg, cls);

      mediaStream.getTracks().forEach(t => t.stop());
      audioContext.close();
    }, duration);

  } catch (err) {
    console.error(err);
    alert("No se pudo acceder al micrófono. Activa permisos y usa HTTPS.");
  }
}

// -------- Mostrar resultados de ruido --------
function showResults(avg, cls) {
  showScreen("screen4");

  document.getElementById("resultsSummary").textContent =
    `Esta semana los decibeles fueron ${avg} dB. Voces ${cls.label.toLowerCase()} de lo habitual.`;

  const current = INDICATORS[cls.label];
  document.getElementById("currentIndicator").innerHTML = `
    <img src="${current.img}" alt="${cls.label}">
    <p>${current.emoji} <strong>${cls.label}</strong></p>
    <p>${current.range}</p>
  `;

  const allDiv = document.getElementById("allIndicators");
  allDiv.innerHTML = "";
  Object.entries(INDICATORS).forEach(([key, val]) => {
    allDiv.innerHTML += `
      <div class="indicator-card" onclick="showIndicatorDetail('${key}')">
        <img src="${val.img}" alt="${key}">
        <p>${val.emoji} ${key}</p>
        <p>${val.range}</p>
      </div>
    `;
  });

  renderChart();
}

function showIndicatorDetail(key) {
  const ind = INDICATORS[key];
  const detailDiv = document.getElementById("indicatorDetail");
  detailDiv.innerHTML = `
    <img src="${ind.img}" alt="${key}">
    <h3>${ind.emoji} ${key}</h3>
    <p><strong>${ind.range}</strong></p>
    <p>${ind.description.replace(/\n/g, "<br>")}</p>
  `;
  showScreen("screen5");
}

// -------- Gráfico con Chart.js (ruido) --------
function renderChart() {
  const ctx = document.getElementById("historyChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((_, i) => `Día ${i+1}`),
      datasets: [{
        label: "Decibeles",
        data: history,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        fill: true,
        tension: 0.3,
        pointBackgroundColor: "#3b82f6"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Decibeles" } },
        x: { title: { display: true, text: "Días" } }
      }
    }
  });
}

// -------- UI binding (ruido) --------
toggleBtn?.addEventListener("click", startMeasurement);
calSlider?.addEventListener("input", () => { calValEl.textContent = calSlider.value; });

// ====== NUEVO: Flujo Escaneo Corporal ======

// Estado del flujo
const surveyData = {
  datetime: "",
  area: "Ventas",
  hours: 0,
  carga: 5, ritmo: 5, pausas: 5, apoyo: 5, comunicacion: 5, estres: 5
};

const zones = [
  "Pies y piernas",
  "Caderas y zona lumbar",
  "Abdomen y respiración",
  "Pecho",
  "Espalda alta y hombros",
  "Cuello y garganta",
  "Mandíbula y boca",
  "Frente, sienes y ojos",
  "Cabeza en general",
];

const bodyScan = {
  byZone: Object.fromEntries(zones.map(z => [z, 0])),
  symptoms: [],
  total: 5,
  fatiga: 5
};

// Intro → Encuesta
document.getElementById("btnScanStart")?.addEventListener("click", () => showScreen("screen7"));
document.getElementById("btnScanBackToResults")?.addEventListener("click", () => {
  setActiveTab("tabNoise");
  showScreen("screen4");
});

// Resultados → tab “Escaneo corporal”
document.getElementById("tabScan")?.addEventListener("click", () => showScreen("screen6"));

// Encuesta → Body scan
document.getElementById("btnToBodyScan")?.addEventListener("click", () => {
  // Capturar valores
  surveyData.datetime = document.getElementById("ws_datetime").value || new Date().toISOString().slice(0,16);
  surveyData.area = document.getElementById("ws_area").value;
  surveyData.hours = parseFloat(document.getElementById("ws_hours").value || "0");
  surveyData.carga = +document.getElementById("ws_carga").value;
  surveyData.ritmo = +document.getElementById("ws_ritmo").value;
  surveyData.pausas = +document.getElementById("ws_pausas").value;
  surveyData.apoyo = +document.getElementById("ws_apoyo").value;
  surveyData.comunicacion = +document.getElementById("ws_comunicacion").value;
  surveyData.estres = +document.getElementById("ws_estres").value;

  showScreen("screen8");
});

document.getElementById("btnSurveyBack")?.addEventListener("click", () => showScreen("screen6"));

// Body scan: click en zonas del SVG
document.getElementById("bodySvg")?.addEventListener("click", (e) => {
  if (!e.target.id?.startsWith("zone_")) return;
  const zoneName = e.target.id.replace("zone_", "");
  renderZonePanel(zoneName);
});

function renderZonePanel(zoneName) {
  const title = document.getElementById("zp_title");
  const content = document.getElementById("zp_content");
  title.textContent = zoneName;

  const current = bodyScan.byZone[zoneName] || 0;
  content.innerHTML = `
    <div class="slider-group">
      <label>Nivel de tensión en <b>${zoneName}</b></label>
      <input id="zp_range" type="range" min="1" max="10" value="${current || 5}" />
      <div class="range-ticks"><span>1</span><span>10</span></div>
    </div>
    <div class="stack-sm" style="justify-content:flex-start">
      <button id="zp_save" class="btn">Guardar zona</button>
      <button id="zp_clear" class="btn btn-secondary">Limpiar</button>
    </div>
  `;
  document.getElementById("zp_save").onclick = () => {
    const val = +document.getElementById("zp_range").value;
    bodyScan.byZone[zoneName] = val;
    content.insertAdjacentHTML("beforeend", `<p class="muted">Guardado: ${val}/10</p>`);
    refreshZonesListPreview();
  };
  document.getElementById("zp_clear").onclick = () => {
    bodyScan.byZone[zoneName] = 0;
    content.insertAdjacentHTML("beforeend", `<p class="muted">Zona reiniciada</p>`);
    refreshZonesListPreview();
  };
}

function refreshZonesListPreview() {
  // no-op visual en esta pantalla (se lista en resultados).
}

// Guardar síntomas, totales y pasar a resultados
document.getElementById("btnBodyScanFinish")?.addEventListener("click", () => {
  const symptoms = Array.from(document.querySelectorAll(".symptom"))
    .filter(c => c.checked).map(c => c.value);
  bodyScan.symptoms = symptoms;
  bodyScan.total = +document.getElementById("bs_total").value;
  bodyScan.fatiga = +document.getElementById("bs_fatiga").value;

  showBodyResults();
  showScreen("screen9");
});

document.getElementById("btnBodyScanBack")?.addEventListener("click", () => showScreen("screen7"));

// Render resultados del body scan
function showBodyResults() {
  const ul = document.getElementById("bs_zone_list");
  ul.innerHTML = "";
  zones.forEach(z => {
    const v = bodyScan.byZone[z] || 0;
    const li = document.createElement("li");
    li.textContent = `${z}: ${v || "—"}/10`;
    ul.appendChild(li);
  });

  const values = zones.map(z => bodyScan.byZone[z] || 0).filter(v => v>0);
  const avg = values.length ? (values.reduce((a,b)=>a+b,0)/values.length) : 0;
  document.getElementById("bs_avg").textContent = avg.toFixed(1);
  document.getElementById("bs_total_display").textContent = bodyScan.total;
  document.getElementById("bs_fatiga_display").textContent = bodyScan.fatiga;
  document.getElementById("bs_symptoms_display").textContent = bodyScan.symptoms.length ? bodyScan.symptoms.join(", ") : "Ninguno";

  // Chart
  const ctx = document.getElementById("bsChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: zones,
      datasets: [{ label: "Tensión por zona (1–10)", data: zones.map(z => bodyScan.byZone[z] || 0) }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { suggestedMin: 0, suggestedMax: 10 } }
    }
  });
}

document.getElementById("btnScanResultsBack")?.addEventListener("click", () => showScreen("screen8"));

// ----- Integración Ruido + Body scan -----
document.getElementById("btnToIntegration")?.addEventListener("click", () => {
  renderIntegration();
  showScreen("screen10");
});
document.getElementById("btnGoIntegration")?.addEventListener("click", () => {
  renderIntegration();
  showScreen("screen10");
});
document.getElementById("btnIntegrationBack")?.addEventListener("click", () => showScreen("screen9"));
document.getElementById("btnIntegrationHome")?.addEventListener("click", () => {
  setActiveTab("tabNoise");
  showScreen("screen4");
});

function renderIntegration() {
  // Valores base
  const db = lastAvgDb ?? (history.length ? history[history.length-1] : 0);
  const cls = db ? classify(db) : null;

  const values = zones.map(z => bodyScan.byZone[z] || 0).filter(v => v>0);
  const bsAvg = values.length ? (values.reduce((a,b)=>a+b,0)/values.length) : 0;

  // Normalizaciones simples:
  // dB 30-90 → 0-100
  const dbNorm = db ? Math.max(0, Math.min(100, ((db - 30) / 60) * 100)) : 0;
  // tensión 0-10 → 0-100
  const bsNorm = Math.max(0, Math.min(100, (bsAvg / 10) * 100));

  // Índice combinado (60% corporal, 40% ruido) – puedes ajustar pesos
  const score = Math.round(0.4 * dbNorm + 0.6 * bsNorm);

  let label = "Equilibrio";
  let reco = "Sigue con micro-pausas y buena hidratación.";
  if (score >= 70) { label = "Riesgo alto"; reco = "Realiza pausas guiadas y estiramientos ahora. Considera derivación si el malestar persiste."; }
  else if (score >= 50) { label = "Atención moderada"; reco = "Ajusta carga/ritmo. Practica respiración 4-6 y movilidad escapular 2-3 veces hoy."; }

  // Render
  document.getElementById("ix_db").textContent = db || "—";
  document.getElementById("ix_db_class").textContent = cls ? `${cls.emoji} ${cls.label}` : "—";
  document.getElementById("ix_bs_avg").textContent = bsAvg ? bsAvg.toFixed(1) : "—";
  document.getElementById("ix_bs_total").textContent = bodyScan.total || "—";
  document.getElementById("ix_score").textContent = score;
  document.getElementById("ix_label").textContent = label;
  document.getElementById("ix_reco").textContent = reco;
}
