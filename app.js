/* ===================== UTILIDADES BÁSICAS ===================== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function show(id) {
  $$('.screen').forEach(sc => sc.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===================== CONEXIÓN A SUAPBASE ===================== */
const { createClient } = supabase;
const SUPABASE_URL = 'https://kdxoxusimqdznduwyvhl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

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

/* ===================== AUTH (CON SUPABASE) ===================== */
async function signOut(){
  await db.auth.signOut();
  currentUser = null;
  show('#screenAuth');
  sessionStorage.clear();
}

(() => {
  const tabLogin = $('#authTabLogin');
  const tabSignup = $('#authTabSignup');
  const formLogin = $('#formLogin');
  const formSignup = $('#formSignup');
  const goAbout = $('#goAbout');
  const btnAboutBack = $('#btnAboutBack');
  const btnAboutStart = $('#btnAboutStart');
  const authMessage = $('#auth-message');

  tabLogin.addEventListener('click', ()=>{
    tabLogin.classList.add('active'); tabSignup.classList.remove('active');
    formLogin.style.display='block'; formSignup.style.display='none';
    authMessage.textContent = 'Crea una cuenta o inicia sesión para continuar.';
  });
  tabSignup.addEventListener('click', ()=>{
    tabSignup.classList.add('active'); tabLogin.classList.remove('active');
    formLogin.style.display='none'; formSignup.style.display='block';
    authMessage.textContent = 'Crea una cuenta o inicia sesión para continuar.';
  });

  formSignup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#su_user').value.trim();
    const password = $('#su_pass').value;
    const ok = $('#su_terms').checked;
    if(!username || !password || !ok) {
        authMessage.textContent = 'Completa todos los campos y acepta los términos.';
        return;
    }
    
    authMessage.textContent = 'Creando cuenta...';

    const email = `${username.toLowerCase().replace(/[^a-z0-9]/gi, '')}@example.com`;

    const { data, error } = await db.auth.signUp({
      email: email,
      password: password,
      options: { data: { username: username } }
    });

    if (error) {
      authMessage.textContent = `Error: ${error.message}`;
      return;
    }
    
    if (data.user) {
        const { error: profileError } = await db.from('profiles').insert({
            id: data.user.id,
            username: username
        });

        if (profileError) {
            authMessage.textContent = `Error al crear el perfil: ${profileError.message}`;
            return;
        }
        
        authMessage.textContent = '¡Cuenta creada con éxito! Por favor, inicia sesión.';
        tabLogin.click();
        $('#login_user').value = username;
        $('#login_pass').focus();
    }
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMessage.textContent = 'Iniciando sesión...';
    const username = $('#login_user').value.trim();
    const password = $('#login_pass').value;

    const email = `${username.toLowerCase().replace(/[^a-z0-9]/gi, '')}@example.com`;
    
    const { error } = await db.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      authMessage.textContent = 'Usuario o contraseña inválidos.';
    }
  });

  btnAboutBack.addEventListener('click', signOut);
  goAbout.addEventListener('click', ()=>show('#screenAuth'));
  btnAboutStart.addEventListener('click', ()=>show('#screenFace'));
})();

/* ===================== SELFIE EMOCIONAL (MORPHCAST) ===================== */
const btnFaceStart = $('#btnFaceStart');
const btnFaceNext  = $('#btnFaceNext');
const btnFaceSkip  = $('#btnFaceSkip');
const faceEmotion  = $('#faceEmotion');
const faceConfidence = $('#faceConfidence');
const faceTip = $('#faceTip');
const faceMascot = $('#faceMascot');
const videoContainer = $('#morphcast-video-container');

let lastFace = null;
let morphcastInitialized = false;

const emotionCopy = {
  Anger:  { label:'Tenso',    tip:'Se percibe tensión. Prueba respiración 4–6 y estiramiento de hombros 1 minuto.' },
  Disgust:{ label:'Molesto',  tip:'Date permiso para reencuadrar. 60s de respiración nasal pueden ayudar.' },
  Fear:   { label:'Aprensivo',tip:'Paso a paso. Un “to-do” pequeño y alcanzable te dará tracción.' },
  Sadness:{ label:'Bajo ánimo', tip:'Con suavidad: escucha tu cuerpo y agenda un micro-descanso mental.' },
  Joy:    { label:'Feliz',    tip:'¡Arranque brillante! Mantén mini-pausas cada 50 min para sostener esa energía.' },
  Surprise:{label:'Sorprendido', tip:'Gran apertura. Canaliza esa activación en tu primera tarea clave.' },
  Neutral:{ label:'Neutral',  tip:'Buen punto de partida. Un vaso de agua y una breve caminata elevarán tu foco.' },
};

