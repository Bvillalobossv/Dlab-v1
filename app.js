/* ===================== UTILIDADES BÁSICAS ===================== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function show(id) {
  $$('.screen').forEach(sc => sc.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===================== ONBOARDING ===================== */
(() => {
  const slides = $('#introSlides');
  const dots = $('#introDots');
  const prev = $('#introPrev');
  const next = $('#introNext');
  const start = $('#introStart');
  let idx = 0;

  function renderDots(n=3){
    dots.innerHTML = '';
    for(let i=0;i<n;i++){
      const d = document.createElement('div');
      d.className = 'dot' + (i===idx? ' active':'');
      dots.appendChild(d);
    }
  }
  function go(i){
    idx = Math.max(0, Math.min(i, 2));
    slides.style.transform = `translateX(-${idx*100}%)`;
    renderDots();
    start.style.display = (idx===2)? 'inline-block':'none';
    next.style.display = (idx===2)? 'none':'inline-block';
  }
  prev.addEventListener('click', ()=>go(idx-1));
  next.addEventListener('click', ()=>go(idx+1));
  start.addEventListener('click', ()=>show('#screenAuth'));
  renderDots(); go(0);
})();

/* ===================== AUTH (LOCAL) ===================== */
const KEY_USERS = 'sw_users';
const KEY_SESSION = 'sw_session';

function loadUsers(){
  try{ return JSON.parse(localStorage.getItem(KEY_USERS)) || {}; }
  catch(e){ return {}; }
}
function saveUsers(obj){ localStorage.setItem(KEY_USERS, JSON.stringify(obj)); }
function setSession(user){ sessionStorage.setItem(KEY_SESSION, user); }
function getSession(){ return sessionStorage.getItem(KEY_SESSION); }
function signOut(){
  sessionStorage.removeItem(KEY_SESSION);
  show('#screenAuth');
}

(() => {
  const tabLogin = $('#authTabLogin');
  const tabSignup = $('#authTabSignup');
  const formLogin = $('#formLogin');
  const formSignup = $('#formSignup');
  const goAbout = $('#goAbout');
  const btnAboutBack = $('#btnAboutBack');
  const btnAboutStart = $('#btnAboutStart');

  tabLogin.addEventListener('click', ()=>{
    tabLogin.classList.add('active'); tabSignup.classList.remove('active');
    formLogin.style.display='block'; formSignup.style.display='none';
  });
  tabSignup.addEventListener('click', ()=>{
    tabSignup.classList.add('active'); tabLogin.classList.remove('active');
    formLogin.style.display='none'; formSignup.style.display='block';
  });

  formSignup.addEventListener('submit', (e)=>{
    e.preventDefault();
    const u = $('#su_user').value.trim();
    const p = $('#su_pass').value;
    const ok = $('#su_terms').checked;
    if(!u || !p || !ok) return alert('Completa todos los campos y acepta los términos.');
    const users = loadUsers();
    if(users[u]) return alert('El usuario ya existe.');
    users[u] = p;
    saveUsers(users);
    setSession(u);
    show('#screenAbout');
  });

  formLogin.addEventListener('submit', (e)=>{
    e.preventDefault();
    const u = $('#login_user').value.trim();
    const p = $('#login_pass').value;
    const users = loadUsers();
    if(users[u] && users[u]===p){
      setSession(u);
      show('#screenAbout');
    } else {
      alert('Credenciales inválidas.');
    }
  });

  goAbout.addEventListener('click', ()=>show('#screenAbout'));
  btnAboutBack.addEventListener('click', ()=>show('#screenAuth'));
  btnAboutStart.addEventListener('click', ()=>show('#screenFace'));
})();

