/* util */
const $ = (q) => document.querySelector(q);

/* =============== NAVEGACIÓN =============== */
function show(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* =============== SELFIE FACIAL =============== */
let camStream;
const btnStartCamera = $("#btnStartCamera");
const btnAnalyze = $("#btnAnalyze");
const btnToMic = $("#btnToMic");
const video = $("#video");
const canvas = $("#canvas");
const emotionResult = $("#emotionResult");

btnStartCamera.addEventListener("click", async () => {
  try {
    // iOS/Android friendly
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" }, audio: false
    });
    video.srcObject = camStream;
    btnAnalyze.disabled = false;
    emotionResult.textContent = "Cámara activada ✅";
  } catch (e) {
    console.error(e);
    emotionResult.textContent = "No se pudo acceder a la cámara. Verifica permisos y HTTPS.";
  }
});

btnAnalyze.addEventListener("click", async () => {
  try{
    emotionResult.textContent = "Analizando rostro...";
    const URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(URL),
      faceapi.nets.faceExpressionNet.loadFromUri(URL)
    ]);

    const det = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();

    if(!det){ emotionResult.textContent = "No se detectó rostro. Prueba con más luz y mirando a la cámara."; return; }

    const expr = det.expressions;
    const main = Object.keys(expr).reduce((a,b)=> expr[a] > expr[b] ? a : b);
    let emotion, tip;
    switch(main){
      case "happy": emotion="Feliz 😊"; tip="Excelente energía para empezar el día."; break;
      case "sad": emotion="Triste 😔"; tip="Pausa breve y luz natural pueden ayudarte."; break;
      case "angry": emotion="Tenso 😤"; tip="Afloja mandíbula/hombros y respira 4x6."; break;
      case "surprised": emotion="Sorprendido 😯"; tip="Baja el pulso con respiración tranquila."; break;
      default: emotion="Neutral 🙂"; tip="Buen equilibrio; hidrátate y a por ello.";
    }
    emotionResult.textContent = `${emotion}. ${tip}`;
    btnToMic.disabled = false;
  }catch(e){
    console.error(e);
    emotionResult.textContent = "Hubo un problema analizando la selfie.";
  }
});

btnToMic.addEventListener("click", ()=>{
  try{ camStream?.getTracks().forEach(t=>t.stop()); }catch(e){}
  show("#screenMeasure");
});

/* =============== MEDICIÓN dB (5s + velocímetro) =============== */
let audioCtx, analyser, micSource, rafId, measuring = false, samples = [];
const dbDisplay = $("#dbDisplay");
const dbLabel = $("#dbLabel");
const btnStartMic = $("#btnStartMic");
const btnResults = $("#btnResults");
const gaugeCanvas = $("#gaugeCanvas");
const ctx = gaugeCanvas.getContext("2d");

function drawGauge(db){
  const max = 90; // escala visual
  const pct = Math.min(db / max, 1);
  ctx.clearRect(0,0,240,240);
  ctx.lineWidth = 14;

  // arco base (gris)
  ctx.beginPath();
  ctx.strokeStyle = "#e5e7eb";
  ctx.arc(120,120,100,Math.PI,0);
  ctx.stroke();

  // arco dinámico (verde-amarillo-rojo)
  ctx.beginPath();
  const grad = ctx.createLinearGradient(0,0,240,0);
  grad.addColorStop(0,"#22c55e");   // verde
  grad.addColorStop(0.5,"#facc15"); // amarillo
  grad.addColorStop(1,"#ef4444");   // rojo
  ctx.strokeStyle = grad;
  ctx.arc(120,120,100,Math.PI, Math.PI*(1-pct));
  ctx.stroke();
}

function updateLabel(db){
  if (db<35){ dbLabel.textContent="Silencioso"; dbLabel.style.background="#d1fae5"; dbLabel.style.color="#065f46"; }
  else if (db<50){ dbLabel.textContent="Ambiente tranquilo"; dbLabel.style.background="#fef3c7"; dbLabel.style.color="#92400e"; }
  else if (db<60){ dbLabel.textContent="Moderado"; dbLabel.style.background="#fcd34d"; dbLabel.style.color="#78350f"; }
  else if (db<70){ dbLabel.textContent="Ruidoso"; dbLabel.style.background="#fca5a5"; dbLabel.style.color="#991b1b"; }
  else { dbLabel.textContent="Muy ruidoso"; dbLabel.style.background="#f87171"; dbLabel.style.color="#7f1d1d"; }
}

btnStartMic.addEventListener("click", async ()=>{
  if (measuring) return;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    micSource = audioCtx.createMediaStreamSource(stream);
    micSource.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    samples = []; measuring = true;
    const start = performance.now();

    const loop = ()=>{
      if(!measuring) return;
      analyser.getFloatTimeDomainData(buf);
      // RMS → aproximación dB
      let rms=0; for(let i=0;i<buf.length;i++) rms += buf[i]*buf[i];
      rms = Math.sqrt(rms / buf.length);
      const db = Math.max(0, Math.round(20*Math.log10(rms || 1e-8) + 90));
      samples.push(db);

      dbDisplay.textContent = db;
      drawGauge(db);
      updateLabel(db);

      if(performance.now() - start < 5000){
        rafId = requestAnimationFrame(loop);
      }else{
        measuring = false;
        try{ cancelAnimationFrame(rafId); }catch(e){}
        const avg = Math.round(samples.reduce((a,b)=>a+b,0)/samples.length);
        sessionStorage.setItem("avgDb", String(avg));
        btnResults.disabled = false;
      }
    };
    loop();
  }catch(e){
    console.error(e);
    alert("No se pudo acceder al micrófono. Revisa permisos y HTTPS.");
  }
});

$("#btnRetry").addEventListener("click", ()=> show("#screenMeasure"));
btnResults.addEventListener("click", ()=>{
  show("#screenResults");
  renderResults();
});

/* =============== RESULTADOS amigables =============== */
function renderResults(){
  const avg = Number(sessionStorage.getItem("avgDb")||0);
  const card = $("#resultCard");
  let title, desc, advice, color;

  if (avg<35){
    title="Silencio profundo";
    desc="Ambiente ideal para foco y calma.";
    advice="Mantén este equilibrio acústico. Puedes sumar música suave si lo prefieres.";
    color="#10b981";
  } else if (avg<50){
    title="Ruido saludable";
    desc="Nivel óptimo para trabajar con concentración sostenida.";
    advice="Excelente entorno. Hidrátate y toma micro-pausas visuales cada 60–90 min.";
    color="#22c55e";
  } else if (avg<60){
    title="Nivel moderado";
    desc="Podrías notar ligeras distracciones por conversación o equipos.";
    advice="Si se prolonga, usa auriculares o busca un lugar más silencioso para tareas de foco.";
    color="#f59e0b";
  } else if (avg<70){
    title="Ruidoso";
    desc="Puede incrementar fatiga y elevar el estrés a lo largo del día.";
    advice="Realiza pausas auditivas (2–3 min), ajusta volumen o muévete a un espacio más calmo.";
    color="#ef4444";
  } else {
    title="Muy ruidoso";
    desc="Ruido excesivo que dificulta la concentración y el bienestar.";
    advice="Aléjate de la fuente, usa cancelación de ruido o cambia de zona si es posible.";
    color="#b91c1c";
  }

  card.innerHTML = `
    <h3 style="color:${color}">${title}</h3>
    <p><b>Promedio:</b> ${avg} dB(A)</p>
    <p>${desc}</p>
    <p><b>Consejo:</b> ${advice}</p>
  `;

  // dibuja el gauge con el promedio final
  drawGauge(avg);
}
