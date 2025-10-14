// ============ SUPABASE ============
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";

let db = null;
let supabaseReady = false;

// ============ HELPERS ============
const $ = (s) => document.querySelector(s);
const showScreen = (id) => {
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const el = document.getElementById(id); if (el) el.classList.add('active'); else console.warn('no screen', id);
};
const setAuthMessage = (msg, err=false) => {
  const el = $('#auth-message'); if(!el) return;
  el.textContent = msg || ''; el.style.color = err ? 'var(--danger)' : 'var(--text-light)';
};
const capitalize = s => s ? s[0].toUpperCase()+s.slice(1) : s;
const toEmailFromUser = (u) => {
  const base = (u||'').trim().toLowerCase(); if(!base) return null;
  return `${base.replace(/[^a-z0-9._-]/g,'')}@example.com`;
};

// ============ FACE-API CONFIG ============
const MODEL_URL = './models'; // coloca aquí tus pesos (tiny_face_detector_model-weights, face_expression_model-weights)
let faceModelsReady = false;
let cameraStream = null;

// Mapea emociones → GIF local (usa tus archivos en /images)
const EMOJI_GIF = {
  happy: 'images/happy.gif',
  neutral: 'images/neutral.gif',
  sad: 'images/sad.gif',
  angry: 'images/angry.gif',
  disgusted: 'images/disgust.gif',
  fearful: 'images/fear.gif',
  surprised: 'images/surprised.gif'
};

// ============ BOOT ============
document.addEventListener('DOMContentLoaded', async () => {
  initIntroCarousel();
  initAuthTabs();
  initTermsLinks();

  // Supabase
  supabaseReady = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  if (!supabaseReady) {
    console.error('[supabase] faltan credenciales');
    setAuthMessage('Configuración de Supabase ausente.', true);
  } else {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    db.auth.onAuthStateChange(async (_e, session) => session?.user ? onSignedIn(session.user) : onSignedOut());
    const { data:{ session } } = await db.auth.getSession();
    session?.user ? onSignedIn(session.user) : showScreen('screenIntro');
  }

  initAuthForms();
  initMainNavigation();
  initFaceFlow();        // cámara + análisis
  initAudioPrepFlow();   // permiso de micro
  initNoiseMeasure();    // medición 5s
});

// ============ SESIÓN ============
async function onSignedIn(user){
  const name = (user?.user_metadata?.username) || (user?.email?.split('@')[0]) || 'Usuario';
  $('#welcome-user').textContent = `¡Hola, ${capitalize(name)}!`;
  showScreen('screenHome'); setAuthMessage('');
}
function onSignedOut(){ showScreen('screenIntro'); setAuthMessage(''); }

// ============ INTRO ============
function initIntroCarousel(){
  const slides = $('#introSlides'), dotsWrap = $('#introDots');
  const btnPrev = $('#introPrev'), btnNext = $('#introNext'), btnStart = $('#introStart');
  if(!slides) return;
  const count = slides.children.length; let i=0;
  function render(){
    slides.style.transform = `translateX(${-i*100}%)`;
    dotsWrap.innerHTML = ''; for(let k=0;k<count;k++){const d=document.createElement('div'); d.className='dot'+(k===i?' active':''); dotsWrap.appendChild(d);}
    btnPrev.disabled = i===0; btnNext.style.display = i<count-1?'inline-block':'none'; btnStart.style.display = i===count-1?'inline-block':'none';
  }
  btnPrev.onclick=()=>{ if(i>0){i--;render();} }; btnNext.onclick=()=>{ if(i<count-1){i++;render();} }; btnStart.onclick=()=>showScreen('screenAuth'); render();
}

// ============ TÉRMINOS ============
function initTermsLinks(){
  $('#view-terms-link')?.addEventListener('click',e=>{e.preventDefault();showScreen('screenTerms')});
  $('#close-terms-button')?.addEventListener('click',()=>showScreen('screenAuth'));
}