/* ===================== SELFIE EMOCIONAL ===================== */
const video = $('#faceVideo');
const canvas = $('#faceCanvas');
const btnFaceStart = $('#btnFaceStart');
const btnFaceSnap  = $('#btnFaceSnap');
const btnFaceNext  = $('#btnFaceNext');
const btnFaceSkip  = $('#btnFaceSkip');
const faceEmotion  = $('#faceEmotion');
const faceConfidence = $('#faceConfidence');
const faceTip = $('#faceTip');
const faceMascot = $('#faceMascot');
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

let faceStream = null;
let modelsLoaded = false;
let lastFace = null;

const emotionCopy = {
  happy:  { label:'Feliz',    tip:'¡Arranque brillante! Mantén mini-pausas cada 50 min para sostener esa energía.' },
  neutral:{ label:'Neutral',  tip:'Buen punto de partida. Un vaso de agua y una breve caminata elevarán tu foco.' },
  angry:  { label:'Tenso',    tip:'Se percibe tensión. Prueba respiración 4–6 y estiramiento de hombros 1 minuto.' },
  sad:    { label:'Bajo ánimo', tip:'Con suavidad: escucha tu cuerpo y agenda un micro-descanso mental.' },
  surprised:{ label:'Sorprendido', tip:'Gran apertura. Canaliza esa activación en tu primera tarea clave.' },
  fearful:{ label:'Aprensivo', tip:'Paso a paso. Un “to-do” pequeño y alcanzable te dará tracción.' },
  disgusted:{ label:'Molesto', tip:'Date permiso para reencuadrar. 60s de respiración nasal pueden ayudar.' }
};

async function ensureModels(){
  if(modelsLoaded) return;
  // --> CAMBIO: Se carga el modelo SsdMobilenetv1 en lugar de TinyFaceDetector
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

function stopFace(){
  if(faceStream){
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
}

btnFaceStart.addEventListener('click', async () => {
  const originalText = btnFaceStart.textContent;
  btnFaceStart.textContent = 'Cargando IA...';
  btnFaceStart.disabled = true;

  try {
    await ensureModels();
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = faceStream;
    video.onloadedmetadata = async () => {
      await video.play();
      btnFaceSnap.disabled = false;
      btnFaceStart.textContent = 'Cámara Activa';
      $('#faceHelp').textContent = '¡Listo! Ahora puedes tomar la selfie.';
    };
  } catch (err) {
    console.error("Error al iniciar la cámara o cargar modelos:", err);
    alert('No pudimos acceder a la cámara o cargar los modelos de IA. Revisa los permisos o tu conexión a internet.');
    btnFaceStart.textContent = originalText;
    btnFaceStart.disabled = false;
  }
});

btnFaceSnap.addEventListener('click', async ()=>{
  try{
    await ensureModels();
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --> CAMBIO: Se utiliza el nuevo detector SsdMobilenetv1Options
    const det = await faceapi
      .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceExpressions();

    if(!det){
      faceEmotion.textContent = 'No detectado';
      faceConfidence.textContent = '—';
      faceTip.textContent = 'Asegúrate de estar bien iluminado/a y centrado/a.';
      btnFaceNext.disabled = true;
      return;
    }

    const arr = det.expressions.asSortedArray();
    const { expression, probability } = arr[0];
    lastFace = { expression, probability };

    const map = emotionCopy[expression] || emotionCopy['neutral'];
    faceEmotion.textContent = map.label + ` (${expression})`;
    faceConfidence.textContent = (probability*100).toFixed(1) + '%';
    faceTip.textContent = map.tip;
    faceMascot.src = pickMascot(expression);
    faceMascot.alt = map.label;
    btnFaceNext.disabled = false;
  }catch(err){
    console.error(err);
    alert('Ocurrió un problema al analizar el rostro.');
    btnFaceNext.disabled = true;
  }
});

btnFaceSkip.addEventListener('click', ()=>{
  lastFace = { expression:'neutral', probability:0.5 };
  btnFaceNext.disabled = false;
  show('#screenMicIntro');
});

btnFaceNext.addEventListener('click', ()=>{
  stopFace();
  show('#screenMicIntro');
});

function pickMascot(exp){
  const map = {
    happy: 'images/mascots/happy.gif',
    neutral: 'images/mascots/neutral.gif',
    angry: 'images/mascots/angry.gif',
    sad: 'images/mascots/sad.gif',
    surprised: 'images/mascots/surprised.gif',
    fearful: 'images/mascots/fear.gif',
    disgusted: 'images/mascots/disgust.gif'
  };
  return map[exp] || 'images/mascots/neutral.gif';
}

/* ===================== MEDICIÓN DE RUIDO 5s ===================== */
const gaugeCanvas = $('#gaugeCanvas');
const dbValue = $('#dbValue');
const dbLabel = $('#dbLabel');
const countdown = $('#countdown');
const statusEl = $('#status');
const calib = $('#calibration');
const calVal = $('#calVal');
const smoothingSel = $('#smoothing');
const toggleBtn = $('#toggleBtn');
const btnMeasureToResults = $('#btnMeasureToResults');

let audioCtx, analyser, micStream;
let running = false, samples = [];
let smooth = 0.8;

function drawGauge(val){
  const ctx = gaugeCanvas.getContext('2d');
  const w = gaugeCanvas.width, h = gaugeCanvas.height;
  ctx.clearRect(0,0,w,h);
  const min = 30, max = 90;
  const pct = Math.max(0, Math.min(1, (val - min)/(max-min)));
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2-22, Math.PI*0.75, Math.PI*2.25);
  ctx.stroke();
  ctx.strokeStyle = getColor(val);
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2-22, Math.PI*0.75, Math.PI*0.75 + pct*Math.PI*1.5);
  ctx.stroke();
}
function getColor(dB){
  if(dB < 45) return '#10b981';
  if(dB < 60) return '#22c55e';
  if(dB < 70) return '#f59e0b';
  return '#ef4444';
}
function labelFor(dB){
  if(dB < 35) return 'Silencio profundo';
  if(dB < 45) return 'Tranquilo';
  if(dB < 55) return 'Conversación suave';
  if(dB < 65) return 'Oficina activa';
  if(dB < 75) return 'Ruidoso';
  return 'Alto ruido';
}

