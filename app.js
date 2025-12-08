/*************** SUPABASE  *****************/
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";
let db = null;


// 🌐 Backend de Lia (IA)
// Si estás en localhost, apunta a tu backend local; si no, a Render
const API_BASE_URL =
  window.location.hostname.includes("localhost")
    ? "http://localhost:3000"
    : "https://lia-backend-idhc.onrender.com";
 

const LIA_BACKEND_URL = `${API_BASE_URL}/api/lia-chat`;
const LIA_EMPLOYER_URL = `${API_BASE_URL}/api/employer-assistant`;
// 👆 backend Lia (trabajador y empleador)

// Helper para obtener el ID del trabajador que se guarda al loguearse
function getCurrentWorkerId() {
  // Intenta obtener del localStorage primero
  let id = localStorage.getItem("worker_id_uuid") || localStorage.getItem("supabase_user_id");
  
  // Si no está en localStorage, obtiene del state.user (sesión actual)
  if (!id && state.user && state.user.id) {
    id = state.user.id;
    // Opcionalmente, guarda en localStorage para futuras referencias
    localStorage.setItem("supabase_user_id", id);
  }
  
  if (!id) {
    console.warn("[getCurrentWorkerId] ⚠️ No se pudo obtener UUID del usuario");
  } else {
    console.log("[getCurrentWorkerId] ✅ UUID obtenido:", id);
  }
  
  return id || null;
}

// Helper para obtener el equipo/departamento del usuario (si es empleador)
function getCurrentTeamName() {
  return state.context?.area || null;
}

// Helper para detectar si es Admin (sin departamento pero ID específico)
function isCurrentUserAdmin() {
  // Admin es el usuario con ID 05ae5151-8e39-4861-82bc-478c131e326e
  return state.user?.id === '05ae5151-8e39-4861-82bc-478c131e326e';
}

// Helper para detectar si el usuario actual es un empleador (tiene un equipo/departamento asignado)
function isCurrentUserEmployer() {
  return getCurrentTeamName() !== null || isCurrentUserAdmin();
}

// Helper para obtener el equipo seleccionado (para Admin, desde un selector)
function getSelectedTeamForAdmin() {
  if (!isCurrentUserAdmin()) return null;
  const selector = document.getElementById('admin-team-selector');
  if (selector) {
    return selector.value || null;
  }
  return localStorage.getItem('admin_selected_team');
}


/*************** STATE  *****************/
const state = {
  user: null,
  context: { area: null },
  face: { emotion: null, confidence: 0 },
  noise: { samples: [], avg: 0, label: "" },
  body: { head: 0, upper: 0, lower: 0, pains: { head:[], upper:[], lower:[] } },
  contextSurvey: { hours: null, workload: 5, pace: 5, stress: 5 },
  journal: ''
};