// ============ AUTH ============
function initAuthTabs(){
  const tabLogin=$('#authTabLogin'), tabSignup=$('#authTabSignup'), formLogin=$('#formLogin'), formSignup=$('#formSignup');
  if(!tabLogin) return;
  tabLogin.addEventListener('click',()=>{tabLogin.classList.add('active');tabSignup.classList.remove('active');formLogin.style.display='block';formSignup.style.display='none';setAuthMessage('');});
  tabSignup.addEventListener('click',()=>{tabSignup.classList.add('active');tabLogin.classList.remove('active');formSignup.style.display='block';formLogin.style.display='none';setAuthMessage('');});
}
function initAuthForms(){
  $('#formLogin')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!supabaseReady) return setAuthMessage('Configura Supabase.',true);
    const u=$('#login_user').value.trim(), p=$('#login_pass').value; if(!u||!p) return setAuthMessage('Completa los campos.',true);
    try{ setAuthMessage('Iniciando sesión...'); const {error}=await db.auth.signInWithPassword({email:toEmailFromUser(u), password:p}); if(error) throw error; setAuthMessage('Sesión iniciada.'); }catch(err){ console.error(err); setAuthMessage(humanizeAuthError(err),true); }
  });
  $('#formSignup')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!supabaseReady) return setAuthMessage('Configura Supabase.',true);
    const u=$('#su_user').value.trim(), p=$('#su_pass').value, ok=$('#su_terms').checked;
    if(!u||!p) return setAuthMessage('Completa los campos.',true);
    if(!ok) return setAuthMessage('Debes aceptar los términos.',true);
    try{
      setAuthMessage('Creando cuenta...');
      const {error}=await db.auth.signUp({email:toEmailFromUser(u), password:p, options:{data:{username:u}}});
      if(error) throw error;
      await db.auth.signInWithPassword({email:toEmailFromUser(u), password:p});
    }catch(err){ console.error(err); setAuthMessage(humanizeAuthError(err),true); }
  });
}
function humanizeAuthError(err){const m=(err?.message||'').toLowerCase(); if(m.includes('invalid')) return 'Usuario o contraseña incorrectos.'; if(m.includes('password')) return 'Revisa la contraseña.'; if(m.includes('network')) return 'Problema de conexión.'; return err?.message||'Error inesperado.';}

// ============ NAVEGACIÓN ============
function initMainNavigation(){
  $('#btnHomeStart')?.addEventListener('click',()=>showScreen('screenFace'));
  $('#btnSignOut')?.addEventListener('click',async()=>{ await db?.auth.signOut(); onSignedOut(); });
  $('#btnFaceSkip')?.addEventListener('click',()=>{ $('#faceEmotion').textContent='—'; $('#faceConfidence').textContent='—'; $('#btnFaceNext').disabled=false; });
  $('#btnFaceNext')?.addEventListener('click',()=>showScreen('screenAudioPrep'));
  $('#btnGoToMeasure')?.addEventListener('click',()=>showScreen('screenMeasure'));
  $('#btnMeasureNext')?.addEventListener('click',()=>showScreen('screenBodyScan'));
  $('#btnBodyScanNext')?.addEventListener('click',()=>{ renderFinalReport(); showScreen('screenIntegration'); });
  $('#btnIntegrationHome')?.addEventListener('click',()=>showScreen('screenHome'));
}

// ============ SELFIE / CÁMARA ============
function initFaceFlow(){
  const video = $('#faceVideo');
  const btnStart = $('#btnFaceStart');
  const btnSnap  = $('#btnFaceSnap');

  // iOS/Safari quirks
  if (video) { video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true; }

  btnStart?.addEventListener('click', async () => {
    try{
      await ensureFaceModels();
      await startCamera(video);
      btnSnap.disabled = false;
      $('#faceHelp').textContent = 'Cámara activa. Ahora presiona "Analizar mi expresión".';
    }catch(err){
      console.error('[camera]', err);
      alert('No se pudo activar la cámara. Verifica permisos y que estés en HTTPS.');
    }
  });

  btnSnap?.addEventListener('click', async ()=>{
    if (!video?.srcObject) return alert('Activa primero la cámara.');
    try{
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: .5 }))
        .withFaceExpressions();
      if (!det) {
        $('#faceEmotion').textContent = 'No detectada';
        $('#faceConfidence').textContent = '—';
        $('#faceTip').textContent = 'Asegúrate de que tu rostro esté bien iluminado y centrado.';
        $('#face-results-content').classList.remove('hidden');
        $('#btnFaceNext').disabled = false;
        return;
      }
      const expr = det.expressions.asSortedArray()[0]; // { expression, probability }
      const emotion = expr.expression;
      const conf = (expr.probability*100).toFixed(1)+'%';

      $('#faceEmotion').textContent = emotion;
      $('#faceConfidence').textContent = conf;
      const gif = EMOJI_GIF[emotion] || EMOJI_GIF.neutral;
      const img = $('#faceMascot'); img.src = gif; img.alt = `emoción ${emotion}`;
      $('#faceTip').textContent = tipForEmotion(emotion);
      $('#face-results-content').classList.remove('hidden');
      $('#btnFaceNext').disabled = false;
    }catch(err){
      console.error('[analyze]', err);
      alert('Ocurrió un problema al analizar el rostro.');
    }
  });
}

async function ensureFaceModels(){
  if (faceModelsReady) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
  ]);
  faceModelsReady = true;
}

async function startCamera(videoEl){
  // Recomendado para móviles: facingMode "user"
  const constraints = {
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  };
  // Solicitar tras gesto del usuario
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  cameraStream = stream;
  videoEl.srcObject = stream;
  // iOS requiere play() explícito y muted/playsinline
  await videoEl.play();
}