function mapMorphcastEmotion(dominantEmotion) {
    const map = {
        'Anger': 'angry',
        'Disgust': 'disgusted',
        'Fear': 'fearful',
        'Sadness': 'sad',
        'Joy': 'happy',
        'Surprise': 'surprised',
        'Neutral': 'neutral'
    };
    return map[dominantEmotion] || 'neutral';
}

async function initializeMorphcast() {
    if (morphcastInitialized) return;
    try {
        const sdk = await downloadAISDK();
        await sdk.init();
        morphcastInitialized = true;
        
        const videoElement = await sdk.getVideo();
        videoContainer.innerHTML = '';
        videoContainer.appendChild(videoElement);
        
        await sdk.start();
        console.log("MorphCast SDK iniciado y detectando.");

        window.addEventListener('CY_FACE_EMOTION_RESULT', (evt) => {
            if (!evt.detail.output || !evt.detail.output.dominantEmotion) return;

            const dominantEmotion = evt.detail.output.dominantEmotion;
            const probability = evt.detail.output.emotion[dominantEmotion];
            
            let finalEmotion = dominantEmotion;
            let finalProbability = probability;

            if (finalEmotion === 'Neutral' && evt.detail.output.emotion.Joy < 0.1) {
                const negativeScore = (evt.detail.output.emotion.Anger || 0) + (evt.detail.output.emotion.Disgust || 0);
                if (negativeScore > 0.25) {
                    finalEmotion = 'Anger';
                    finalProbability = negativeScore;
                }
            }

            const mappedGifKey = mapMorphcastEmotion(finalEmotion);
            const map = emotionCopy[finalEmotion] || emotionCopy['Neutral'];

            faceEmotion.textContent = map.label;
            faceConfidence.textContent = (finalProbability * 100).toFixed(1) + '%';
            faceTip.textContent = map.tip;
            faceMascot.src = pickMascot(mappedGifKey);
            faceMascot.alt = map.label;

            lastFace = {
                expression: mappedGifKey,
                probability: finalProbability
            };

            btnFaceNext.disabled = false;
        });

    } catch (err) {
        console.error("Error al inicializar MorphCast SDK:", err);
        $('#faceHelp').textContent = `Error: ${err.message}. Asegúrate de estar en HTTPS.`;
        btnFaceStart.disabled = false;
        btnFaceStart.textContent = 'Reintentar activación';
    }
}

btnFaceStart.addEventListener('click', () => {
    btnFaceStart.textContent = 'Iniciando cámara...';
    btnFaceStart.disabled = true;

    const maxTries = 50;
    let tries = 0;

    const interval = setInterval(() => {
        if (typeof window.downloadAISDK === 'function') {
            clearInterval(interval);
            initializeMorphcast();
        } else {
            tries++;
            if (tries > maxTries) {
                clearInterval(interval);
                $('#faceHelp').textContent = 'Error: El SDK de MorphCast tardó demasiado en cargar. Recarga la página e intenta de nuevo.';
                btnFaceStart.disabled = false;
                btnFaceStart.textContent = 'Reintentar activación';
            }
        }
    }, 100);
});


btnFaceSkip.addEventListener('click', ()=>{
  lastFace = { expression:'neutral', probability:0.5 };
  show('#screenMicIntro');
});

