/* =========================================================
   SenseWell v5 (Front-Only)
   ========================================================= */
const $  = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
function show(id){ $$(".screen").forEach(s=>s.classList.remove("active")); $(id).classList.add("active"); }

/* ======================= STATE ======================= */
const appState = {
  user: localStorage.getItem("sw_user") || null,
  selfie: { emotion:null, score:0, confidence:0, tip:"" },
  noise: { avgDb:null, label:null, item:null },
  body: { head:5, upper:5, lower:5, total:5, fatiga:5, symptoms:[] },
  history: [] // {date, avgDb}
};

/* ======================= ON LOAD ======================= */
window.addEventListener("load", () => {
  bindIntro();
  bindAuth();
  bindFace();
  bindMeasure();
  bindResults();
  bindScan();
  bindIntegration();
  if(appState.user) show("#screenFace"); else show("#screenIntro");
});

/* ======================= INTRO (Carousel) ======================= */
function bindIntro(){
  const slides = $("#introSlides");
  const dotsC  = $("#introDots");
  const next   = $("#introNext");
  const prev   = $("#introPrev");
  const start  = $("#introStart");

  const total = $$("#introSlides .slide").length;
  let idx=0;

  for(let i=0;i<total;i++){
    const d=document.createElement("div"); d.className="dot"+(i===0?" active":""); dotsC.appendChild(d);
  }
  const dots = $$("#introDots .dot");

  function update(){
    slides.scrollTo({left: idx*slides.clientWidth, behavior:"smooth"});
    dots.forEach((d,i)=> d.classList.toggle("active", i===idx));
    prev.disabled = idx===0;
    next.style.display = idx<(total-1) ? "" : "none";
    start.style.display= idx===(total-1) ? "" : "none";
  }
  next.onclick = ()=>{ idx=Math.min(total-1, idx+1); update(); };
  prev.onclick = ()=>{ idx=Math.max(0, idx-1); update(); };
  start.onclick= ()=> show("#screenAuth");
  window.addEventListener("resize", ()=> update());
  update();
}

/* ======================= AUTH ======================= */
function bindAuth(){
  const tabLogin  = $("#authTabLogin");
  const tabSignup = $("#authTabSignup");
  const fLogin    = $("#formLogin");
  const fSignup   = $("#formSignup");

  tabLogin.addEventListener("click", ()=>{ tabLogin.classList.add("active"); tabSignup.classList.remove("active"); fLogin.style.display=""; fSignup.style.display="none"; });
  tabSignup.addEventListener("click",()=>{ tabSignup.classList.add("active"); tabLogin.classList.remove("active"); fLogin.style.display="none"; fSignup.style.display=""; });

  fLogin.addEventListener("submit",(e)=>{
    e.preventDefault();
    const u = $("#login_user").value.trim();
    const p = $("#login_pass").value;
    const users = JSON.parse(localStorage.getItem("sw_users")||"{}");
    if(users[u] && users[u]===p){ localStorage.setItem("sw_user",u); appState.user=u; show("#screenFace"); }
    else alert("Usuario o contraseña inválidos.");
  });
  fSignup.addEventListener("submit",(e)=>{
    e.preventDefault();
    const u = $("#su_user").value.trim();
    const p = $("#su_pass").value;
    if(!$("#su_terms").checked) return alert("Debes aceptar los términos.");
    const users = JSON.parse(localStorage.getItem("sw_users")||"{}");
    if(users[u]) return alert("Ese usuario ya existe.");
    users[u]=p; localStorage.setItem("sw_users",JSON.stringify(users)); localStorage.setItem("sw_user",u); appState.user=u; show("#screenFace");
  });
}

/* ======================= SELFIE (face-api) ======================= */
let faceStream=null, faceModelsLoaded=false;

async function loadFaceModels(){
  if(faceModelsLoaded) return;
  const URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceExpressionNet.loadFromUri(URL)
  ]);
  faceModelsLoaded = true;
}