async function startMic(){
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  micStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
  const src = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
}

function stopMic(){
  if(micStream) micStream.getTracks().forEach(t=>t.stop());
  if(audioCtx) audioCtx.close();
  micStream = null; audioCtx = null;
}

async function runMeasure(){
  await startMic();
  samples = [];
  running = true;
  const duration = 5_000;
  const start = performance.now();
  function tick(){
    if(!running) return;
    const now = performance.now();
    const left = Math.max(0, duration - (now - start));
    countdown.textContent = (left/1000).toFixed(1) + ' s';
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for(let i=0;i<buf.length;i++) sum += buf[i]*buf[i];
    let rms = Math.sqrt(sum/buf.length) || 0.0000001;
    const cal = parseInt(calib.value||'0',10);
    const dB = 20*Math.log10(rms) + 90 + cal;
    const prev = samples.length ? samples[samples.length-1] : dB;
    const smoothed = prev*(smooth) + dB*(1-smooth);
    samples.push(smoothed);
    dbValue.textContent = Math.round(smoothed);
    dbLabel.textContent = labelFor(smoothed);
    drawGauge(smoothed);
    if(left <= 0){
      running = false;
      stopMic();
      btnMeasureToResults.disabled = false;
      statusEl.textContent = 'Medición completa.';
      countdown.textContent = '0.0 s';
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

calib.addEventListener('input', ()=> calVal.textContent = calib.value);
smoothingSel.addEventListener('change', ()=>{
  smooth = parseFloat(smoothingSel.value);
});

toggleBtn.addEventListener('click', async ()=>{
  if(running) return;
  statusEl.textContent = 'Midiendo… mantén el móvil quieto.';
  btnMeasureToResults.disabled = true;
  await runMeasure();
});

btnMeasureToResults.addEventListener('click', ()=>{
  saveNoiseSession();
  renderResults();
  show('#screenResults');
});

/* ===================== RESULTADOS Y HISTÓRICO ===================== */
const KEY_NOISE_HISTORY = 'sw_noise_history';
const refData = [
    { 
      range: '<35 dB', title: 'Silencio Profundo',
      img: 'images/ind-silencio.png',
      description: 'Este nivel de ruido es ideal para tareas que requieren máxima concentración y para momentos de descanso mental. Es similar a una biblioteca silenciosa.',
      recommendations: ['Aprovecha este momento para realizar tu tarea más compleja del día.', 'Realiza una meditación de 2 minutos para recargar energías.', 'Disfruta del silencio para reducir la carga cognitiva.']
    },
    { 
      range: '45–55 dB', title: 'Conversación suave',
      img: 'images/ind-conversacion.png',
      description: 'Considerado el nivel ideal para un trabajo de oficina colaborativo. Permite conversaciones suaves sin ser disruptivo, fomentando la creatividad y la comunicación.',
      recommendations: ['Es un buen momento para una lluvia de ideas con tu equipo.', 'Si necesitas concentrarte, un poco de música instrumental puede aislarte positivamente.', 'Mantén tu voz a un nivel conversacional para no molestar a otros.']
    },
    { 
      range: '55-70 dB', title: 'Oficina activa',
      img: 'images/ind-saludable.png',
      description: 'El ruido de una oficina activa puede empezar a afectar la concentración y aumentar el estrés a largo plazo. Es el sonido de conversaciones fuertes, teléfonos y movimiento constante.',
      recommendations: ['Considera usar audífonos con cancelación de ruido por bloques de 45 minutos.', 'Busca una sala de reuniones vacía o una zona tranquila para tareas que requieran foco.', 'Habla con tu equipo sobre establecer "horas de silencio" para la concentración profunda.']
    },
    { 
      range: '≥70 dB', title: 'Alto ruido',
      img: 'images/ind-ruido.png',
      description: 'Este nivel es perjudicial para la productividad y el bienestar. Se compara con el ruido de una aspiradora o tráfico intenso y puede causar fatiga y estrés significativos.',
      recommendations: ['Es crucial que te tomes un descanso en un lugar más silencioso.', 'Si es posible, notifica a un supervisor sobre el nivel de ruido constante.', 'Protege tu audición. La exposición prolongada a más de 85 dB puede ser dañina.']
    }
];

function loadNoiseHistory(){
  try { return JSON.parse(localStorage.getItem(KEY_NOISE_HISTORY)) || []; }
  catch(e){ return []; }
}
function saveNoiseSession(){
  const avg = Math.round(samples.reduce((a,b)=>a+b,0)/Math.max(1,samples.length));
  const rec = { ts: Date.now(), avg };
  const arr = loadNoiseHistory();
  arr.push(rec);
  localStorage.setItem(KEY_NOISE_HISTORY, JSON.stringify(arr));
}

let historyChart = null;
function renderResults(){
  const arr = loadNoiseHistory();
  const last = arr[arr.length-1] || { avg: 0 };
  $('#resultsSummary').textContent = `Promedio de ruido: ${last.avg} dB — ${labelFor(last.avg)}`;

  const ctx = $('#historyChart').getContext('2d');
  if(historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: arr.map(r => new Date(r.ts).toLocaleTimeString()),
      datasets: [{ data: arr.map(r=>r.avg), tension:.25, borderColor: '#7c3aed', borderWidth: 2 }]
    },
    options: {
      plugins:{ legend:{display:false} },
      scales:{ y:{ suggestedMin:30, suggestedMax:90 } }
    }
  });

  const current = $('#currentIndicator');
  current.innerHTML = `
    <h4>${labelFor(last.avg)}</h4>
    <p><b>${last.avg} dB(A)</b></p>
    <span class="tag" style="border-color:${getColor(last.avg)}; color:${getColor(last.avg)}">Ambiente</span>
  `;
  const currentLabel = labelFor(last.avg);
  const currentDataIndex = refData.findIndex(d => d.title.toLowerCase() === currentLabel.toLowerCase());
  if (currentDataIndex !== -1) {
    current.setAttribute('onclick', `showIndicatorDetail(${currentDataIndex})`);
    current.style.cursor = 'pointer';
  }

  const all = $('#allIndicators'); 
  all.innerHTML = '';
  refData.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'indicator-card';
    el.setAttribute('onclick', `showIndicatorDetail(${i})`);
    el.innerHTML = `
        <img src="${r.img}" alt="${r.title}" />
        <h4>${r.range}</h4>
        <p>${r.title}</p>
    `;
    all.appendChild(el);
  });
}