/*************** UTILS  *****************/
const $ = s => document.querySelector(s);
const show = id => { document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active')); $('#'+id)?.classList.add('active'); };
const setAuthMessage = (t,err=false)=>{ const el=$('#auth-message'); if(!el) return; el.textContent=t||''; el.style.color=err?'var(--danger)':'var(--text-light)'; };
const capitalize = s => s? s[0].toUpperCase()+s.slice(1) : s;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const emailFromUser = u => `${(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@example.com`;

/*************** FACE-API  *****************/
const MODEL_URL='./models';
let faceModelsReady=false, cameraStream=null;
const EMOJI_GIF={
  happy:'./images/mascots/happy.png',
  neutral:'./images/mascots/neutral.png',
  sad:'./images/mascots/sad.png',
  angry:'./images/mascots/angry.png',
  disgusted:'./images/mascots/disgust.png',
  fearful:'./images/mascots/fear.png',
  surprised:'./images/mascots/surprised.png'
};

/*************** BOOT *****************/
document.addEventListener('DOMContentLoaded', async () => {
  try {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    db.auth.onAuthStateChange((_e, session) => session?.user ? onSignedIn(session.user) : onSignedOut());
  } catch (err) {
    console.error('Error inicializando Supabase:', err);
    return;
  }

  const initComponents = [
    { name: 'Intro', func: initIntro },
    { name: 'Tabs & Terms', func: initTabsTerms },
    { name: 'Auth Forms', func: initAuthForms },
    { name: 'Navigation', func: initNav },
    { name: 'Area', func: initArea },
    { name: 'Face', func: initFace },
    { name: 'Mic Prep', func: initMicPrep },
    { name: 'Noise', func: initNoise },
    { name: 'Indicators Modal', func: initIndicatorsModal },
    { name: 'Body Scan', func: initBodyScan },
    { name: 'Context Survey', func: initContextSurvey },
    { name: 'General Modals', func: initModals }
  ];

  initComponents.forEach(component => {
    try {
      component.func();
    } catch (err) {
      console.error(`Error inicializando el componente ${component.name}:`, err);
    }
  });

  const { data:{ session } } = await db.auth.getSession();
  session?.user ? onSignedIn(session.user) : show('screenIntro');
});


/*************** SESSION  *****************/
async function onSignedIn(user){
  state.user=user;
  
  // Guardar el UUID del usuario en localStorage para enviarlo al chat
  if (user?.id) {
    localStorage.setItem("supabase_user_id", user.id);
    console.log("[AUTH] ✅ Usuario logueado con UUID:", user.id);
    console.log("[AUTH] Email/Username:", user.email || user.user_metadata?.username);
  }
  
  const name=(user?.user_metadata?.username)||(user?.email?.split('@')[0])||'Usuario';
  const welcomeUser = $('#welcome-user');
  if (welcomeUser) {
    welcomeUser.textContent = `¡Hola, ${capitalize(name)}!`;
  }
  
  // Mostrar selector de equipos si es Admin
  const adminSelectorContainer = document.getElementById('admin-team-selector-container');
  if (adminSelectorContainer) {
    if (isCurrentUserAdmin()) {
      adminSelectorContainer.style.display = 'block';
      console.log("[AUTH] ✅ Admin detectado - mostrando selector de equipos");
    } else {
      adminSelectorContainer.style.display = 'none';
    }
  }
  
  show('screenHome');
}
function onSignedOut(){ state.user=null; show('screenIntro'); }

/*************** INTRO + AUTH *****************/
function initIntro(){
  const slidesContainer = $('#introSlides');
  const dots = $('#introDots');
  const prev = $('#introPrev');
  const next = $('#introNext');
  const start = $('#introStart');

  // Si por alguna razón falta algo, no hacemos nada
  if (!slidesContainer || !prev || !next || !start || !dots) return;

  // Todas las slides del carrusel
  const slides = Array.from(slidesContainer.querySelectorAll('.slide'));
  const n = slides.length;
  let i = 0;

  const render = () => {
    // Mostrar SOLO la slide actual, ocultar el resto
    slides.forEach((slide, idx) => {
      slide.style.display = idx === i ? 'flex' : 'none';
    });

    // Actualizar los puntitos
    dots.innerHTML = '';
    for (let k = 0; k < n; k++) {
      const d = document.createElement('div');
      d.className = 'dot' + (k === i ? ' active' : '');
      dots.appendChild(d);
    }

    // Botones
    prev.disabled = i === 0;
    next.style.display = i < n - 1 ? 'inline-block' : 'none';
    start.style.display = i === n - 1 ? 'inline-block' : 'none';
  };

  prev.onclick = () => {
    if (i > 0) {
      i--;
      render();
    }
  };

  next.onclick = () => {
    if (i < n - 1) {
      i++;
      render();
    }
  };

  start.onclick = () => show('screenAuth');

  // Estado inicial
  render();
}



function initTabsTerms(){
  $('#authTabLogin')?.addEventListener('click',()=>toggleAuth('login'));
  $('#authTabSignup')?.addEventListener('click',()=>toggleAuth('signup'));
}

function toggleAuth(which){
  const L=$('#formLogin'), S=$('#formSignup'), tL=$('#authTabLogin'), tS=$('#authTabSignup');
  if(which==='login'){ L.style.display='block'; S.style.display='none'; tL.classList.add('active'); tS.classList.remove('active');}
  else{ L.style.display='none'; S.style.display='block'; tS.classList.add('active'); tL.classList.remove('active');}
  setAuthMessage('');
}

function initAuthForms(){
  const formLogin = $('#formLogin');
  const formSignup = $('#formSignup');
  const signupButton = $('#btnSignup');
  const termsCheckbox = $('#su_terms');

  if (termsCheckbox && signupButton) {
      termsCheckbox.addEventListener('change', () => {
          signupButton.disabled = !termsCheckbox.checked;
      });
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const u = $('#login_user').value.trim();
        const p = $('#login_pass').value;
        if (!u || !p) return setAuthMessage('Completa los campos.', true);

        setAuthMessage('Iniciando sesión...');
        const { error } = await db.auth.signInWithPassword({ email: emailFromUser(u), password: p });
        if (error) throw error;
      } catch (error) {
        console.error("Error en Login:", error);
        setAuthMessage(error.message, true);
      }
    });
  }

  if (formSignup) {
    formSignup.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const u = $('#su_user').value.trim();
        const p = $('#su_pass').value;
        const ok = $('#su_terms').checked;
        if (!u || !p) return setAuthMessage('Completa los campos.', true);
        if (!ok) return setAuthMessage('Debes aceptar los términos.', true);

        setAuthMessage('Creando cuenta...');
        const { error } = await db.auth.signUp({ 
            email: emailFromUser(u), 
            password: p, 
            options: { data: { username: u } } 
        });
        if (error) throw error;
      } catch (error) {
        console.error("Error en Signup:", error);
        setAuthMessage(error.message, true);
      }
    });
  }
}