function bindFace(){
  const video = $("#faceVideo");
  video.setAttribute("playsinline",""); // iOS
  video.muted = true;                    // autoplay policy

  $("#btnFaceStart").addEventListener("click", async ()=>{
    try{
      await loadFaceModels();
      faceStream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:"user", width:{ideal:640}, height:{ideal:480} }, audio:false
      });
      video.srcObject = faceStream;
      await video.play(); // iOS needs explicit play after user gesture
      $("#btnFaceSnap").disabled = false;
      $("#faceHelp").textContent = "Cámara lista ✅";
      document.addEventListener("visibilitychange", ()=>{ if(document.hidden){ try{video.pause();}catch(_){} } else { try{video.play();}catch(_){} }});
    }catch(e){
      console.error(e);
      $("#faceHelp").textContent = readableCameraError(e);
    }
  });

  $("#btnFaceSnap").addEventListener("click", async ()=>{
    try{
      if(!faceModelsLoaded) await loadFaceModels();
      if(video.readyState < 2){ await new Promise(r=> video.onloadeddata = r); }

      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize:224, scoreThreshold:0.5 }))
        .withFaceExpressions();

      if(!det || !det.expressions){
        alert("No se detectó rostro. Intenta con más luz y mirando al centro.");
        return;
      }

      const exprs = det.expressions;
      const main = Object.keys(exprs).reduce((a,b)=> exprs[a] > exprs[b] ? a : b);
      const conf = (exprs[main]*100).toFixed(1);
      let emotion="neutral";
      if(main==="happy") emotion="alegria";
      else if(["angry","disgusted"].includes(main)) emotion="enojo";
      else if(main==="sad") emotion="tristeza";
      else if(["fearful","surprised"].includes(main)) emotion="ansiedad";

      const score = faceEmotionToScore(emotion);
      const tip   = faceEmotionTip(emotion);
      appState.selfie = { emotion, score, confidence:Number(conf), tip };

      $("#faceEmotion").textContent   = emotion.toUpperCase();
      $("#faceConfidence").textContent= conf+"%";
      $("#faceMascot").src            = MASCOT_IMGS[emotion] || MASCOT_IMGS.neutral;
      $("#faceTip").textContent       = tip;
      $("#btnFaceNext").disabled      = false;
    }catch(e){
      console.error(e);
      alert("Hubo un problema analizando la selfie. Reintenta con más luz o vuelve a activar la cámara.");
    }
  });

  $("#btnFaceNext").addEventListener("click", ()=>{ stopFace(); show("#screenMicIntro"); });
  $("#btnFaceSkip").addEventListener("click", ()=>{ appState.selfie={emotion:"neutral",score:70,confidence:0,tip:""}; stopFace(); show("#screenMicIntro"); });
}

function stopFace(){ try{ faceStream?.getTracks().forEach(t=>t.stop()); }catch(e){} }

function readableCameraError(e){
  const s = String(e && (e.name||e.message||e));
  if(/NotAllowedError|Permission/.test(s)) return "Acceso denegado. Ve a Ajustes del navegador y permite la cámara.";
  if(/NotFoundError|DevicesNotFound/.test(s)) return "No se encontró cámara disponible.";
  if(/NotReadableError|TrackStart/.test(s)) return "La cámara está en uso por otra app.";
  return "No se pudo acceder a la cámara. Usa HTTPS y otorga permisos.";
}

function faceEmotionToScore(e){ switch(e){ case "alegria":return 90; case "neutral":return 70; case "ansiedad":return 45; case "tristeza":return 40; case "enojo":return 35; default:return 60; } }
function faceEmotionTip(e){
  switch(e){
    case "alegria":  return "¡Esa energía se contagia! Mantén pausas activas para sostenerla.";
    case "neutral":  return "Buen punto de partida. Un vaso de agua y a por ello.";
    case "ansiedad": return "Inhala 4s, exhala 6s por 1 minuto. Baja el pulso y retoma foco.";
    case "tristeza": return "Busca luz natural o música suave por 3 minutos.";
    case "enojo":    return "Cuenta 10 respiraciones, afloja hombros y mandíbula.";
    default: return "";
  }
}