function showIndicatorDetail(index) {
    const data = refData[index];
    const detailContainer = $('#indicatorDetail');
    detailContainer.innerHTML = `
        <h2>${data.title} (${data.range})</h2>
        <p class="lead">${data.description}</p>
        <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
        <h3>Recomendaciones:</h3>
        <ul>
            ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    `;
    show('#screenIndicatorDetail');
}

$('#btnRetry').addEventListener('click', ()=> show('#screenMeasure'));
$('#btnGoIntegration').addEventListener('click', ()=> show('#screenScanIntro'));
$('#btnBackResults').addEventListener('click', ()=> show('#screenResults'));

/* ===================== ENCUESTA + BODY SCAN ===================== */
$('#btnScanStart').addEventListener('click', ()=> show('#screenSurvey'));
$('#btnScanIntroBack').addEventListener('click', ()=> show('#screenResults'));
$('#btnSurveyBack').addEventListener('click', ()=> show('#screenResults'));
$('#btnToBodyScan').addEventListener('click', ()=> show('#screenBodyScan'));
$('#btnBodyScanBack').addEventListener('click', ()=> show('#screenSurvey'));

const bs = {
  head: $('#bs_head_tension'),
  upper: $('#bs_upper_tension'),
  lower: $('#bs_lower_tension'),
  total: $('#bs_total'),
  fatiga: $('#bs_fatiga'),
};