/*************** MODALES *****************/
function initModals() {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('open-modal-link')) {
            e.preventDefault();
            const modalId = e.target.dataset.modalId;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('hidden');
            }
        }
    });

    modalContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal')) {
            e.target.closest('.modal').classList.add('hidden');
        }
    });
}

/*************** NAV *****************/
function initNav(){
  $('#btnHomeStart')?.addEventListener('click',()=>show('screenArea'));
  $('#btnSignOut')?.addEventListener('click',async()=>{ await db.auth.signOut(); onSignedOut(); });
  $('#btnAreaNext')?.addEventListener('click',()=>show('screenFace'));
  $('#btnFaceSkip')?.addEventListener('click',()=>{ stopCamera(); show('screenAudioPrep'); });
  $('#btnFaceNext')?.addEventListener('click',()=>{ stopCamera(); show('screenAudioPrep'); });
  $('#btnGoToMeasure')?.addEventListener('click',()=>show('screenMeasure'));
  $('#btnMeasureNext')?.addEventListener('click',()=>show('screenBodyScan'));
  $('#btnBodyScanNext')?.addEventListener('click',()=>show('screenContext'));
  $('#btnContextNext')?.addEventListener('click',()=>show('screenJournal'));
  $('#btnJournalNext')?.addEventListener('click',()=>finalizeAndReport());
  $('#btnIntegrationHome')?.addEventListener('click',()=>show('screenHome'));
}

/*************** ÁREA  *****************/
function initArea(){
  const grid = $('#areaGrid'), out = $('#areaSelected'), next = $('#btnAreaNext');
  if(!grid) return;
  grid.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.area-pill'); if(!btn) return;
    grid.querySelectorAll('.area-pill').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.context.area = btn.dataset.area;
    out.textContent = `Área seleccionada: ${state.context.area}`;
    next.disabled = false;
    try{
      const { data: { user } } = await db.auth.getUser();
      if (user?.id && state.context.area) await db.from('profiles').update({ department: state.context.area }).eq('id', user.id);
    }catch(err){ console.warn('[profiles update]', err); }
  });
}

/*************** CÁMARA / FACE *****************/
async function ensureFaceModels(statusElement){
  if(faceModelsReady) return true;
  try {
    statusElement.textContent = 'Cargando modelos de IA...';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);
    faceModelsReady = true;
    statusElement.textContent = 'Modelos listos. Puedes activar la cámara.';
    return true;
  } catch (err) {
    console.error('ERROR AL CARGAR MODELOS DE IA:', err);
    statusElement.textContent = 'Error al cargar los modelos de IA. Verifica que la carpeta "models" exista.';
    faceModelsReady = false;
    return false;
  }
}