function tipForEmotion(e){
  switch(e){
    case 'happy': return 'Sigue así. Haz 3 respiraciones profundas para mantener ese estado.';
    case 'neutral': return 'Tómate 1 minuto para planear tu primera tarea clave.';
    case 'sad': return 'Una breve caminata o luz natural puede ayudarte a subir el ánimo.';
    case 'angry': return 'Prueba 4 respiraciones lentas (4-4-4-4) antes de continuar.';
    case 'fearful': return 'Recuerda: una cosa a la vez. Prioriza y avanza paso a paso.';
    case 'disgusted': return 'Muévete un poco y cambia de foco por 2 minutos.';
    case 'surprised': return 'Aprovecha la activación: anota 1 objetivo concreto.';
    default: return 'Respira profundo por 60 segundos y vuelve con foco.';
  }
}

// ============ AUDIO: PREP / PERMISOS ============
let micTested = false;
function initAudioPrepFlow(){
  const btnTest = $('#btnTestMic');
  const msg = $('#audio-permission-msg');
  const res = $('#audio-permission-result');
  const btnNext = $('#btnGoToMeasure');

  btnTest?.addEventListener('click', async ()=>{
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Detenemos de inmediato: solo probamos permiso
      stream.getTracks().forEach(t=>t.stop());
      micTested = true;
      res.textContent = 'Micrófono OK. Permiso otorgado.';
      res.style.color = 'var(--success)';
      btnNext.disabled = false;
      msg.textContent = 'Perfecto. Ahora puedes continuar a la medición.';
    }catch(err){
      console.error('[mic test]', err);
      res.textContent = 'No se pudo acceder al micrófono. Revisa permisos.';
      res.style.color = 'var(--danger)';
      btnNext.disabled = true;
    }
  });
}

// ============ MEDICIÓN DE RUIDO (5s) ============
function initNoiseMeasure(){
  const btn = $('#toggleBtn');
  const dbValueEl = $('#dbValue');
  const dbLabelEl = $('#dbLabel');
  const countdownEl = $('#countdown');
  const status = $('#status');
  const resultsCard = $('#noise-results-card');
  const finalDb = $('#final-db-result');
  const finalLabel = $('#final-db-label');
  const btnNext = $('#btnMeasureNext');

  let audioCtx, analyser, micStream, raf, values = [], started=false;

  function classify(db){
    if (db < 45) return 'muy tranquilo';
    if (db < 60) return 'tranquilo';
    if (db < 75) return 'moderado';
    return 'alto';
  }

  async function startMeasure(){
    if (!micTested) {
      alert('Primero prueba el micrófono en la pantalla anterior.');
      return;
    }
    if (started) return;
    started = true; values = [];
    status.textContent = 'Midiendo...';
    btn.textContent = '⏹️ Detener';
    btn.disabled = true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    let remaining = 5.0;
    const tick = ()=>{
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      // RMS → dB aprox (calibración simple)
      let sum=0; for (let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum += v*v; }
      const rms = Math.sqrt(sum/data.length);
      const dB = Math.max(20*Math.log10(rms)+90, 0); // offset simple
      values.push(dB);
      dbValueEl.textContent = Math.round(dB);
      dbLabelEl.textContent = classify(dB);
      remaining = Math.max(0, remaining - 0.05);
      countdownEl.textContent = `${remaining.toFixed(1)} s`;
      if (remaining>0){
        raf = requestAnimationFrame(tick);
      }else{
        stopMeasure();
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function stopMeasure(){
    cancelAnimationFrame(raf);
    micStream?.getTracks().forEach(t=>t.stop());
    audioCtx?.close();
    btn.textContent = '🎙️ Iniciar 5s';
    btn.disabled = false;
    started = false;
    const avg = values.length ? (values.reduce((a,b)=>a+b,0)/values.length) : 0;
    const label = classify(avg);
    finalDb.textContent = `${Math.round(avg)} dB`;
    finalLabel.textContent = label;
    resultsCard.classList.remove('hidden');
    status.textContent = 'Medición finalizada.';
    btnNext.disabled = false;
  }

  btn?.addEventListener('click', ()=> startMeasure());
}

// ============ INFORME ============
function renderFinalReport(){
  // valores dummy si aún no cableamos almacenamiento
  const face = 70, dbScore = 65, body = 60;
  const ix = Math.round(0.33*face + 0.33*dbScore + 0.34*body);

  const circle = $('#ix_score_circle');
  const label = $('#ix_label');
  const pf = $('#ix_face_progress');
  const pd = $('#ix_db_progress');
  const pb = $('#ix_bs_progress');
  const reco = $('#ix_reco');

  if (circle){ circle.textContent = ix; circle.style.background = ix>=67?'#48bb78':ix>=34?'#f6ad55':'#e53e3e'; }
  if (label){ label.textContent = ix>=67 ? 'En Verde' : ix>=34 ? 'Atento' : 'Revisa tu día'; }
  if (pf){ pf.style.width = `${face}%`; pf.style.background = '#8DB596'; }
  if (pd){ pd.style.width = `${dbScore}%`; pd.style.background = '#A7AD9A'; }
  if (pb){ pb.style.width = `${body}%`; pb.style.background = '#70755D'; }
  if (reco){ reco.textContent = 'Consejo: tómate 2 minutos para respirar profundo y estirar hombros.'; }
}


