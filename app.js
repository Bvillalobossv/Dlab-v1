/* =========================================================
   SenseWell v2
   - Login/Signup local
   - Selfie emocional (face-api)
   - Medición de ruido 5s con progreso y tips
   - Tabla dB(A) actualizada y tarjetas
   - Body Scan en 3 zonas
   - Integración total + mascota
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

/* ------------------------- Navegación básica ------------------------- */
function show(id) { $$(".screen").forEach(s => s.classList.remove("active")); $(id).classList.add("active"); }

window.addEventListener("load", () => {
  bindAuth();
  bindFace();
  bindMeasure();
  bindResults();
  bindScan();
  bindIntegration();
  // Sesión
  const user = localStorage.getItem("sw_user");
  if (user) show("#screenFace"); else show("#screenAuth");
});

/* ------------------------- Datos en memoria ------------------------- */
const appState = {
  user: null,
  selfie: { emotion: null, score: 0, confidence: 0, tip: "" },
  noise: { avgDb: null, label: null, item: null },
  body: { head: 5, upper: 5, lower: 5, total: 5, fatiga: 5, symptoms: [] },
  history: [] // {date, avgDb}
};

/* ------------------------- Tabla dB(A) (actualizada) -------------------------
   Basado en la tabla que enviaste:
   Rango | Uso recomendado | Efectos
--------------------------------------------------------------------------- */
const DB_TABLE = [
  {range:"<35", min:-Infinity, max:35, title:"Silencio profundo", label:"Muy silencioso", color:"#10b981",
   use:"Puede sentirse “demasiado” quieto.", effect:"Ambiente muy calmado; no siempre óptimo para actividad social."},
  {range:"35–40", min:35, max:40, title:"Hab. tranquila", label:"Ideal para foco alto", color:"#22c55e",
   use:"Oficinas privadas y salas de reunión (BS 8233).", effect:"Ambiente muy favorable a la concentración."},
  {range:"40–45", min:40, max:45, title:"Lluvia moderada (lím inf ≈50)", label:"Discreto", color:"#84cc16",
   use:"Rango frecuente en oficinas de concentración.", effect:"Buena inteligibilidad propia; baja distracción si el habla ajena no es inteligible."},
  {range:"45–50", min:45, max:50, title:"Conversación suave", label:"Típico open plan controlado", color:"#f59e0b",
   use:"Objetivo típico en open plan (BS 8233 sugiere 45–50).", effect:"Si hay conversación cercana inteligible, puede distraer."},
  {range:"≈50",  min:49.5, max:50.5, title:"Zumbido saludable", label:"Punto dulce fisiológico", color:"#a855f7",
   use:"Estudio reciente: ~50 dB(A) maximiza marcadores de bienestar.", effect:"Ruido demasiado bajo o alto reduce bienestar."},
  {range:"50–55", min:50, max:55, title:"Conversación normal", label:"Colaborativo", color:"#f97316",
   use:"Zonas colaborativas, pasillos, cafeterías tranquilas.", effect:"Aumenta distracción si el habla es inteligible; cuidar diseño acústico."},
  {range:"55–60", min:55, max:60, title:"Conversación clara", label:"Cuidado con la fatiga", color:"#ef4444",
   use:"Riesgo de fatiga cognitiva.", effect:"Deterioro de memoria de trabajo al subir desde 50 dB."},
  {range:"60–65", min:60, max:65, title:"Conversación elevada", label:"No recomendable para foco", color:"#dc2626",
   use:"Típico zonas de alta interacción.", effect:"Fuerte distracción por habla; Lombard aumenta la voz de todos."},
  {range:"≥70", min:70, max:Infinity, title:"Aspiradora/tráfico", label:"No apropiado", color:"#b91c1c",
   use:"Solo eventos puntuales.", effect:"Acercándose a umbrales legales de exposición."}
];

// imágenes de estados / mascota
const MASCOT_IMGS = {
  alegria: "images/ind-alegria.png",
  ansiedad: "images/ind-ansiedad.png",
  enojo: "images/ind-enojo.png",
  estres: "images/ind-estres.png",
  tristeza: "images/ind-tristeza.png",
  neutral: "images/ind-alegria.png" // fallback
};