function initFace(){
  const video=$('#faceVideo'), canvas=$('#faceCanvas');
  const btnStart=$('#btnFaceStart'), btnSnap=$('#btnFaceSnap'), status=$('#faceStatus');
  if(!video || !btnStart || !btnSnap || !status) return;

  video.setAttribute('playsinline', ''); video.muted=true; video.autoplay=true;
  
  ensureFaceModels(status).then(loaded => {
    btnStart.disabled = !loaded;
  });

  btnStart.addEventListener('click', async () => {
    if (!faceModelsReady) return;
    btnStart.disabled = true;
    status.textContent = 'Solicitando permiso de cámara...';
    try {
        const constraints = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream = stream;
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            video.play();
            btnSnap.disabled = false;
            status.textContent = 'Cámara lista ✅. Centra tu rostro y analiza.';
        };
    } catch (err) {
        if(err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            status.textContent = 'Permiso de cámara denegado. Revísalo en los ajustes de tu navegador.';
        } else {
            status.textContent = 'No se pudo activar la cámara. Inténtalo de nuevo.';
        }
        btnStart.disabled = false;
    }
  });

  btnSnap.addEventListener('click', async () => {
    if(!video?.srcObject || !cameraStream) return;
    btnSnap.disabled = true;
    status.textContent = 'Analizando rostro…';
    try {
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
      if (!detections.length) {
        status.textContent = 'No se detectó rostro. Busca mejor luz y céntrate 🙂';
        $('#btnFaceNext').disabled = false;
        state.face = { emotion: null, confidence: 0 };
        btnSnap.disabled = false;
        return;
      }
      const expr = detections[0].expressions.asSortedArray()[0];
      const emotion = expr.expression;
      const conf = +(expr.probability * 100).toFixed(1);

      console.log('[FACE] Emoción detectada:', emotion, 'Confianza:', conf + '%');
      console.log('[FACE] GIF mapeado:', EMOJI_GIF[emotion] || EMOJI_GIF.neutral);

      $('#faceEmotion').textContent = capitalize(emotion);
      const img = $('#faceMascot');
      const gifPath = EMOJI_GIF[emotion] || EMOJI_GIF.neutral;
      img.src = gifPath;
      img.alt = `Emoción: ${emotion}`;
      img.onerror = () => {
        console.error('[FACE] Error cargando GIF:', gifPath);
        img.src = EMOJI_GIF.neutral;
      };
      $('#faceTip').textContent = tipForEmotion(emotion, conf);
      $('#face-results-content').classList.remove('hidden');
      $('#btnFaceNext').disabled = false;
      status.textContent = 'Análisis completado ✅';
      state.face = { emotion, confidence: conf };
    } catch (err) {
      status.textContent = 'Error al analizar rostro. Intenta nuevamente.';
      btnSnap.disabled = false;
    }
  });
}

function stopCamera(){
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    if ($('#faceVideo')) $('#faceVideo').srcObject = null;
  }
}

function tipForEmotion(e,c){
  const conf=c?` (${c}%)`:'';
  switch(e){
    case 'happy':return`Se nota buena energía${conf} 😄. ¡Genial!`;
    case 'neutral':return`Un estado de calma es un buen punto de partida${conf}.`;
    case 'sad':return`Ánimo${conf} 💛. Una pausa puede ayudar.`;
    case 'angry':return`Momento de bajar revoluciones${conf}. Respira profundo.`;
    case 'disgusted':return`Algo te molesta${conf}. Identifica qué es y busca una solución.`;
    case 'fearful':return`La preocupación es normal${conf}. Enfócate en lo que sí puedes controlar.`;
    case 'surprised':return`¡Una sorpresa${conf}! Mantén la calma y observa.`;
    default:return`Respira profundo por 60 segundos y vuelve a enfocarte.`;
  }
}

function initMicPrep(){
    let micTested = false;
    const btn = $('#btnTestMic'), res = $('#audio-permission-result'), next = $('#btnGoToMeasure');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(track => track.stop());
            micTested = true;
            res.textContent = 'Micrófono OK. Permiso otorgado ✅';
            res.style.color = 'var(--success)';
            next.disabled = false;
        } catch (err) {
            res.textContent = 'No se pudo acceder al micrófono. Revisa permisos.';
            res.style.color = 'var(--danger)';
            next.disabled = true;
        }
    });
}

