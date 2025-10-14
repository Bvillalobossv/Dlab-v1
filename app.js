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
  const slides = document.querySelector('#introSlides');
  const totalSlides = slides.children.length;
  const dots = $('#introDots');
  const prev = $('#introPrev');
  const next = $('#introNext');
  const start = $('#introStart');
  let idx = 0;

  function renderDots() {
    dots.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i === idx ? ' active' : '');
      dots.appendChild(d);
    }
  }

  function go(i) {
    idx = Math.max(0, Math.min(i, totalSlides - 1));
    slides.style.transform = `translateX(-${idx * 100}%)`;
    renderDots();
    prev.style.display = (idx === 0) ? 'none' : 'inline-block';
    next.style.display = (idx === totalSlides - 1) ? 'none' : 'inline-block';
    start.style.display = (idx === totalSlides - 1) ? 'inline-block' : 'none';
  }

  prev.addEventListener('click', () => go(idx - 1));
  next.addEventListener('click', () => go(idx + 1));
  start.addEventListener('click', () => show('#screenAuth'));
  renderDots();
  go(0);
})();

/* ===================== AUTH (CON SUPABASE) ===================== */
async function signOut() {
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
  const authMessage = $('#auth-message');
  const viewTermsLink = $('#view-terms-link');
  const closeTermsButton = $('#close-terms-button');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabSignup.classList.remove('active');
    formLogin.style.display = 'block'; formSignup.style.display = 'none';
    authMessage.textContent = '';
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active'); tabLogin.classList.remove('active');
    formLogin.style.display = 'none'; formSignup.style.display = 'block';
    authMessage.textContent = '';
  });

  viewTermsLink.addEventListener('click', (e) => {
      e.preventDefault();
      show('#screenTerms');
  });

  closeTermsButton.addEventListener('click', () => {
      show('#screenAuth');
  });

  formSignup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#su_user').value.trim();
    const password = $('#su_pass').value;
    const ok = $('#su_terms').checked;
    if (!username || !password) return authMessage.textContent = 'Por favor, completa todos los campos.';
    if (!ok) return authMessage.textContent = 'Debes aceptar los términos y condiciones.';

    authMessage.textContent = 'Creando cuenta...';
    const email = `${username.toLowerCase().replace(/[^a-z0-9]/gi, '')}@example.com`;

    const { data, error } = await db.auth.signUp({ email, password, options: { data: { username } } });

    if (error) return authMessage.textContent = `Error: ${error.message}`;
    
    if (data.user) {
      const { error: profileError } = await db.from('profiles').insert({ id: data.user.id, username: username });
      if (profileError) return authMessage.textContent = `Error al crear perfil: ${profileError.message}`;
      
      authMessage.textContent = '¡Cuenta creada! Por favor, inicia sesión.';
      tabLogin.click();
      $('#login_user').value = username;
      $('#login_pass').focus();
    }
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMessage.textContent = 'Ingresando...';
    const username = $('#login_user').value.trim();
    const password = $('#login_pass').value;
    const email = `${username.toLowerCase().replace(/[^a-z0-9]/gi, '')}@example.com`;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) authMessage.textContent = 'Usuario o contraseña incorrectos.';
  });
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
const faceResultsContent = $('#face-results-content');
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

let faceStream = null;
let modelsLoaded = false;
let lastFace = null;

const emotionCopy = {
  happy: { label:'Alegría', tip:'Una sonrisa es un gran comienzo. Mantén esa energía positiva durante tu día.' },
  neutral:{ label:'Calma', tip:'Un estado de calma es ideal para la concentración. Aprovecha para enfocarte en tus tareas.' },
  angry:  { label:'Tensión', tip:'Parece que algo te preocupa. Una pausa para respirar profundamente puede hacer una gran diferencia.' },
  sad:    { label:'Tristeza', tip:'Es válido no sentirse bien. Sé amable contigo mismo y permítete un momento para procesarlo.' },
  surprised:{ label:'Sorpresa', tip:'La sorpresa activa la mente. ¿Qué nueva oportunidad puedes ver en esto?' },
  fearful:{ label:'Inquietud', tip:'La inquietud es una señal para proceder con cautela. Paso a paso, puedes manejarlo.' },
  disgusted:{ label:'Disgusto', tip:'Algo no te agrada. Identificar qué es, es el primer paso para cambiarlo.' }
};