const MOTIVATION = [
  "Respira 4s por la nariz, suelta 6s por la boca.",
  "Toma agua: 2–3 sorbos mejoran tu alerta.",
  "Micro-pausa: mueve hombros hacia atrás 5 veces.",
  "Enfoca la vista en algo lejano 20s; descansa tus ojos.",
  "Sonríe suave 10s: tu cuerpo lee esa señal 🙂",
  "Chequeo corporal: afloja mandíbula y relaja el cuello."
];

/* =============================== AUTH =============================== */
function bindAuth() {
  const tabLogin = $("#authTabLogin");
  const tabSignup = $("#authTabSignup");
  const fLogin = $("#formLogin");
  const fSignup = $("#formSignup");

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active"); tabSignup.classList.remove("active");
    fLogin.style.display = ""; fSignup.style.display = "none";
  });
  tabSignup.addEventListener("click", () => {
    tabSignup.classList.add("active"); tabLogin.classList.remove("active");
    fLogin.style.display = "none"; fSignup.style.display = "";
  });

  fLogin.addEventListener("submit", (e)=>{
    e.preventDefault();
    const u = $("#login_user").value.trim();
    const p = $("#login_pass").value;
    const users = JSON.parse(localStorage.getItem("sw_users")||"{}");
    if(users[u] && users[u]===p){
      localStorage.setItem("sw_user", u);
      appState.user = u;
      show("#screenFace");
    } else alert("Usuario o contraseña inválidos.");
  });

  fSignup.addEventListener("submit", (e)=>{
    e.preventDefault();
    const u = $("#su_user").value.trim();
    const p = $("#su_pass").value;
    const users = JSON.parse(localStorage.getItem("sw_users")||"{}");
    if(users[u]) return alert("Ese usuario ya existe.");
    users[u]=p;
    localStorage.setItem("sw_users", JSON.stringify(users));
    localStorage.setItem("sw_user", u);
    appState.user = u;
    show("#screenFace");
  });
}

/* =============================== SELFIE =============================== */
let faceStream = null;
async function loadFaceModels() {
  // Modelos livianos
  const URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceExpressionNet.loadFromUri(URL)
  ]);
}

function bindFace(){
  $("#btnFaceStart").addEventListener("click", async ()=>{
    await loadFaceModels();
    try {
      faceStream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
      $("#faceVideo").srcObject = faceStream;
      $("#btnFaceSnap").disabled = false;
    } catch(e){ alert("No se pudo acceder a la cámara."); }
  });

  $("#btnFaceSnap").addEventListener("click", async ()=>{
    const video = $("#faceVideo");
    const canvas = $("#faceCanvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video,0,0,canvas.width,canvas.height);

    const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
    if(!det || !det.expressions) { alert("No se detectó rostro. Intenta con buena luz."); return; }
    // Emoción dominante
    const exprs = det.expressions;
    let maxKey = Object.keys(exprs).reduce((a,b)=> exprs[a] > exprs[b] ? a : b);
    const conf = (exprs[maxKey]*100).toFixed(1);
    let emotion = "neutral";
    if (maxKey==="happy") emotion = "alegria";
    else if (["angry","disgusted"].includes(maxKey)) emotion = "enojo";
    else if (maxKey==="sad") emotion = "tristeza";
    else if (["fearful","surprised"].includes(maxKey)) emotion = "ansiedad";
    else if (maxKey==="neutral") emotion = "neutral";

    const score = faceEmotionToScore(emotion); // 0 malo – 100 bueno
    const tip = faceEmotionTip(emotion);

    appState.selfie = { emotion, score, confidence: Number(conf), tip };
    $("#faceEmotion").textContent = emotion.toUpperCase();
    $("#faceConfidence").textContent = conf + "%";
    $("#faceMascot").src = MASCOT_IMGS[emotion];
    $("#faceTip").textContent = tip;
    $("#btnFaceNext").disabled = false;
  });

  $("#btnFaceNext").addEventListener("click", ()=>{
    stopFace();
    show("#screenMicIntro");
  });
  $("#btnFaceSkip").addEventListener("click", ()=>{
    appState.selfie = { emotion:"neutral", score:70, confidence:0, tip:"" };
    stopFace();
    show("#screenMicIntro");
  });
}

function stopFace(){
  try { faceStream?.getTracks().forEach(t=>t.stop()); } catch(e){}
}

function faceEmotionToScore(e){
  switch(e){
    case "alegria": return 90;
    case "neutral": return 70;
    case "ansiedad": return 45;
    case "tristeza": return 40;
    case "enojo": return 35;
    default: return 60;
  }
}
function faceEmotionTip(e){
  switch(e){
    case "alegria": return "¡Esa energía se contagia! Mantén pausas activas para sostenerla.";
    case "neutral": return "Buen punto de partida. Un vaso de agua y a por ello.";
    case "ansiedad": return "Inhala 4s, exhala 6s por 1 minuto. Baja el pulso y retoma foco.";
    case "tristeza": return "Haz una micro-pausa con luz natural o música suave por 3 minutos.";
    case "enojo": return "Cuenta 10 respiraciones y mueve hombros. Responde después de ese ciclo.";
    default: return "";
  }
}

/* =============================== MEDICIÓN 5s =============================== */
let audioCtx, analyser, micSource, rafId;
let measuring = false;
const SAMPLE_MS = 5000;

function bindMeasure(){
  $("#btnMicGo").addEventListener("click", ()=> show("#screenMeasure"));

  $("#calibration").addEventListener("input", e => $("#calVal").textContent = e.target.value);

  $("#toggleBtn").addEventListener("click", async ()=>{
    if(measuring){ stopMeasure(); return; }
    measuring = true;
    $("#btnMeasureToResults").disabled = true;
    $("#toggleBtn").textContent = "⏹️ Detener";
    $("#status").textContent = "Preparando micrófono…";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = Number($("#smoothing").value);
      micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);

      start5sMeasurement();
    } catch(e){ alert("No se pudo acceder al micrófono."); measuring=false; $("#toggleBtn").textContent="🎙️ Iniciar 5s"; }
  });

  $("#btnMeasureToResults").addEventListener("click", ()=>{
    renderNoiseResults();
    show("#screenResults");
  });

  $("#btnRetry").addEventListener("click", ()=> show("#screenMeasure"));
}

