// ============ SUPABASE ============
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";

let db = null;
let supabaseReady = false;

// ============ STATE ============
const state = {
  user: null,
  face: { emotion: null, confidence: 0 },
  noise: { samples: [], avg: 0, label: '' },
  context: { area: 'Ventas', hours: null, load: 5, pace: 5, stress: 5, datetime: null },
  body: { head: 1, upper: 1, lower: 1 },
  journal: ''
};

// ============ HELPERS ============
const $ = s => document.querySelector(s);
const showScreen = id => {
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const el = document.getElementById(id); if (el) el.classList.add('active'); else console.warn('no screen', id);
};
const setAuthMessage = (msg, err=false) => { const el=$('#auth-message'); if(!el) return; el.textContent=msg||''; el.style.color=err?'var(--danger)':'var(--text-light)'; };
const capitalize = s => s ? s[0].toUpperCase()+s.slice(1) : s;
const toEmailFromUser = u => `${(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@example.com`;

// ============ FACE-API ============
const MODEL_URL = './models';
let faceModelsReady = false;
let cameraStream = null;
const EMOJI_GIF = {
  happy: 'images/happy.gif', neutral:'images/neutral.gif', sad:'images/sad.gif',
  angry:'images/angry.gif', disgusted:'images/disgust.gif', fearful:'images/fear.gif', surprised:'images/surprised.gif'
};

// ============ GAUGE / CHARTS ============
let gaugeChart = null;
let historyChart = null;

// ============ BOOT ============
document.addEventListener('DOMContentLoaded', async () => {
  initIntroCarousel();
  initAuthTabs();
  initTermsLinks();

  supabaseReady = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  if (!supabaseReady) {
    console.error('[supabase] faltan credenciales'); setAuthMessage('Configura Supabase.', true);
  } else {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    db.auth.onAuthStateChange(async (_e, session) => session?.user ? onSignedIn(session.user) : onSignedOut());
    const { data:{ session } } = await db.auth.getSession();
    session?.user ? onSignedIn(session.user) : showScreen('screenIntro');
  }

  initAuthForms();
  initMainNavigation();
  initFaceFlow();
  initAudioPrepFlow();
  initNoiseMeasure();
  initContextForm();
});

// ============ SESIÓN ============
async function onSignedIn(user){
  state.user = user;
  const name = (user?.user_metadata?.username) || (user?.email?.split('@')[0]) || 'Usuario';
  $('#welcome-user').textContent = `¡Hola, ${capitalize(name)}!`;
  showScreen('screenHome'); setAuthMessage('');
}
function onSignedOut(){ state.user=null; showScreen('screenIntro'); setAuthMessage(''); }

// ============ INTRO ============
function initIntroCarousel(){
  const slides = $('#introSlides'), dotsWrap = $('#introDots');
  const btnPrev = $('#introPrev'), btnNext = $('#introNext'), btnStart = $('#introStart');
  if(!slides) return;
  const count = slides.children.length; let i=0;
  function render(){
    slides.style.transform = `translateX(${-i*100}%)`;
    dotsWrap.innerHTML=''; for(let k=0;k<count;k++){const d=document.createElement('div'); d.className='dot'+(k===i?' active':''); dotsWrap.appendChild(d);}
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
  $('#btnMeasureNext')?.addEventListener('click',()=>showScreen('screenContext'));
  $('#btnContextNext')?.addEventListener('click',()=>showScreen('screenJournal'));
  $('#btnJournalNext')?.addEventListener('click',async()=>{ await renderAndPersistReport(); showScreen('screenIntegration'); });
  $('#btnIntegrationHome')?.addEventListener('click',()=>showScreen('screenHome'));
}

// ============ SELFIE / CÁMARA ============
function initFaceFlow(){
  const video = $('#faceVideo');
  const btnStart = $('#btnFaceStart');
  const btnSnap  = $('#btnFaceSnap');
  if (video) { video.setAttribute('playsinline',''); video.muted = true; video.autoplay = true; }

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
        state.face = { emotion:null, confidence:0 };
        return;
      }
      const expr = det.expressions.asSortedArray()[0]; // { expression, probability }
      const emotion = expr.expression;
      const conf = +(expr.probability*100).toFixed(1);

      $('#faceEmotion').textContent = emotion;
      $('#faceConfidence').textContent = conf+'%';
      const gif = EMOJI_GIF[emotion] || EMOJI_GIF.neutral;
      const img = $('#faceMascot'); img.src = gif; img.alt = `emoción ${emotion}`;
      $('#faceTip').textContent = tipForEmotion(emotion);
      $('#face-results-content').classList.remove('hidden');
      $('#btnFaceNext').disabled = false;

      state.face = { emotion, confidence: conf };
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
  const constraints = {
    video: { facingMode: 'user', width:{ideal:640}, height:{ideal:480} },
    audio: false
  };
  // Safari/iOS requiere gesto de usuario y play() manual
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  cameraStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
}