async function ensureModels(){
  if(modelsLoaded) return;
  btnFaceStart.textContent = 'Cargando IA...';
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
  ]);
  modelsLoaded = true;
  btnFaceStart.textContent = '📸 Activar cámara';
}

function stopFace(){
  if(faceStream){
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
}

btnFaceStart.addEventListener('click', async () => {
  btnFaceStart.disabled = true;
  try {
    await ensureModels();
    faceStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
    video.srcObject = faceStream;
    video.onloadedmetadata = () => {
      video.play();
      btnFaceSnap.disabled = false;
      btnFaceStart.textContent = 'Cámara Activa';
      $('#faceHelp').textContent = '¡Listo! Presiona el botón para analizar.';
    };
  } catch (err) {
    alert('No pudimos acceder a la cámara. Revisa permisos o abre en HTTPS.');
    btnFaceStart.disabled = false;
    btnFaceStart.textContent = '📸 Activar cámara';
  }
});

btnFaceSnap.addEventListener('click', async ()=>{
  try {
    const det = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceExpressions();
    if(!det) {
      faceTip.textContent = 'No pudimos detectar un rostro. Intenta mejorar la iluminación.';
      faceResultsContent.classList.remove('hidden');
      return;
    }
    let { expression, probability } = det.expressions.asSortedArray()[0];
    if (expression === 'neutral' && det.expressions.happy < 0.1) {
      const negativeScore = (det.expressions.angry || 0) + (det.expressions.disgusted || 0);
      if (negativeScore > 0.25) {
        expression = 'angry';
        probability = negativeScore;
      }
    }
    lastFace = { expression, probability };
    const map = emotionCopy[expression] || emotionCopy.neutral;
    faceEmotion.textContent = map.label;
    faceConfidence.textContent = `${(probability*100).toFixed(0)}%`;
    faceTip.textContent = map.tip;
    faceMascot.src = `images/mascots/${expression}.gif`;
    faceResultsContent.classList.remove('hidden');
    btnFaceNext.disabled = false;
  } catch(err) {
    alert('Ocurrió un problema al analizar el rostro.');
  }
});

btnFaceSkip.addEventListener('click', () => {
  lastFace = null;
  stopFace();
  show('#screenMeasure');
});
btnFaceNext.addEventListener('click', () => {
  stopFace();
  show('#screenMeasure');
});


/* ===================== MEDICIÓN DE RUIDO ===================== */
const gaugeCanvas = $('#gaugeCanvas');
const dbValue = $('#dbValue');
const dbLabel = $('#dbLabel');
const countdownEl = $('#countdown');
const statusEl = $('#status');
const toggleBtn = $('#toggleBtn');
const btnMeasureNext = $('#btnMeasureNext');
const finalDbResult = $('#final-db-result');
const finalDbLabel = $('#final-db-label');
const noiseResultsCard = $('#noise-results-card');

let audioCtx, analyser, micStream;
let samples = [];
let lastNoiseAvg = 0;

function drawGauge(val){
  const ctx = gaugeCanvas.getContext('2d');
  const w = gaugeCanvas.width, h = gaugeCanvas.height;
  ctx.clearRect(0,0,w,h);
  const pct = Math.max(0, Math.min(1, (val - 30)/(90-30)));
  ctx.lineWidth = 22;
  ctx.strokeStyle = 'rgba(0,0,0,.08)';
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2-22, Math.PI*0.75, Math.PI*2.25);
  ctx.stroke();
  ctx.strokeStyle = getColor(val).bg;
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2-22, Math.PI*0.75, Math.PI*0.75 + pct*Math.PI*1.5);
  ctx.stroke();
}
function getColor(dB) {
  if(dB < 50) return { bg: 'var(--success)'};
  if(dB < 70) return { bg: 'var(--warning)'};
  return { bg: 'var(--danger)'};
}
function labelFor(dB){
  if(dB < 50) return 'Tranquilo';
  if(dB < 70) return 'Moderado';
  return 'Ruidoso';
}