function start5sMeasurement(){
  const start = performance.now();
  const buf = new Float32Array(analyser.fftSize);
  const samples = [];
  let tipIdx = 0;
  const tipIv = setInterval(()=>{
    $("#motivation").textContent = MOTIVATION[tipIdx++ % MOTIVATION.length];
  }, 1000);

  const loop = ()=>{
    if(!measuring) return;
    analyser.getFloatTimeDomainData(buf);
    // RMS → dBFS
    let rms = 0;
    for(let i=0;i<buf.length;i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms / buf.length);
    const dbfs = 20 * Math.log10(rms || 1e-8);
    const cal = Number($("#calibration").value);
    const db = Math.max(0, Math.round(dbfs + 90 + cal)); // aproximación a dB(A)
    $("#dbValue").textContent = db.toString();
    samples.push(db);

    // progreso
    const elapsed = performance.now() - start;
    const pct = Math.min(100, (elapsed / SAMPLE_MS) * 100);
    $("#bar").style.width = pct + "%";
    $("#status").textContent = pct < 100 ? "Midiendo… mantén el celular quieto" : "Listo, procesando…";

    if(elapsed >= SAMPLE_MS){
      measuring = false;
      stopMeasure();
      clearInterval(tipIv);
      // promedio
      const avg = Math.round(samples.reduce((a,b)=>a+b,0) / samples.length);
      const item = classifyDb(avg);
      appState.noise = { avgDb: avg, label: item.label, item };
      appState.history.push({date: Date.now(), avgDb: avg});
      $("#btnMeasureToResults").disabled = false;
      $("#status").textContent = "Medición finalizada.";
    } else {
      rafId = requestAnimationFrame(loop);
    }
  };
  rafId = requestAnimationFrame(loop);
}

function stopMeasure(){
  try{ if(rafId) cancelAnimationFrame(rafId); }catch(e){}
  try{ micSource?.mediaStream.getTracks().forEach(t=>t.stop()); }catch(e){}
  try{ audioCtx?.close(); }catch(e){}
  $("#toggleBtn").textContent = "🎙️ Iniciar 5s";
}

/* ------------------------- Clasificación dB ------------------------- */
function classifyDb(db){
  // Busca el rango que contenga el promedio
  let chosen = DB_TABLE.find(r => db>=r.min && db<r.max) || DB_TABLE[DB_TABLE.length-1];
  return {
    ...chosen,
    label: chosen.label,
    detail: `${chosen.title}. Uso: ${chosen.use}. Efectos: ${chosen.effect}.`
  };
}