function tipForEmotion(e){
  switch(e){
    case 'happy': return 'Sigue así. Haz 3 respiraciones profundas para mantener ese estado.';
    case 'neutral': return 'Tómate 1 minuto para planear tu primera tarea clave.';
    case 'sad': return 'Una breve caminata o luz natural puede ayudarte a subir el ánimo.';
    case 'angry': return 'Prueba 4 respiraciones lentas (4-4-4-4) antes de continuar.';
    case 'fearful': return 'Una cosa a la vez. Prioriza y avanza paso a paso.';
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
      stream.getTracks().forEach(t=>t.stop());
      micTested = true;
      res.textContent = 'Micrófono OK. Permiso otorgado.';
      res.style.color = 'var(--success)';
      btnNext.disabled = false;
      msg.textContent = 'Perfecto. Continúa a la medición.';
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

  // Gauge Chart.js
  const gctx = $('#gaugeChart').getContext('2d');
  gaugeChart = new Chart(gctx, {
    type: 'doughnut',
    data: { labels:['valor','resto'], datasets:[{ data:[0,100], borderWidth:0, cutout:'80%'}]},
    options: {
      responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180,
      plugins:{ legend:{display:false}, tooltip:{enabled:false} }
    }
  });

  function setGauge(v){
    const pct = Math.max(0, Math.min(100, v)); // 0-100
    gaugeChart.data.datasets[0].data = [pct, 100-pct];
    const color = pct<45? '#8DB596' : pct<65? '#A7AD9A' : pct<80? '#f6ad55' : '#e53e3e';
    gaugeChart.data.datasets[0].backgroundColor = [color, '#eee'];
    gaugeChart.update('none');
  }

  function classify(db){
    if (db < 45) return 'muy tranquilo';
    if (db < 60) return 'tranquilo';
    if (db < 75) return 'moderado';
    return 'alto';
  }

  // History line chart (filled after run)
  const hctx = $('#noiseHistory').getContext('2d');
  historyChart = new Chart(hctx, {
    type: 'line',
    data: { labels:[], datasets:[{ data:[], tension:.35, pointRadius:0 }]},
    options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ display:false }, y:{ beginAtZero:true, suggestedMax:80 } } }
  });

  async function startMeasure(){
    if (!micTested) { alert('Primero prueba el micrófono en la pantalla anterior.'); return; }
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

    let remaining = 5.0, ticks = 0;
    const tick = ()=>{
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum=0; for (let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum += v*v; }
      const rms = Math.sqrt(sum/data.length);
      const dB = Math.max(20*Math.log10(rms)+90, 0); // calibración simple
      values.push(dB);
      dbValueEl.textContent = Math.round(dB);
      dbLabelEl.textContent = classify(dB);
      setGauge(Math.min(Math.max(dB,0),100));
      remaining = Math.max(0, remaining - 0.05);
      countdownEl.textContent = `${remaining.toFixed(1)} s`;
      ticks++;
      if (remaining>0){ raf = requestAnimationFrame(tick); } else { stopMeasure(); }
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
    btnNext.disabled = true; // se habilita cuando haya datos en history

    // actualizar gráfico histórico (esta sesión)
    const xs = values.map((_,i)=>i);
    historyChart.data.labels = xs;
    historyChart.data.datasets[0].data = values.map(v=>Math.round(v));
    historyChart.update();

    state.noise = { samples: values.slice(), avg: Math.round(avg), label };
    btnNext.disabled = false;
  }

  btn?.addEventListener('click', ()=> startMeasure());
}