toggleBtn.addEventListener('click', async () => {
  toggleBtn.disabled = true;
  statusEl.textContent = 'Midiendo...';
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    src.connect(analyser);
    
    samples = [];
    const duration = 5;
    let timeLeft = duration;
    
    const interval = setInterval(() => {
      timeLeft -= 0.1;
      countdownEl.textContent = `${timeLeft.toFixed(1)} s`;
      
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((sum, val) => sum + val*val, 0) / buf.length);
      const dB = 20 * Math.log10(rms) + 90;
      if (isFinite(dB)) samples.push(dB);
      
      const smoothed = samples.slice(-5).reduce((a,b)=>a+b,0) / Math.min(5, samples.length);
      dbValue.textContent = Math.round(smoothed);
      const colorInfo = getColor(smoothed);
      dbLabel.style.backgroundColor = colorInfo.bg;
      dbLabel.style.color = 'white';
      dbLabel.textContent = labelFor(smoothed);
      drawGauge(smoothed);

      if (timeLeft <= 0) {
        clearInterval(interval);
        micStream.getTracks().forEach(t => t.stop());
        audioCtx.close();
        lastNoiseAvg = Math.round(samples.reduce((a,b)=>a+b,0) / samples.length);
        finalDbResult.textContent = lastNoiseAvg;
        finalDbLabel.textContent = labelFor(lastNoiseAvg).toLowerCase();
        noiseResultsCard.classList.remove('hidden');
        btnMeasureNext.disabled = false;
        statusEl.textContent = 'Medición finalizada.';
        toggleBtn.style.display = 'none';
      }
    }, 100);
  } catch (err) {
    alert('No se pudo acceder al micrófono.');
    toggleBtn.disabled = false;
    statusEl.textContent = 'Error al acceder al micrófono.';
  }
});
btnMeasureNext.addEventListener('click', () => show('#screenBodyScan'));

/* ===================== BODY SCAN & JOURNAL ===================== */
const btnBodyScanNext = $('#btnBodyScanNext');
const btnJournalNext = $('#btnJournalNext');

let bodyScanData = {};
let journalEntry = "";

btnBodyScanNext.addEventListener('click', () => {
    bodyScanData = {
        head: +$('#bs_head_tension').value,
        upper: +$('#bs_upper_tension').value,
        lower: +$('#bs_lower_tension').value,
    };
    show('#screenJournal');
});

btnJournalNext.addEventListener('click', async () => {
    journalEntry = $('#journal-input').value.trim();
    await renderFinalReport();
    show('#screenIntegration');
});

/* ===================== INFORME DE BIENESTAR ===================== */
const ixScoreCircle = $('#ix_score_circle');
const ixLabel = $('#ix_label');
const ixFaceProgress = $('#ix_face_progress');
const ixDbProgress = $('#ix_db_progress');
const ixBsProgress = $('#ix_bs_progress');
const ixReco = $('#ix_reco');
const btnIntegrationHome = $('#btnIntegrationHome');