/* ======================= MEDICIÓN 5s ======================= */
let audioCtx, analyser, micSource, rafId, measuring=false;
const SAMPLE_MS=5000;
const MOTIVATION=[
  "Respira 4-6: 4s inhalar, 6s exhalar.",
  "Toma 2–3 sorbos de agua.",
  "Rota hombros hacia atrás 5 veces.",
  "Enfoca la vista lejos por 20s.",
  "Sonríe suave 10s 🙂",
  "Afloja mandíbula y relaja cuello."
];

function bindMeasure(){
  $("#btnMicGo").addEventListener("click", ()=> show("#screenMeasure"));
  $("#calibration").addEventListener("input", e=> $("#calVal").textContent=e.target.value);

  $("#toggleBtn").addEventListener("click", async ()=>{
    if(measuring){ stopMeasure(); return; }
    measuring = true;
    $("#btnMeasureToResults").disabled = true;
    $("#toggleBtn").textContent = "⏹️ Detener";
    $("#status").textContent = "Preparando micrófono…";
    $("#countdown").textContent = "5.0 s";
    drawGauge(0, 0);

    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = Number($("#smoothing").value);
      micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);

      start5sMeasurement();
    }catch(e){ alert("No se pudo acceder al micrófono."); measuring=false; $("#toggleBtn").textContent="🎙️ Iniciar 5s"; }
  });

  $("#btnMeasureToResults").addEventListener("click", ()=>{ renderNoiseResults(); show("#screenResults"); });
  $("#btnRetry").addEventListener("click", ()=> show("#screenMeasure"));
}

function start5sMeasurement(){
  const start = performance.now();
  const buf = new Float32Array(analyser.fftSize);
  const samples=[];
  let tipIdx=0;
  const tipIv=setInterval(()=> $("#motivation").textContent=MOTIVATION[tipIdx++%MOTIVATION.length],1000);

  const loop = ()=>{
    if(!measuring) return;
    analyser.getFloatTimeDomainData(buf);
    let rms=0; for(let i=0;i<buf.length;i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms / buf.length);
    const dbfs = 20*Math.log10(rms || 1e-8);
    const cal  = Number($("#calibration").value);
    const db   = Math.max(0, Math.round(dbfs + 90 + cal)); // aprox dB(A)

    $("#dbValue").textContent = db;
    updateGaugeLabel(db);

    const elapsed = performance.now()-start;
    const remaining = Math.max(0, SAMPLE_MS - elapsed);
    $("#countdown").textContent = (remaining/1000).toFixed(1) + " s";
    const timePct = Math.min(1, elapsed/SAMPLE_MS);
    drawGauge(db, timePct);
    $("#status").textContent = timePct<1 ? "Midiendo… mantén el teléfono quieto." : "Listo, procesando…";

    samples.push(db);
    if(elapsed >= SAMPLE_MS){
      measuring=false;
      clearInterval(tipIv);
      stopMeasure();
      const avg = Math.round(samples.reduce((a,b)=>a+b,0)/samples.length);
      const item = classifyDb(avg);
      appState.noise = { avgDb:avg, label:item.label, item };
      appState.history.push({date:Date.now(), avgDb:avg});
      $("#btnMeasureToResults").disabled = false;
      $("#status").textContent = "Medición finalizada.";
      $("#countdown").textContent = "0.0 s";
      drawGauge(avg, 1);
    }else{
      rafId = requestAnimationFrame(loop);
    }
  };
  rafId = requestAnimationFrame(loop);
}

function stopMeasure(){
  try{ if(rafId) cancelAnimationFrame(rafId); }catch(e){}
  try{ micSource?.mediaStream.getTracks().forEach(t=>t.stop()); }catch(e){}
  try{ audioCtx?.close(); }catch(e){}
  $("#toggleBtn").textContent="🎙️ Iniciar 5s";
}