btnFaceNext.addEventListener('click', ()=>{
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
const motivationEl = $('#motivation');
let audioCtx, analyser, micStream;
let running = false, samples = [];
let smooth = 0.8;
let lastNoiseAvg = 0;
let motivationInterval = null;
const motivationPhrases = [
    "Respira 4 segundos por la nariz y suelta 6 por la boca. Tu foco te lo agradece ✨",
    "Toma un pequeño sorbo de agua para mantenerte hidratado.",
    "Parpadea varias veces para lubricar tus ojos.",
    "Estira suavemente tu cuello, inclinando la cabeza de lado a lado.",
    "Levántate y estira las piernas por 10 segundos.",
    "Piensa en algo que te hizo sonreír hoy.",
    "Rota tus hombros hacia atrás 5 veces para liberar tensión."
];
function startMotivationCarousel() {
    let currentIndex = 0;
    motivationEl.textContent = motivationPhrases[currentIndex];
    if (motivationInterval) clearInterval(motivationInterval);
    motivationInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % motivationPhrases.length;
        motivationEl.style.opacity = 0;
        setTimeout(() => {
            motivationEl.textContent = motivationPhrases[currentIndex];
            motivationEl.style.opacity = 1;
        }, 500);
    }, 4000);
}
function stopMotivationCarousel() {
    if (motivationInterval) {
        clearInterval(motivationInterval);
        motivationInterval = null;
    }
}
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
      statusEl.textContent = 'Calculando promedio...';
      setTimeout(() => {
        lastNoiseAvg = Math.round(samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length));
        dbValue.textContent = lastNoiseAvg;
        dbLabel.textContent = labelFor(lastNoiseAvg);
        drawGauge(lastNoiseAvg);
        statusEl.textContent = 'Medición completa.';
        btnMeasureToResults.disabled = false;
      }, 500);
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
  renderResults();
  show('#screenResults');
});
/* ===================== RESULTADOS Y HISTÓRICO ===================== */
const refData = [
    { range: '<35 dB', title: 'Silencio Profundo', img: 'images/ind-silencio.png', description: 'Este nivel de ruido es ideal para tareas que requieren máxima concentración y para momentos de descanso mental.', recommendations: ['Aprovecha este momento para realizar tu tarea más compleja del día.', 'Realiza una meditación de 2 minutos para recargar energías.'] },
    { range: '45–55 dB', title: 'Conversación suave', img: 'images/ind-conversacion.png', description: 'Considerado el nivel ideal para un trabajo de oficina colaborativo. Permite conversaciones suaves sin ser disruptivo.', recommendations: ['Es un buen momento para una lluvia de ideas con tu equipo.', 'Si necesitas concentrarte, un poco de música instrumental puede aislarte positivamente.'] },
    { range: '55-70 dB', title: 'Oficina activa', img: 'images/ind-saludable.png', description: 'El ruido de una oficina activa puede empezar a afectar la concentración y aumentar el estrés a largo plazo.', recommendations: ['Considera usar audífonos con cancelación de ruido por bloques de 45 minutos.', 'Busca una zona tranquila para tareas que requieran foco.'] },
    { range: '≥70 dB', title: 'Alto ruido', img: 'images/ind-ruido.png', description: 'Este nivel es perjudicial para la productividad y el bienestar. Se compara con el ruido de una aspiradora o tráfico intenso.', recommendations: ['Es crucial que te tomes un descanso en un lugar más silencioso.', 'Notifica a un supervisor sobre el nivel de ruido constante si es posible.'] }
];
let historyChart = null;
async function renderResults(){
  if (!currentUser) return;
  const { data, error } = await db.from('measurements')
    .select('created_at, noise_db')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error al cargar historial:', error);
    return;
  }
  const last = { avg: lastNoiseAvg };
  $('#resultsSummary').textContent = `Promedio de tu última medición: ${last.avg} dB — ${labelFor(last.avg)}`;
  const ctx = $('#historyChart').getContext('2d');
  if(historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      datasets: [{
        label: 'Nivel de Ruido (dB)',
        data: data.map(r => r.noise_db),
        tension: 0.25,
        borderColor: '#7c3aed',
        borderWidth: 2,
        pointBackgroundColor: '#fff',
        pointRadius: 4
      }]
    },
    options: {
      plugins:{ legend:{display:false} },
      scales:{ y:{ suggestedMin:30, suggestedMax:90 } }
    }
  });
  const current = $('#currentIndicator');
  current.innerHTML = `<h4>${labelFor(last.avg)}</h4><p><b>${last.avg} dB(A)</b></p><span class="tag" style="border-color:${getColor(last.avg)}; color:${getColor(last.avg)}">Ambiente</span>`;
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
    el.innerHTML = `<img src="${r.img}" alt="${r.title}" /><h4>${r.range}</h4><p>${r.title}</p>`;
    all.appendChild(el);
  });
}
function showIndicatorDetail(index) {
    const data = refData[index];
    const detailContainer = $('#indicatorDetail');
    detailContainer.innerHTML = `<h2>${data.title} (${data.range})</h2><p class="lead">${data.description}</p><hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;"><h3>Recomendaciones:</h3><ul>${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`;
    show('#screenIndicatorDetail');
}
$('#btnRetry').addEventListener('click', ()=> show('#screenMeasure'));
$('#btnGoToBodyScan').addEventListener('click', ()=> show('#screenScanIntro'));
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
  if (window.myBsChart) window.myBsChart.destroy();
  const ctx = $('#bsChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.3)');
  window.myBsChart = new Chart(ctx, {
      type: 'radar',
      data: {
          labels: ['Cabeza', 'Tren Superior', 'Tren Inferior', 'Tensión Total', 'Fatiga'],
          datasets: [{ label: 'Nivel de Tensión', data: [headVal, upVal, lowVal, total, ft], fill: true, backgroundColor: gradient, borderColor: 'rgba(192, 132, 252, 1)', pointBackgroundColor: '#fff', pointBorderColor: 'rgba(192, 132, 252, 1)', pointHoverBackgroundColor: '#fff', pointHoverBorderColor: 'rgb(124, 58, 237)', borderWidth: 2 }]
      },
      options: {
          plugins: { legend: { display: false } },
          scales: { r: { min: 0, max: 10, angleLines: { color: 'rgba(255, 255, 255, 0.2)' }, grid: { color: 'rgba(255, 255, 255, 0.2)' }, pointLabels: { font: { size: 13, weight: 'bold' }, color: '#e5e7eb' }, ticks: { backdropColor: 'rgba(0,0,0,0.5)', color: '#fff' } } },
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
$('#btnToIntegration').addEventListener('click', async () => {
  const bsData = JSON.parse(sessionStorage.getItem('sw_bs')||'{}');
  const fScore = faceScore(lastFace);
  const nScore = noiseScore(lastNoiseAvg);
  const bScore = bsData.avg ? (100 - bsData.avg*9) : 50;
  const score = Math.round(fScore*0.25 + nScore*0.35 + bScore*0.40);
  let label = 'Atento/a', reco = 'Buen rumbo: mantén pausas activas y agua cerca.';
  if(score >= 80){ label='Muy bien'; reco='Excelente energía. Prioriza tareas importantes y cuida tu ritmo.'; }
  else if(score >= 60){ label='Bien'; reco='Sigue con respiraciones 4–6 entre tareas y micro-estiramientos.'; }
  else if(score >= 40){ label='Atento/a'; reco='Baja el ritmo 3 minutos y reorganiza tu lista en bloques breves.'; }
  else { label='Alto estrés'; reco='Necesitas una pausa real. Camina 5 min, hidrátate y busca un espacio tranquilo.'; }
  $('#ix_face_emotion').textContent = lastFace ? (emotionCopy[mapMorphcastEmotion(lastFace.expression)]?.label || lastFace.expression) : '—';
  $('#ix_face_score').textContent = fScore.toFixed(0);
  $('#ix_db').textContent = lastNoiseAvg;
  $('#ix_db_class').textContent = labelFor(lastNoiseAvg);
  $('#ix_bs_avg').textContent = bsData.avg ?? '—';
  $('#ix_bs_total').textContent = bsData.total ?? '—';
  $('#ix_score').textContent = score;
  $('#ix_label').textContent = label;
  $('#ix_mascot').src = lastFace ? pickMascot(lastFace.expression) : 'images/mascots/neutral.gif';
  $('#ix_reco').textContent = reco;
  if (currentUser) {
    const { error } = await db.from('measurements').insert({
      user_id: currentUser.id,
      face_emotion: lastFace ? lastFace.expression : 'skipped',
      noise_db: lastNoiseAvg,
      body_scan_avg: bsData.avg ?? 0,
      combined_score: score
    });
    if (error) console.error('Error al guardar la medición:', error);
    else console.log('¡Medición guardada en Supabase!');
  }
  show('#screenIntegration');
});
$('#btnIntegrationHome').addEventListener('click', ()=> show('#screenFace'));
$('#btnIntegrationBack').addEventListener('click', ()=> show('#screenScanResults'));
/* ===================== MANEJO DE SESIÓN ===================== */
db.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    const username = currentUser.user_metadata.username || currentUser.email.split('@')[0];
    $('#welcome-user').textContent = `¡Hola, ${username}!`;
    show('#screenAbout');
  } else {
    currentUser = null;
    show('#screenIntro');
  }
});
/* ===================== RUTAS DE FLUJO ===================== */
$('#btnAboutStart').addEventListener('click', ()=> show('#screenFace'));
$('#btnFaceNext').addEventListener('click', ()=> show('#screenMicIntro'));
$('#btnFaceSkip').addEventListener('click', ()=> show('#screenMicIntro'));
$('#btnMicGo').addEventListener('click', ()=> {
  startMotivationCarousel();
  show('#screenMeasure');
});