function initNoise(){
  const btn=$('#toggleBtn'), dbValue=$('#dbValue'), dbLabel=$('#dbLabel'), countdown=$('#countdown'), status=$('#status');
  const resultsCard=$('#noise-results-card'), finalDb=$('#final-db-result'), finalLabel=$('#final-db-label'), next=$('#btnMeasureNext');
  const canvas = $('#gaugeChart');
  if(!btn || !canvas) return;

  const gctx=canvas.getContext('2d');
  let gaugeChart=new Chart(gctx,{ type:'doughnut', data:{labels:['valor','resto'],datasets:[{data:[0,100],borderWidth:0,cutout:'80%',backgroundColor:['#A7AD9A','#eee']}]}, options:{responsive:true,maintainAspectRatio:false,rotation:-90,circumference:180,plugins:{legend:{display:false},tooltip:{enabled:false}}}});
  const setGauge=v=>{ const pct=clamp(v,0,100); const color=pct<45?'#8DB596':pct<65?'#A7AD9A':pct<80?'#f6ad55':'#e53e3e'; gaugeChart.data.datasets[0].data=[pct,100-pct]; gaugeChart.data.datasets[0].backgroundColor=[color,'#eee']; gaugeChart.update('none'); };
  const classify=db=> db<45?'muy tranquilo': db<60?'tranquilo': db<75?'ruido moderado':'alto';
  
  let audioCtx, analyser, micStream, raf;
  let smoothedDb = 0.0; 
  let started = false;

  const stopMeasure = (values = []) => {
    cancelAnimationFrame(raf);
    micStream?.getTracks().forEach(t => t.stop());
    if (audioCtx?.state !== 'closed') audioCtx?.close();
    btn.textContent = '🎙️ Iniciar 5s';
    btn.disabled = false;
    started = false;

    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const avgDb = Math.round(avg);
    const label = classify(avg);

    if(finalDb) finalDb.textContent=`${avgDb} dB`; 
    if(finalLabel) finalLabel.textContent=label;
    resultsCard?.classList.remove('hidden'); 
    if(status) status.textContent='Medición finalizada.'; 
    if(next) next.disabled=false;
    state.noise={samples:values.slice(),avg:avgDb,label};

    document.querySelectorAll('.ref-card').forEach(card => card.classList.remove('active'));
    if (avgDb < 45) $('#ref-saludable')?.classList.add('active');
    else if (avgDb < 65) $('#ref-oficina')?.classList.add('active');
    else if (avgDb < 80) $('#ref-ruidoso')?.classList.add('active');
    else $('#ref-muyruidoso')?.classList.add('active');
  };

  async function startMeasure(){
    let micTested = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(t=>t.stop());
    } catch(e) {
        micTested = false;
    }

    if(!micTested){ alert('Primero debes permitir el acceso al micrófono en la pantalla anterior.'); return; }
    if(started) return;

    started=true; 
    const values = [];
    smoothedDb = 0.0;
    status.textContent='Midiendo…'; 
    btn.textContent='⏹️ Detener'; 
    btn.disabled=true;

    try {
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const src=audioCtx.createMediaStreamSource(micStream);
      analyser=audioCtx.createAnalyser(); 
      analyser.fftSize=2048; 
      src.connect(analyser);

      let startTime = null;
      const tick=(timestamp)=>{
        if (!startTime) startTime = timestamp;
        const elapsedTime = timestamp - startTime;
        let remaining = 5 - (elapsedTime / 1000);
        remaining = Math.max(0, remaining);
        countdown.textContent=`${remaining.toFixed(1)} s`;

        const data=new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
        const rms=Math.sqrt(sum/data.length);
        const instantDb=Math.max(20*Math.log10(rms)+90,0);

        values.push(instantDb);

        smoothedDb = 0.1 * instantDb + 0.9 * smoothedDb;

        dbValue.textContent=Math.round(smoothedDb);
        dbLabel.textContent=classify(smoothedDb);
        setGauge(smoothedDb);
        
        if(remaining > 0){ 
            raf=requestAnimationFrame(tick);
        } else { 
            stopMeasure(values);
        }
      };
      raf=requestAnimationFrame(tick);
    } catch (err) {
      status.textContent = 'Error al acceder al micrófono.';
      stopMeasure();
    }
  }
  
  btn?.addEventListener('click',()=>startMeasure());
}

function initIndicatorsModal(){
  const tips={
    saludable:{title:'Ambiente Saludable (< 45 dB)',img:'./images/ind-saludable.png',body:'Tu ambiente es silencioso, similar a una biblioteca. Esto es ideal para tareas que requieren alta concentración y pensamiento profundo. Aprovéchalo para avanzar en tus proyectos más complejos.'},
    oficina:{title:'Oficina Activa (45-65 dB)',img:'./images/ind-conversacion.png',body:'Este es el nivel de una conversación normal. Es un ambiente sano para la colaboración y el trabajo en equipo. Si necesitas concentrarte, unos auriculares con música suave pueden ser suficientes.'},
    ruidoso:{title:'Ambiente Ruidoso (65-80 dB)',img:'./images/ind-ruido.png',body:'El ruido equivale a conversaciones fuertes o varias llamadas a la vez. Puede interrumpir la concentración y generar estrés. Considera usar zonas de silencio o cabinas para tareas importantes.'},
    muyruidoso:{title:'Ambiente Muy Ruidoso (> 80 dB)',img:'./images/ind-silencio.png',body:'Este nivel de ruido es agotador y puede causar fatiga cognitiva. Es importante tomar pausas en lugares más tranquilos para recuperarte y proteger tu bienestar auditivo y mental.'}
  };
  const modalContainer = document.getElementById('modal-container');
  const noiseModal = document.createElement('div');
  noiseModal.className = 'modal hidden';
  noiseModal.id = 'modal-noise-indicator';
  noiseModal.innerHTML = `
    <div class="modal-card text-left">
      <button class="modal-close">✕</button>
      <img id="modalImg" class="modal-img" alt="">
      <h3 id="modalTitle"></h3>
      <p id="modalBody"></p>
    </div>`;
  if (modalContainer) modalContainer.appendChild(noiseModal);

  const mImg=noiseModal.querySelector('#modalImg'), mTitle=noiseModal.querySelector('#modalTitle'), mBody=noiseModal.querySelector('#modalBody');
  
  $('#refCarousel')?.addEventListener('click',e=>{
    const card=e.target.closest('.ref-card'); if(!card) return;
    const k=card.dataset.key, t=tips[k]; if(!t) return;
    mImg.src=t.img; mImg.alt=t.title; mTitle.textContent=t.title; mBody.textContent=t.body;
    noiseModal.classList.remove('hidden');
  });
}