$('#btnBodyScanFinish').addEventListener('click', ()=>{
  const headVal = +bs.head.value, upVal = +bs.upper.value, lowVal = +bs.lower.value;
  const avg = ((headVal + upVal + lowVal) / 3).toFixed(1);
  const total = +bs.total.value, ft = +bs.fatiga.value;
  const sym = [...$$('.symptomHead:checked'), ...$$('.symptomUpper:checked'), ...$$('.symptomLower:checked')].map(x=>x.value);
  $('#bs_symptoms_display').textContent = sym.length? sym.join(', ') : 'Ninguno';
  $('#bs_head_out').textContent = headVal;
  $('#bs_upper_out').textContent = upVal;
  $('#bs_lower_out').textContent = lowVal;
  $('#bs_avg').textContent = avg;
  $('#bs_total_display').textContent = total;
  $('#bs_fatiga_display').textContent = ft;

  if (window.myBsChart) {
      window.myBsChart.destroy();
  }
  const ctx = $('#bsChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.3)');
  window.myBsChart = new Chart(ctx, {
      type: 'radar',
      data: {
          labels: ['Cabeza', 'Tren Superior', 'Tren Inferior', 'Tensión Total', 'Fatiga'],
          datasets: [{
              label: 'Nivel de Tensión',
              data: [headVal, upVal, lowVal, total, ft],
              fill: true,
              backgroundColor: gradient,
              borderColor: 'rgba(192, 132, 252, 1)',
              pointBackgroundColor: '#fff',
              pointBorderColor: 'rgba(192, 132, 252, 1)',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgb(124, 58, 237)',
              borderWidth: 2
          }]
      },
      options: {
          plugins: { legend: { display: false } },
          scales: {
              r: {
                  min: 0, max: 10,
                  angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                  grid: { color: 'rgba(255, 255, 255, 0.2)' },
                  pointLabels: { font: { size: 13, weight: 'bold' }, color: '#e5e7eb' },
                  ticks: { backdropColor: 'rgba(0,0,0,0.5)', color: '#fff' }
              }
          },
          maintainAspectRatio: false
      }
  });
  sessionStorage.setItem('sw_bs', JSON.stringify({ head:headVal, upper:upVal, lower:lowVal, avg:+avg, total, fatiga:ft }));
  show('#screenScanResults');
});
$('#btnScanResultsBack').addEventListener('click', ()=> show('#screenBodyScan'));