// ============ CONTEXTO ============
function initContextForm(){
  const dt = $('#ctx_datetime');
  if (dt) {
    const now = new Date();
    dt.value = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  $('#ctx_area')?.addEventListener('change',e=> state.context.area = e.target.value);
  $('#ctx_hours')?.addEventListener('input',e=> state.context.hours = +e.target.value||0);
  $('#ctx_load')?.addEventListener('input',e=> state.context.load = +e.target.value||5);
  $('#ctx_pace')?.addEventListener('input',e=> state.context.pace = +e.target.value||5);
  $('#ctx_stress')?.addEventListener('input',e=> state.context.stress = +e.target.value||5);
  $('#ctx_datetime')?.addEventListener('change',e=> state.context.datetime = e.target.value);
}

// ============ INFORME + PERSISTENCIA ============
async function renderAndPersistReport(){
  // Body scan (si no implementaste sliders específicos, usamos contexto como proxy)
  const bodyAvg = Math.round((state.context.load + state.context.pace + state.context.stress)/3 * 10); // 10→100 escala
  const faceScore = state.face.emotion ? emotionToScore(state.face.emotion) : 60;
  const noiseScore = 100 - clamp(state.noise.avg, 0, 100); // a menor dB, mayor score (aprox)
  const ix = Math.round(0.33*faceScore + 0.33*noiseScore + 0.34*bodyAvg);

  // UI
  const circle = $('#ix_score_circle');
  const label = $('#ix_label');
  const pf = $('#ix_face_progress');
  const pd = $('#ix_db_progress');
  const pb = $('#ix_bs_progress');
  const reco = $('#ix_reco');

  if (circle){ circle.textContent = ix; circle.style.background = ix>=67?'#48bb78':ix>=34?'#f6ad55':'#e53e3e'; }
  if (label){ label.textContent = ix>=67 ? 'En Verde' : ix>=34 ? 'Atento' : 'Revisa tu día'; }
  if (pf){ pf.style.width = `${faceScore}%`; pf.style.background = '#8DB596'; }
  if (pd){ pd.style.width = `${noiseScore}%`; pd.style.background = '#A7AD9A'; }
  if (pb){ pb.style.width = `${bodyAvg}%`; pb.style.background = '#70755D'; }
  if (reco){ reco.textContent = buildReco(faceScore, noiseScore, bodyAvg); }

  // Persistencia en Supabase
  try{
    const user = (await db.auth.getUser())?.data?.user;
    if (!user) return;
    // 1) actualizar área en profiles
    await db.from('profiles').update({ department: state.context.area }).eq('id', user.id);

    // 2) insertar medición
    const payload = {
      user_id_uuid: user.id,
      face_emotion: state.face.emotion || 'neutral',
      noise_db: state.noise.avg || 0,
      body_scan_avg: +(bodyAvg/10).toFixed(1), // escala 1-10
      combined_score: ix,
      journal_entry: ($('#journal-input')?.value || '').slice(0, 1000)
    };
    await db.from('measurements').insert(payload);
  }catch(err){
    console.error('[supabase insert]', err);
  }
}

function buildReco(face, noise, body){
  const min = Math.min(face, noise, body);
  if (min===noise) return 'Busca 10 minutos en un espacio más silencioso o usa audífonos con reducción de ruido.';
  if (min===body)  return 'Realiza dos pausas breves de estiramiento para cuello y hombros.';
  return 'Tómate 2 minutos de respiración 4-4-4-4 antes de tu próxima tarea.';
}

function emotionToScore(e){
  switch(e){
    case 'happy': return 85;
    case 'neutral': return 65;
    case 'surprised': return 70;
    case 'sad': return 40;
    case 'angry': return 35;
    case 'fearful': return 45;
    case 'disgusted': return 50;
    default: return 60;
  }
}
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