function getBodyScanMessages(head, upper, lower, pains) {
    const avg = (head + upper + lower) / 3;
    let feeling = '';
    let advice = '';

    if (avg <= 2) {
        feeling = 'Te sientes genial, tu cuerpo está relajado y listo. 💪';
    } else if (avg <= 6) {
        feeling = 'Se nota algo de tensión. Es un buen momento para una pequeña pausa. 🧘';
    } else {
        feeling = 'Tu cuerpo te pide un respiro. Escúchalo y tómate un momento para estirar. 🌬️';
    }

    const specificPains = [...pains.head, ...pains.upper, ...pains.lower];
    if (specificPains.includes('Dolor lumbar')) {
        advice = '💡 Consejo: Para la espalda, revisa tu postura al sentarte.';
    } else if (specificPains.includes('Bruxismo / mandíbula')) {
        advice = '💡 Consejo: Relaja la mandíbula y evita apretar los dientes.';
    } else if (specificPains.includes('Tensión de hombros')) {
        advice = '💡 Consejo: Mueve tus hombros en círculos suaves para liberar tensión.';
    } else if (specificPains.includes('Dolor de pies')) {
        advice = '💡 Consejo: Si puedes, descálzate un momento y estira los pies.';
    } else if (specificPains.length > 0) {
        advice = '💡 Consejo: Una pausa activa de 2 minutos puede aliviar esas molestias.';
    }

    return { feeling, advice };
}

function initBodyScan(){
  const sliders = { head: $('#bs_head'), upper: $('#bs_upper'), lower: $('#bs_lower') };
  const values = { head: $('#valHead'), upper: $('#valUpper'), lower: $('#valLower') };
  const feelingEl = $('#bs_feeling');
  const adviceEl = $('#bs_advice');
  if(!sliders.head || !feelingEl || !adviceEl) return;

  const update = () => {
    state.body.head = +sliders.head.value;
    state.body.upper = +sliders.upper.value;
    state.body.lower = +sliders.lower.value;
    
    values.head.textContent = `${state.body.head}/10`;
    values.upper.textContent = `${state.body.upper}/10`;
    values.lower.textContent = `${state.body.lower}/10`;

    state.body.pains.head = [...document.querySelectorAll('.pain-head:checked')].map(x => x.value);
    state.body.pains.upper = [...document.querySelectorAll('.pain-upper:checked')].map(x => x.value);
    state.body.pains.lower = [...document.querySelectorAll('.pain-lower:checked')].map(x => x.value);

    const messages = getBodyScanMessages(state.body.head, state.body.upper, state.body.lower, state.body.pains);
    feelingEl.textContent = messages.feeling;
    adviceEl.textContent = messages.advice;
  };

  Object.values(sliders).forEach(el => el?.addEventListener('input', update));
  document.querySelectorAll('.pain-head,.pain-upper,.pain-lower').forEach(el => el.addEventListener('change', update));
  update();
}

function initContextSurvey() {
    const dtInput = $('#ctx_datetime');
    const hoursInput = $('#ctx_hours');
    const sliders = { workload: $('#ctx_workload'), pace: $('#ctx_pace'), stress: $('#ctx_stress') };
    const values = { workload: $('#valWorkload'), pace: $('#valPace'), stress: $('#valStress') };
    if(!dtInput) return;

    const now = new Date();
    dtInput.value = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    hoursInput?.addEventListener('input', () => {
        state.contextSurvey.hours = +hoursInput.value || null;
    });

    for (const key in sliders) {
        if(sliders[key]) {
            sliders[key].addEventListener('input', () => {
                const value = +sliders[key].value;
                state.contextSurvey[key] = value;
                values[key].textContent = `${value}/10`;
            });
        }
    }
}