/* ===================== INTEGRACIÓN FINAL ===================== */
function faceScore(face){
  if(!face) return 50;
  const e = face.expression;
  if(e==='happy') return 92;
  if(e==='neutral' || e==='surprised') return 65;
  if(e==='sad') return 40;
  if(e==='angry' || e==='disgusted' || e==='fearful') return 35;
  return 60;
}
function noiseScore(db){
  const diff = Math.abs(db - 50);
  return Math.max(0, 100 - diff*2.2);
}

$('#btnToIntegration').addEventListener('click', ()=>{
  const arr = loadNoiseHistory();
  const last = arr[arr.length-1];
  const bsData = JSON.parse(sessionStorage.getItem('sw_bs')||'{}');

  const fScore = faceScore(lastFace);
  const nScore = last ? noiseScore(last.avg) : 50;
  const bScore = bsData.avg ? (100 - bsData.avg*9) : 50;
  const score = Math.round(fScore*0.25 + nScore*0.35 + bScore*0.40);

  let label = 'Atento/a', reco = 'Buen rumbo: mantén pausas activas y agua cerca.';
  if(score >= 80){ label='Muy bien'; reco='Excelente energía. Prioriza tareas importantes y cuida tu ritmo.'; }
  else if(score >= 60){ label='Bien'; reco='Sigue con respiraciones 4–6 entre tareas y micro-estiramientos.'; }
  else if(score >= 40){ label='Atento/a'; reco='Baja el ritmo 3 minutos y reorganiza tu lista en bloques breves.'; }
  else { label='Alto estrés'; reco='Necesitas una pausa real. Camina 5 min, hidrátate y busca un espacio tranquilo.'; }

  $('#ix_face_emotion').textContent = lastFace ? (emotionCopy[lastFace.expression]?.label || lastFace.expression) : '—';
  $('#ix_face_score').textContent = fScore.toFixed(0);
  $('#ix_db').textContent = last? last.avg : '—';
  $('#ix_db_class').textContent = last? labelFor(last.avg) : '—';
  $('#ix_bs_avg').textContent = bsData.avg ?? '—';
  $('#ix_bs_total').textContent = bsData.total ?? '—';
  $('#ix_score').textContent = score;
  $('#ix_label').textContent = label;
  $('#ix_mascot').src = lastFace ? pickMascot(lastFace.expression) : 'images/mascots/neutral.gif';
  $('#ix_reco').textContent = reco;

  show('#screenIntegration');
});

$('#btnIntegrationBack').addEventListener('click', ()=> show('#screenScanResults'));
$('#btnIntegrationHome').addEventListener('click', ()=>{
  signOut();
});

/* ===================== NAVEGACIÓN BÁSICA INICIAL ===================== */
window.addEventListener('DOMContentLoaded', ()=>{
  if(getSession()) show('#screenAbout');
});

/* ===================== RUTAS DE FLUJO ===================== */
$('#btnAboutStart').addEventListener('click', ()=> show('#screenFace'));
$('#btnFaceNext').addEventListener('click', ()=> show('#screenMicIntro'));
$('#btnFaceSkip').addEventListener('click', ()=> show('#screenMicIntro'));
$('#btnMicGo').addEventListener('click', ()=> show('#screenMeasure'));