/* Gauge Canvas */
const gauge = $("#gaugeCanvas").getContext("2d");
function drawGauge(db, timePct){
  const w=280,h=280,cx=140,cy=140,r=110;
  gauge.clearRect(0,0,w,h);
  gauge.lineWidth = 14;

  // base
  gauge.beginPath(); gauge.strokeStyle="rgba(255,255,255,.15)";
  gauge.arc(cx,cy,r,Math.PI,0); gauge.stroke();

  // arco dB
  const max=90, pct=Math.min(db/max,1);
  const grad = gauge.createLinearGradient(0,0,w,0);
  grad.addColorStop(0,"#22c55e"); grad.addColorStop(0.55,"#facc15"); grad.addColorStop(1,"#ef4444");
  gauge.beginPath(); gauge.strokeStyle = grad;
  gauge.arc(cx,cy,r,Math.PI, Math.PI*(1-pct)); gauge.stroke();

  // anillo de tiempo
  if(timePct!==undefined){
    gauge.lineWidth = 6;
    gauge.beginPath(); gauge.strokeStyle="rgba(124,58,237,.85)";
    gauge.arc(cx,cy,r+12,Math.PI, Math.PI*(1-timePct)); gauge.stroke();
  }
}

function updateGaugeLabel(db){
  const lbl=$("#dbLabel");
  if(db<35){ lbl.textContent="Silencioso"; lbl.style.background="#064e3b"; lbl.style.color="#a7f3d0"; }
  else if(db<50){ lbl.textContent="Tranquilo"; lbl.style.background="#1f2937"; lbl.style.color="#fde68a"; }
  else if(db<60){ lbl.textContent="Moderado"; lbl.style.background="#3f2d07"; lbl.style.color="#fcd34d"; }
  else if(db<70){ lbl.textContent="Ruidoso"; lbl.style.background="#3b0d0d"; lbl.style.color="#fca5a5"; }
  else { lbl.textContent="Muy ruidoso"; lbl.style.background="#3b0d0d"; lbl.style.color="#fecaca"; }
}

/* ======================= Tabla dB(A) ======================= */
const DB_TABLE = [
  {range:"<35",   min:-Infinity, max:35,  title:"Silencio profundo", label:"Muy silencioso", color:"#10b981",
   use:"Puede sentirse “demasiado” quieto.", effect:"Mejora foco, no siempre ideal para interacción.", advice:"Mantén este equilibrio o añade música suave si lo prefieres."},
  {range:"35–40", min:35,        max:40,  title:"Habitación tranquila", label:"Ideal para foco alto", color:"#22c55e",
   use:"Oficinas privadas/salas de reunión (BS 8233).", effect:"Muy favorable a la concentración.", advice:"Excelente base para tareas cognitivas exigentes."},
  {range:"40–45", min:40,        max:45,  title:"Lluvia moderada", label:"Discreto", color:"#84cc16",
   use:"Diseño frecuente en espacios de concentración.", effect:"Baja distracción si el habla ajena no es inteligible.", advice:"Cuida la inteligibilidad: absorción/enmascaramiento."},
  {range:"45–50", min:45,        max:50,  title:"Conversación suave", label:"Open plan controlado", color:"#f59e0b",
   use:"Objetivo típico en open plan.", effect:"Habla cercana inteligible puede distraer.", advice:"Zonas de foco con barreras o auriculares puntuales."},
  {range:"≈50",   min:49.5,      max:50.5,title:"Zumbido saludable", label:"Punto dulce fisiológico", color:"#a855f7",
   use:"~50 dB(A) maximiza marcadores de bienestar.", effect:"Muy bajo/alto reduce bienestar.", advice:"Intenta mantenerte cerca de 50 dB(A)."},
  {range:"50–55", min:50,        max:55,  title:"Conversación normal", label:"Colaborativo", color:"#f97316",
   use:"Zonas colaborativas, pasillos, cafeterías.", effect:"Sube riesgo de distracción; cuida diseño acústico.", advice:"Para foco, muévete a un área más tranquila."},
  {range:"55–60", min:55,        max:60,  title:"Conversación clara", label:"Cuidado con la fatiga", color:"#ef4444",
   use:"Puede causar fatiga cognitiva sostenida.", effect:"Deterioro de memoria de trabajo al subir desde 50 dB.", advice:"Micro-pausas auditivas y limitar exposición."},
  {range:"60–65", min:60,        max:65,  title:"Conversación elevada", label:"No recomendable para foco", color:"#dc2626",
   use:"Zonas de alta interacción.", effect:"Fuerte distracción por habla (efecto Lombard).", advice:"Cancelación de ruido o cambio de espacio."},
  {range:"≥70",   min:70,        max:Infinity, title:"Aspiradora/tráfico", label:"No apropiado", color:"#b91c1c",
   use:"Solo eventos puntuales.", effect:"Cerca de umbrales legales de exposición.", advice:"Reduce tiempo de exposición o aléjate de la fuente."}
];