async function finalizeAndReport(){
  const journalText = document.getElementById('journal-input') ? document.getElementById('journal-input').value.slice(0, 1000) : "";

  const faceScore = state.face.emotion ? emotionToScore(state.face.emotion) : 60;
  const noiseScore = 100 - clamp(state.noise.avg, 0, 100);
  const bodyAvg10 = (state.body.head + state.body.upper + state.body.lower)/3;
  const bodyScore = 100 - (bodyAvg10 * 10);
  const ix = Math.round(0.25 * faceScore + 0.35 * noiseScore + 0.40 * bodyScore);

  $('#ix_score_circle').textContent = ix;
  $('#ix_score_circle').style.background = ix>=67?'#48bb78':ix>=34?'#f6ad55':'#e53e3e';
  $('#ix_label').textContent = ix>=67 ? 'En verde' : ix>=34 ? 'Atento' : 'Revisa tu día';
  
  $('#ix_face_progress').style.width=`${faceScore}%`;
  $('#ix_face_progress').style.background='#8DB596';
  $('#ix_db_progress').style.width=`${noiseScore}%`;
  $('#ix_db_progress').style.background='#A7AD9A';
  $('#ix_bs_progress').style.width=`${bodyScore}%`;
  $('#ix_bs_progress').style.background='#70755D';
  
  $('#ix_reco').textContent = buildReco(state);
  $('#ix_meaning').textContent = buildMeaning(ix);

  try{
    const { data: { user } } = await db.auth.getUser();
    if(user?.id){
      const measurementData = {
        user_id_uuid: user.id,
        face_emotion: state.face.emotion || 'skipped',
        noise_db: state.noise.avg || 0,
        body_scan_avg: +(bodyAvg10.toFixed(1)),
        combined_score: ix,
        journal_entry: journalText || null,
        work_hours: state.contextSurvey.hours,
        workload_level: state.contextSurvey.workload,
        work_pace_level: state.contextSurvey.pace,
        stress_level: state.contextSurvey.stress
      };
      
      const { error } = await db.from('measurements').insert([measurementData]);
      if (error) throw error;
    }
  } catch(err) {
    console.error('Error de Supabase al insertar:', err);
  }

  show('screenIntegration');
}