/* =============================== RESULTADOS RUIDO =============================== */
let historyChart;
function bindResults(){
  $("#tabNoise").addEventListener("click", ()=>{
    $("#tabNoise").classList.add("active"); $("#tabScan").classList.remove("active");
    show("#screenResults");
  });
  $("#tabScan").addEventListener("click", ()=>{
    show("#screenScanIntro");
  });
  $("#btnBackResults").addEventListener("click", ()=> show("#screenResults"));
}

function renderNoiseResults(){
  const {noise, selfie} = appState;
  // Resumen
  $("#resultsSummary").innerHTML =
    `Promedio medido: <b>${noise.avgDb} dB(A)</b> · ${noise.item.label}. ` +
    `Selfie emocional: <b>${(selfie.emotion||"—").toUpperCase()}</b>.`;

  // Indicador actual
  const el = $("#currentIndicator");
  el.innerHTML = `
    <img src="${pickMascotFromNoise(noise.avgDb)}" alt="mascota" />
    <div class="tag" style="border-color:${noise.item.color}; color:${noise.item.color}">${noise.item.range}</div>
    <p><b>${noise.item.label}</b></p>
    <p class="muted small">${noise.detail}</p>
  `;
  el.onclick = ()=> {
    $("#indicatorDetail").innerHTML = `
      <img src="${pickMascotFromNoise(noise.avgDb)}" alt="">
      <h3>${noise.item.title} (${noise.item.range})</h3>
      <p><b>Uso recomendado:</b> ${noise.item.use}</p>
      <p><b>Efectos:</b> ${noise.item.effect}</p>
    `;
    show("#screenIndicatorDetail");
  };

  // Cards de toda la tabla
  const wrap = $("#allIndicators");
  wrap.innerHTML = "";
  DB_TABLE.forEach(r=>{
    const card = document.createElement("div");
    card.className = "indicator-card";
    card.innerHTML = `
      <img src="${pickMascotFromNoise((r.min+r.max)/2)}" alt="">
      <div class="tag" style="border-color:${r.color}; color:${r.color}">${r.range}</div>
      <p><b>${r.label}</b></p>
    `;
    card.title = `${r.title} · ${r.use}`;
    card.onclick = ()=>{
      $("#indicatorDetail").innerHTML = `
        <img src="${pickMascotFromNoise((r.min+r.max)/2)}" alt="">
        <h3>${r.title} (${r.range})</h3>
        <p><b>Uso recomendado:</b> ${r.use}</p>
        <p><b>Efectos:</b> ${r.effect}</p>
      `;
      show("#screenIndicatorDetail");
    };
    wrap.appendChild(card);
  });

  // Gráfico histórico
  const ctx = $("#historyChart").getContext("2d");
  const labels = appState.history.map(h=> new Date(h.date).toLocaleTimeString());
  const data = appState.history.map(h=> h.avgDb);
  historyChart?.destroy();
  historyChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "dB(A) promedio (5s)", data, fill:false }]},
    options: { responsive:true, scales:{ y:{ beginAtZero:true }}}
  });
}

function pickMascotFromNoise(db){
  if(db < 40) return MASCOT_IMGS.alegria;
  if(db < 50) return MASCOT_IMGS.neutral;
  if(db < 55) return MASCOT_IMGS.ansiedad;
  if(db < 65) return MASCOT_IMGS.estres;
  return MASCOT_IMGS.enojo;
}