async function renderFinalReport() {
    // 1. Calcular puntajes individuales (0-100, donde 100 es mejor)
    let faceScore;
    if (lastFace) {
        if (lastFace.expression === 'happy') faceScore = 95;
        else if (lastFace.expression === 'neutral' || lastFace.expression === 'surprised') faceScore = 75;
        else faceScore = 30; // angry, sad, etc.
    } else {
        faceScore = 60; // 'skipped' score
    }

    const noiseScore = Math.max(0, 100 - (Math.abs(lastNoiseAvg - 50) * 2.5));
    const tensionAvg = (bodyScanData.head + bodyScanData.upper + bodyScanData.lower) / 3;
    const tensionScore = Math.round(100 - ((tensionAvg - 1) / 9) * 100);
    
    // 2. Calcular índice combinado
    const combinedScore = Math.round((faceScore * 0.4) + (noiseScore * 0.2) + (tensionScore * 0.4));

    // 3. Determinar estado y color
    let label, color;
    if (combinedScore >= 75) { label = 'En Equilibrio'; color = 'var(--success)'; }
    else if (combinedScore >= 50) { label = 'Atención Moderada'; color = 'var(--warning)'; }
    else { label = 'Alto Desbalance'; color = 'var(--danger)'; }

    // 4. Generar recomendación
    const scores = { 'Anímico': faceScore, 'Entorno': noiseScore, 'Corporal': tensionScore };
    const worstDimension = Object.keys(scores).reduce((a, b) => scores[a] < scores[b] ? a : b);
    
    let reco = `Tu Índice de Equilibrio es ${combinedScore}%. Hoy, tu área de mayor oportunidad es la dimensión <strong>${worstDimension}</strong>. `;
    if (worstDimension === 'Anímico') {
        reco += 'Dedica unos minutos a una actividad que disfrutes o habla con alguien de confianza.';
    } else if (worstDimension === 'Entorno') {
        reco += 'Busca un espacio más tranquilo o usa audífonos con música relajante para mejorar tu concentración.';
    } else {
        reco += 'Tómate una pausa activa de 2 minutos para estirar las zonas con mayor tensión. Tu cuerpo te lo agradecerá.';
    }

    // 5. Renderizar en la UI
    ixScoreCircle.textContent = combinedScore;
    ixScoreCircle.style.backgroundColor = color;
    ixLabel.textContent = label;

    ixFaceProgress.style.width = `${faceScore}%`;
    ixFaceProgress.style.backgroundColor = faceScore > 70 ? 'var(--success)' : (faceScore > 40 ? 'var(--warning)' : 'var(--danger)');
    
    ixDbProgress.style.width = `${noiseScore}%`;
    ixDbProgress.style.backgroundColor = noiseScore > 70 ? 'var(--success)' : (noiseScore > 40 ? 'var(--warning)' : 'var(--danger)');

    ixBsProgress.style.width = `${tensionScore}%`;
    ixBsProgress.style.backgroundColor = tensionScore > 70 ? 'var(--success)' : (tensionScore > 40 ? 'var(--warning)' : 'var(--danger)');
    
    ixReco.innerHTML = reco;

    // 6. Guardar en Supabase
    if (currentUser) {
        const { error } = await db.from('measurements').insert({
            user_id: currentUser.id,
            face_emotion: lastFace ? lastFace.expression : 'skipped',
            noise_db: lastNoiseAvg,
            body_scan_avg: tensionAvg,
            combined_score: combinedScore,
            journal_entry: journalEntry
        });
        if (error) console.error('Error al guardar medición:', error);
    }
}
btnIntegrationHome.addEventListener('click', () => {
    // Reiniciar estados para un nuevo flujo
    lastFace = null;
    lastNoiseAvg = 0;
    bodyScanData = {};
    journalEntry = "";
    // Restablecer UI de pantallas
    $('#face-results-content').classList.add('hidden');
    btnFaceNext.disabled = true;
    toggleBtn.style.display = 'inline-block';
    toggleBtn.disabled = false;
    noiseResultsCard.classList.add('hidden');
    btnMeasureNext.disabled = true;
    $('#journal-input').value = '';
    show('#screenFace');
});


/* ===================== MANEJO DE SESIÓN Y RUTAS ===================== */
db.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    show('#screenFace'); // Inicia directamente en el flujo de medición
  } else {
    currentUser = null;
    show('#screenIntro');
  }
});

$('#btnMicGo').addEventListener('click', ()=> {
  show('#screenMeasure');
});