function buildMeaning(ix){
  if(ix>=67) return '“En verde”: tu día luce equilibrado.';
  if(ix>=34) return '“Atento”: hay señales de cansancio.';
  return '“Revisa tu día”: tu cuerpo/entorno piden descanso.';
}
function buildReco(st){
  const journalText = document.getElementById('journal-input') ? document.getElementById('journal-input').value : "";
  const parts=[];
  if(['sad','angry','fearful'].includes(st.face.emotion)) parts.push('Respira 2-3 min.');
  const painsCount=st.body.pains.head.length+st.body.pains.upper.length+st.body.pains.lower.length;
  if(painsCount > 0 || (st.body.head + st.body.upper + st.body.lower)/3 > 3) parts.push('Estira cuello y espalda 2 min.');
  if(st.noise.avg > 65) parts.push('Busca una zona más silenciosa.');
  if(journalText.length > 10) parts.push('Gracias por compartir tus reflexiones.');
  if(parts.length===0) parts.push('Vas muy bien: mantén pausas breves y celebra tus avances.');
  return parts.join(' ');
}
function emotionToScore(e){
  switch(e){
    case 'happy': return 95;
    case 'neutral': return 75;
    case 'surprised': return 80;
    case 'sad': return 40;
    case 'angry': return 30;
    case 'fearful': return 45;
    case 'disgusted': return 50;
    default: return 60;
  }
}
// --- Asistente Lia flotante (con API) ---
(function initLiaAssistant() {
  const btnToggle = document.getElementById("lia-assistant-toggle");
  const panel = document.getElementById("lia-assistant-panel");
  const btnClose = panel ? panel.querySelector(".lia-assistant-close") : null;
  const form = document.getElementById("lia-assistant-form");
  const input = document.getElementById("lia-assistant-input");
  const messages = document.getElementById("lia-assistant-messages");

  if (!btnToggle || !panel || !form || !input || !messages) return;

  const togglePanel = (force) => {
    const shouldShow =
      typeof force === "boolean" ? force : panel.classList.contains("hidden");
    if (shouldShow) {
      panel.classList.remove("hidden");
      setTimeout(() => panel.classList.add("lia-open"), 10);
    } else {
      panel.classList.remove("lia-open");
      setTimeout(() => panel.classList.add("hidden"), 200);
    }
  };

  btnToggle.addEventListener("click", () => togglePanel());
  if (btnClose) {
    btnClose.addEventListener("click", () => togglePanel(false));
  }

  const appendMessage = (type, text) => {
    const wrapper = document.createElement("div");
    wrapper.className =
      "lia-message " +
      (type === "user" ? "lia-message-user" : "lia-message-bot");
    const bubble = document.createElement("div");
    bubble.className = "lia-message-bubble";
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  };

  // Historial que se envía al backend
  let conversation = [];

  // Mensaje de bienvenida sólo en la UI (no se manda al backend)
  appendMessage(
    "bot",
    "Hola, soy Lia 😊. ¿En qué puedo ayudarte hoy?"
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    appendMessage("user", value);
    input.value = "";

    // Guardamos el mensaje del usuario
    conversation.push({ role: "user", content: value });

    // Mensaje temporal de "pensando..."
    const thinkingEl = document.createElement("div");
    thinkingEl.className = "lia-message lia-message-bot";
    const bubble = document.createElement("div");
    bubble.className = "lia-message-bubble";
    bubble.textContent = "Estoy pensando cómo ayudarte… 💭";
    thinkingEl.appendChild(bubble);
    messages.appendChild(thinkingEl);
    messages.scrollTop = messages.scrollHeight;

    try {
      // Detectar si el usuario es empleador o trabajador
      const isEmployer = isCurrentUserEmployer();
      let url = LIA_BACKEND_URL;
      let body = { messages: conversation };

      // Obtener nombre del usuario para personalización
      const userName = (state.user?.user_metadata?.username) || 
                       (state.user?.email?.split('@')[0]) || 
                       'Usuario';

      if (isEmployer) {
        // Si es empleador, usar el endpoint de coach y enviar teamName
        url = LIA_EMPLOYER_URL;
        
        // Si es Admin, obtener el equipo del selector; si no, usar el departamento
        if (isCurrentUserAdmin()) {
          body.teamName = getSelectedTeamForAdmin();
          if (!body.teamName) {
            appendMessage("bot", "⚠️ Por favor selecciona un equipo antes de consultar.");
            messages.removeChild(thinkingEl);
            return;
          }
        } else {
          body.teamName = getCurrentTeamName();
        }
        
        body.managerName = userName; // Agregar nombre del empleador para personalización
        console.log("[CHAT] Enviando como EMPLEADOR:", { teamName: body.teamName, managerName: body.managerName, url });
      } else {
        // Si es trabajador, usar el endpoint normal y enviar workerId
        body.workerId = getCurrentWorkerId();
        body.userName = userName; // Agregar nombre para personalización
        console.log("[CHAT] Enviando como TRABAJADOR:", { workerId: body.workerId, userName, url });
      }

      console.log("[CHAT] Body final:", body);

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error("Error HTTP " + resp.status);
      }

      const data = await resp.json();

      // El backend ahora devuelve { reply: "texto..." }
      const replyText =
        typeof data.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : "Lo siento, hubo un problema al responder. Inténtalo más tarde.";

      // Quitamos el “pensando…”
      messages.removeChild(thinkingEl);

      appendMessage("bot", replyText);

      // Añadimos respuesta al historial
      conversation.push({
        role: "assistant",
        content: replyText,
      });
    } catch (err) {
      console.error("Error llamando a Lia backend:", err);
      messages.removeChild(thinkingEl);
      appendMessage(
        "bot",
        "Tuvimos un problema técnico para responder. Intenta de nuevo en unos minutos 🙏."
      );
    }
  });
})();

// ========================
// DEBUG HELPERS
// ========================
window.DEBUG_LIA = {
  checkUserData: () => {
    console.log("=== DEBUG USER DATA ===");
    console.log("Current User ID:", getCurrentWorkerId());
    console.log("Current Team Name:", getCurrentTeamName());
    console.log("Is Employer:", isCurrentUserEmployer());
    console.log("State User:", state.user);
    console.log("State Context:", state.context);
    console.log("LocalStorage supabase_user_id:", localStorage.getItem("supabase_user_id"));
  },
  clearLocalStorage: () => {
    localStorage.clear();
    console.log("✅ LocalStorage limpiado");
  }
};

console.log("💡 Usa window.DEBUG_LIA.checkUserData() en la consola para verificar datos de usuario");
console.log("💡 Usa window.DEBUG_LIA.clearLocalStorage() si necesitas resetear el localStorage");