const MASCOT_IMGS = {
  alegria:"images/ind-alegria.png",
  ansiedad:"images/ind-ansiedad.png",
  enojo:"images/ind-enojo.png",
  estres:"images/ind-estres.png",
  tristeza:"images/ind-tristeza.png",
  neutral:"images/ind-alegria.png"
};

function classifyDb(db){
  const r = DB_TABLE.find(x=> db>=x.min && db<x.max) || DB_TABLE[DB_TABLE.length-1];
  return {...r, detail:`${r.title}. Uso: ${r.use} Efectos: ${r.effect}`, label:r.label};
}

/* ======================= RESULTADOS (ruido) ======================= */
let historyChart;
function bindResults(){
  $("#tabNoise").addEventListener("click", ()=>{ $("#tabNoise").classList.add("active"); $("#tabScan").classList.remove("active"); show("#screenResults"); });
  $("#tabScan").addEventListener("click", ()=> show("#screenScanIntro"));
  $("#btnBackResults").addEventListener("click", ()=> show("#screenResults"));
  $("#btnGoIntegration").addEventListener("click", ()=>{ computeIntegration(); show("#screenIntegration"); });
}

function renderNoiseResults(){
  const {noise, selfie} = appState;
  $("#resultsSummary").innerHTML = `Promedio medido: <b>${noise.avgDb} dB(A)</b> · ${noise.item.label}. Selfie emocional: <b>${(selfie.emotion||"—").toUpperCase()}</b>.`;

  const el = $("#currentIndicator");
  el.innerHTML = `
    <img src="${pickMascotFromNoise(noise.avgDb)}" alt="mascota"/>
    <div class="tag" style="border-color:${noise.item.color}; color:${noise.item.color}">${noise.item.range}</div>
    <p><b>${noise.item.title}</b></p>
    <p class="muted small">${noise.item.advice}</p>
  `;
  el.onclick = ()=>{
    $("#indicatorDetail").innerHTML = `
      <h3>${noise.item.title} (${noise.item.range})</h3>
      <p><b>Interpretación:</b> ${noise.item.label}</p>
      <p><b>Uso recomendado:</b> ${noise.item.use}</p>
      <p><b>Efectos:</b> ${noise.item.effect}</p>
      <p><b>Consejo:</b> ${noise.item.advice}</p>
    `;
    show("#screenIndicatorDetail");
  };

  const wrap = $("#allIndicators"); wrap.innerHTML="";
  DB_TABLE.forEach(r=>{
    const card=document.createElement("div"); card.className="indicator-card";
    card.innerHTML = `
      <img src="${pickMascotFromNoise((r.min+r.max)/2)}" alt="">
      <div class="tag" style="border-color:${r.color}; color:${r.color}">${r.range}</div>
      <p><b>${r.title}</b></p>
      <p class="small muted">${r.label}</p>
    `;
    card.title = `${r.title} · ${r.use}`;
    card.onclick = ()=>{
      $("#indicatorDetail").innerHTML = `
        <h3>${r.title} (${r.range})</h3>
        <p><b>Interpretación:</b> ${r.label}</p>
        <p><b>Uso recomendado:</b> ${r.use}</p>
        <p><b>Efectos:</b> ${r.effect}</p>
        <p><b>Consejo:</b> ${r.advice}</p>
      `;
      show("#screenIndicatorDetail");
    };
    wrap.appendChild(card);
  });

  const ctx = $("#historyChart").getContext("2d");
  const labels = appState.history.map(h=> new Date(h.date).toLocaleTimeString());
  const data   = appState.history.map(h=> h.avgDb);
  historyChart?.destroy();
  historyChart = new Chart(ctx, {
    type:"line",
    data:{ labels, datasets:[{ label:"dB(A) promedio (5s)", data, fill:false }] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

function pickMascotFromNoise(db){
  if(db<40) return MASCOT_IMGS.alegria;
  if(db<50) return MASCOT_IMGS.neutral;
  if(db<55) return MASCOT_IMGS.ansiedad;
  if(db<65) return MASCOT_IMGS.estres;
  return MASCOT_IMGS.enojo;
}

/* ======================= ESCANEO CORPORAL ======================= */
function bindScan(){
  $("#btnScanStart").addEventListener("click", ()=> show("#screenSurvey"));
  $("#btnScanIntroBack").addEventListener("click", ()=> show("#screenResults"));
  $("#btnSurveyBack").addEventListener("click", ()=> show("#screenScanIntro"));
  $("#btnToBodyScan").addEventListener("click", ()=>{
    if(!$("#ws_datetime").value || !$("#ws_area").value || !$("#ws_hours").value) return alert("Completa fecha, área y horas.");
    show("#screenBodyScan");
  });

  $("#btnBodyScanBack").addEventListener("click", ()=> show("#screenSurvey"));

  $("#btnBodyScanFinish").addEventListener("click", ()=>{
    const head  = Number($("#bs_head_tension").value);
    const upper = Number($("#bs_upper_tension").value);
    const lower = Number($("#bs_lower_tension").value);
    const total = Number($("#bs_total").value);
    const fatiga= Number($("#bs_fatiga").value);

    const symptoms = [
      ...$$(".symptomHead:checked").map(i=>i.value),
      ...$$(".symptomUpper:checked").map(i=>i.value),
      ...$$(".symptomLower:checked").map(i=>i.value)
    ];

    const avg = Number(((head+upper+lower)/3).toFixed(1));
    appState.body = { head, upper, lower, total, fatiga, symptoms };

    $("#bs_head_out").textContent = head;
    $("#bs_upper_out").textContent= upper;
    $("#bs_lower_out").textContent= lower;
    $("#bs_avg").textContent      = avg;
    $("#bs_total_display").textContent = total;
    $("#bs_fatiga_display").textContent= fatiga;
    $("#bs_symptoms_display").textContent = symptoms.length ? symptoms.join(", ") : "Ninguno";

    const ctx=$("#bsChart").getContext("2d");
    new Chart(ctx,{
      type:"radar",
      data:{ labels:["Cabeza","Tren superior","Tren inferior","Total","Fatiga"],
             datasets:[{ label:"Tensión 1–10", data:[head,upper,lower,total,fatiga] }] },
      options:{ responsive:true, scales:{ r:{ min:0, max:10 } } }
    });

    show("#screenScanResults");
  });

  $("#btnScanResultsBack").addEventListener("click", ()=> show("#screenBodyScan"));
}

/* ======================= INTEGRACIÓN ======================= */
function bindIntegration(){
  $("#btnToIntegration").addEventListener("click", ()=>{ computeIntegration(); show("#screenIntegration"); });
  $("#btnIntegrationBack").addEventListener("click", ()=> show("#screenScanResults"));
  $("#btnIntegrationHome").addEventListener("click", ()=> show("#screenFace"));
}

function mapNoiseToScore(db){ const diff=Math.abs(db-50); return Math.max(0, Math.min(100, 100 - diff*3)); }
function labelFromIndex(ix){
  if(ix>=80) return {label:"Muy bien",   reco:"Mantén pausas breves e hidratación. Estás en tu zona 👏", mascot:MASCOT_IMGS.alegria};
  if(ix>=65) return {label:"Bien",       reco:"Sigue con pausas 60–90 min y cuida la postura.",        mascot:MASCOT_IMGS.neutral};
  if(ix>=50) return {label:"Atento/a",   reco:"Respiración 4-6 y ajusta ruido o música neutra.",       mascot:MASCOT_IMGS.ansiedad};
  if(ix>=35) return {label:"Alto estrés",reco:"Pausa 3–5 min, estira cuello/hombros y baja estímulos.", mascot:MASCOT_IMGS.estres};
  return        {label:"Crítico",       reco:"Busca un espacio silencioso y pausa larga. Si persiste, informa.", mascot:MASCOT_IMGS.enojo};
}

function computeIntegration(){
  const { selfie, noise, body } = appState;
  const bsAvg = Number(((body.head + body.upper + body.lower)/3).toFixed(1));
  const faceScore  = selfie.score || 60;
  const noiseScore = mapNoiseToScore(noise.avgDb||50);
  const bodyScore  = 100 - ((bsAvg*4 + body.total*3 + body.fatiga*3)/10);
  const ix = Math.round(0.25*faceScore + 0.35*noiseScore + 0.40*bodyScore);

  $("#ix_face_emotion").textContent = selfie.emotion?.toUpperCase() || "—";
  $("#ix_face_score").textContent   = Math.round(faceScore);
  $("#ix_db").textContent           = noise.avgDb ?? "—";
  $("#ix_db_class").textContent     = noise.item?.label ?? "—";
  $("#ix_bs_avg").textContent       = bsAvg;
  $("#ix_bs_total").textContent     = body.total;

  const {label,reco,mascot} = labelFromIndex(ix);
  $("#ix_score").textContent = ix;
  $("#ix_label").textContent = label;
  $("#ix_reco").textContent  = reco;
  $("#ix_mascot").src        = mascot;
}

/* ======================= HELPERS ======================= */
function renderNoiseResults(){
  const {noise, selfie} = appState;
  $("#resultsSummary").innerHTML = `Promedio medido: <b>${noise.avgDb} dB(A)</b> · ${noise.item.label}. Selfie emocional: <b>${(selfie.emotion||"—").toUpperCase()}</b>.`;
  const el = $("#currentIndicator");
  el.innerHTML = `
    <img src="${pickMascotFromNoise(noise.avgDb)}" alt="mascota"/>
    <div class="tag" style="border-color:${noise.item.color}; color:${noise.item.color}">${noise.item.range}</div>
    <p><b>${noise.item.title}</b></p>
    <p class="muted small">${noise.item.advice}</p>
  `;
  el.onclick = ()=>{
    $("#indicatorDetail").innerHTML = `
      <h3>${noise.item.title} (${noise.item.range})</h3>
      <p><b>Interpretación:</b> ${noise.item.label}</p>
      <p><b>Uso recomendado:</b> ${noise.item.use}</p>
      <p><b>Efectos:</b> ${noise.item.effect}</p>
      <p><b>Consejo:</b> ${noise.item.advice}</p>
    `;
    show("#screenIndicatorDetail");
  };

  const wrap = $("#allIndicators"); wrap.innerHTML="";
  DB_TABLE.forEach(r=>{
    const card=document.createElement("div"); card.className="indicator-card";
    card.innerHTML = `
      <img src="${pickMascotFromNoise((r.min+r.max)/2)}" alt="">
      <div class="tag" style="border-color:${r.color}; color:${r.color}">${r.range}</div>
      <p><b>${r.title}</b></p>
      <p class="small muted">${r.label}</p>
    `;
    card.onclick = ()=>{
      $("#indicatorDetail").innerHTML = `
        <h3>${r.title} (${r.range})</h3>
        <p><b>Interpretación:</b> ${r.label}</p>
        <p><b>Uso recomendado:</b> ${r.use}</p>
        <p><b>Efectos:</b> ${r.effect}</p>
        <p><b>Consejo:</b> ${r.advice}</p>
      `;
      show("#screenIndicatorDetail");
    };
    wrap.appendChild(card);
  });

  const ctx = $("#historyChart").getContext("2d");
  const labels = appState.history.map(h=> new Date(h.date).toLocaleTimeString());
  const data   = appState.history.map(h=> h.avgDb);
  try{ historyChart?.destroy(); }catch(_){}
  historyChart = new Chart(ctx, {
    type:"line",
    data:{ labels, datasets:[{ label:"dB(A) promedio (5s)", data, fill:false }] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}