/* =============================== ESCANEO CORPORAL =============================== */
function bindScan(){
  $("#btnScanStart").addEventListener("click", ()=> show("#screenSurvey"));
  $("#btnScanIntroBack").addEventListener("click", ()=> show("#screenResults"));
  $("#btnSurveyBack").addEventListener("click", ()=> show("#screenScanIntro"));
  $("#btnToBodyScan").addEventListener("click", ()=>{
    // Validar campos mínimos
    if(!$("#ws_datetime").value || !$("#ws_area").value || !$("#ws_hours").value) return alert("Completa fecha, área y horas.");
    show("#screenBodyScan");
  });

  $("#btnBodyScanBack").addEventListener("click", ()=> show("#screenSurvey"));

  $("#btnBodyScanFinish").addEventListener("click", ()=>{
    // Guardar resultados Body Scan 3 zonas
    const head = Number($("#bs_head_tension").value);
    const upper = Number($("#bs_upper_tension").value);
    const lower = Number($("#bs_lower_tension").value);
    const total = Number($("#bs_total").value);
    const fatiga = Number($("#bs_fatiga").value);

    const symptoms = [
      ...$$(".symptomHead:checked").map(i=>i.value),
      ...$$(".symptomUpper:checked").map(i=>i.value),
      ...$$(".symptomLower:checked").map(i=>i.value)
    ];

    const avg = Number(((head+upper+lower)/3).toFixed(1));
    appState.body = { head, upper, lower, total, fatiga, symptoms };

    // Pintar pantalla de resultados
    $("#bs_head_out").textContent = head;
    $("#bs_upper_out").textContent = upper;
    $("#bs_lower_out").textContent = lower;
    $("#bs_avg").textContent = avg;
    $("#bs_total_display").textContent = total;
    $("#bs_fatiga_display").textContent = fatiga;
    $("#bs_symptoms_display").textContent = symptoms.length ? symptoms.join(", ") : "Ninguno";

    const ctx = $("#bsChart").getContext("2d");
    new Chart(ctx, {
      type: "radar",
      data: {
        labels: ["Cabeza","Tren superior","Tren inferior","Total","Fatiga"],
        datasets: [{ label: "Tensión 1–10", data: [head,upper,lower,total,fatiga]}]
      },
      options: { responsive:true, scales:{ r:{ min:0, max:10 } } }
    });

    show("#screenScanResults");
  });

  $("#btnScanResultsBack").addEventListener("click", ()=> show("#screenBodyScan"));
}

/* =============================== INTEGRACIÓN =============================== */
function bindIntegration(){
  $("#btnGoIntegration").addEventListener("click", ()=>{
    computeIntegration();
    show("#screenIntegration");
  });
  $("#btnToIntegration").addEventListener("click", ()=>{
    computeIntegration();
    show("#screenIntegration");
  });
  $("#btnIntegrationBack").addEventListener("click", ()=> show("#screenScanResults"));
  $("#btnIntegrationHome").addEventListener("click", ()=> show("#screenFace"));
}

function computeIntegration(){
  const { selfie, noise, body } = appState;
  const bsAvg = Number(((body.head + body.upper + body.lower)/3).toFixed(1));
  // Normalizaciones → 0 malo … 100 bueno
  const faceScore = selfie.score; // ya normalizado
  const noiseScore = mapNoiseToScore(noise.avgDb);
  const bodyScore = 100 - ( (bsAvg*4 + body.total*3 + body.fatiga*3)/10 ); // pondera más tensión y total/fatiga

  // Pesos: 25% selfie, 35% ruido, 40% cuerpo
  const ix = Math.round(0.25*faceScore + 0.35*noiseScore + 0.40*bodyScore);

  $("#ix_face_emotion").textContent = selfie.emotion?.toUpperCase() || "—";
  $("#ix_face_score").textContent = Math.round(faceScore);
  $("#ix_db").textContent = noise.avgDb ?? "—";
  $("#ix_db_class").textContent = noise.item?.label ?? "—";
  $("#ix_bs_avg").textContent = bsAvg;
  $("#ix_bs_total").textContent = body.total;

  const { label, reco, mascot } = labelFromIndex(ix);
  $("#ix_score").textContent = ix;
  $("#ix_label").textContent = label;
  $("#ix_reco").textContent = reco;
  $("#ix_mascot").src = mascot;
}

function mapNoiseToScore(db){
  // 100 en ~50 dB; cae hacia extremos
  const diff = Math.abs(db - 50);
  const sc = Math.max(0, 100 - diff*3); // cada dB alejado de 50 resta 3
  return Math.min(100, sc);
}

function labelFromIndex(ix){
  if(ix>=80) return {label:"Muy bien", reco:"Mantén pausas breves y rutina de hidratación. Estás en tu zona 👏", mascot:MASCOT_IMGS.alegria};
  if(ix>=65) return {label:"Bien", reco:"Sigue con pausas cada 60–90 min y cuida la postura.", mascot:MASCOT_IMGS.neutral};
  if(ix>=50) return {label:"Atento/a", reco:"Prueba respiración 4-6, ajusta ruido o auriculares con música neutra.", mascot:MASCOT_IMGS.ansiedad};
  if(ix>=35) return {label:"Alto estrés", reco:"Programa una pausa de 3–5 min, estira cuello/hombros y baja estímulos.", mascot:MASCOT_IMGS.estres};
  return {label:"Crítico", reco:"Busca un espacio más silencioso y toma una pausa larga. Si persiste, informa a tu supervisor.", mascot:MASCOT_IMGS.enojo};
}
