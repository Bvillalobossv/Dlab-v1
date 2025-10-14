// ========= SUPABASE =========
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";
let db = null;

// ========= STATE =========
const state = {
  user: null,
  face: { emotion: null, confidence: 0 },
  noise: { samples: [], avg: 0, label: '' },
  body: { head: 1, upper: 1, lower: 1 },
  context: { area: null, hours: 0, load: 5, pace: 5, stress: 5, datetime: null },
  journal: ''
};

// ========= UTILS =========
const $ = s => document.querySelector(s);
const showScreen = id => { document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active')); $('#'+id)?.classList.add('active'); };
const setAuthMessage = (t,err=false)=>{ const el=$('#auth-message'); if(el){ el.textContent=t||''; el.style.color=err?'var(--danger)':'var(--text-light)'; } };
const capitalize = s => s ? s[0].toUpperCase()+s.slice(1) : s;
const toEmailFromUser = u => `${(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@example.com`;

// ========= FACE-API =========
const MODEL_URL = './models';
let faceModelsReady = false;
let cameraStream = null;
const EMOJI_GIF = {
  happy: './images/mascots/happy.gif',
  neutral:'./images/mascots/neutral.gif',
  sad:'./images/mascots/sad.gif',
  angry:'./images/mascots/angry.gif',
  disgusted:'./images/mascots/disgust.gif',
  fearful:'./images/mascots/fear.gif',
  surprised:'./images/mascots/surprised.gif'
};

// ========= CHARTS =========
let gaugeChart = null;
let historyChart = null;

// ========= BOOT =========
document.addEventListener('DOMContentLoaded', async () => {
  // Supabase
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db.auth.onAuthStateChange((_e, session) => session?.user ? onSignedIn(session.user) : onSignedOut());
  const { data:{ session } } = await db.auth.getSession();
  session?.user ? onSignedIn(session.user) : showScreen('screenIntro');

  // UI/flujos
  initIntro();
  initTabsTerms();
  initAuthForms();
  initNav();
  initArea();
  initFace();
  initMicPrep();
  initNoise();
  initBodyScan();
  initContextForm();
  initIndicatorsModal();
});

// ========= SESSION =========
async function onSignedIn(user){
  state.user = user;
  const name = (user?.user_metadata?.username) || (user?.email?.split('@')[0]) || 'Usuario';
  $('#welcome-user').textContent = `¡Hola, ${capitalize(name)}!`;
  showScreen('screenHome');
}
function onSignedOut(){ state.user=null; showScreen('screenIntro'); }

// ========= INTRO/AUTH =========
function initIntro(){
  const slides=$('#introSlides'), dots=$('#introDots');
  const prev=$('#introPrev'), next=$('#introNext'), start=$('#introStart');
  if(!slides) return;
  const n=slides.children.length; let i=0;
  const render=()=>{ slides.style.transform=`translateX(${-i*100}%)`; dots.innerHTML=''; for(let k=0;k<n;k++){const d=document.createElement('div'); d.className='dot'+(k===i?' active':''); dots.appendChild(d);} prev.disabled=i===0; next.style.display=i<n-1?'inline-block':'none'; start.style.display=i===n-1?'inline-block':'none'; };
  prev.onclick=()=>{ if(i>0){i--;render();} }; next.onclick=()=>{ if(i<n-1){i++;render();} }; start.onclick=()=>showScreen('screenAuth'); render();
}
function initTabsTerms(){
  $('#authTabLogin')?.addEventListener('click',()=>{toggleAuth('login');});
  $('#authTabSignup')?.addEventListener('click',()=>{toggleAuth('signup');});
  $('#view-terms-link')?.addEventListener('click',e=>{e.preventDefault();showScreen('screenTerms');});
  $('#close-terms-button')?.addEventListener('click',()=>showScreen('screenAuth'));
}
function toggleAuth(which){
  const L=$('#formLogin'), S=$('#formSignup'), tL=$('#authTabLogin'), tS=$('#authTabSignup');
  if(which==='login'){ L.style.display='block'; S.style.display='none'; tL.classList.add('active'); tS.classList.remove('active');}
  else{ L.style.display='none'; S.style.display='block'; tS.classList.add('active'); tL.classList.remove('active');}
  setAuthMessage('');
}
function initAuthForms(){
  $('#formLogin')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const u=$('#login_user').value.trim(), p=$('#login_pass').value;
    if(!u||!p) return setAuthMessage('Completa los campos.',true);
    try{
      setAuthMessage('Iniciando sesión…');
      const {error}=await db.auth.signInWithPassword({email:toEmailFromUser(u),password:p});
      if(error) throw error;
      setAuthMessage('');
    }catch(err){ setAuthMessage(err?.message||'Error',true); }
  });
  $('#formSignup')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const u=$('#su_user').value.trim(), p=$('#su_pass').value, ok=$('#su_terms').checked;
    if(!u||!p) return setAuthMessage('Completa los campos.',true);
    if(!ok) return setAuthMessage('Debes aceptar los términos.',true);
    try{
      setAuthMessage('Creando cuenta…');
      const {error}=await db.auth.signUp({email:toEmailFromUser(u),password:p,options:{data:{username:u}}});
      if(error) throw error;
      await db.auth.signInWithPassword({email:toEmailFromUser(u),password:p});
      setAuthMessage('');
    }catch(err){ setAuthMessage(err?.message||'Error',true); }
  });
}
function initNav(){
  $('#btnHomeStart')?.addEventListener('click',()=>showScreen('screenArea'));
  $('#btnSignOut')?.addEventListener('click',async()=>{ await db.auth.signOut(); onSignedOut(); });

  $('#btnAreaNext')?.addEventListener('click',()=>showScreen('screenFace'));

  $('#btnFaceSkip')?.addEventListener('click',()=>{ $('#faceEmotion').textContent='—'; $('#faceConfidence').textContent='—'; $('#btnFaceNext').disabled=false; });
  $('#btnFaceNext')?.addEventListener('click',()=>{ stopCamera(); showScreen('screenAudioPrep'); });

  $('#btnGoToMeasure')?.addEventListener('click',()=>showScreen('screenMeasure'));
  $('#btnMeasureNext')?.addEventListener('click',()=>showScreen('screenBodyScan'));
  $('#btnBodyScanNext')?.addEventListener('click',()=>showScreen('screenContext'));
  $('#btnContextNext')?.addEventListener('click',()=>showScreen('screenJournal'));
  $('#btnJournalNext')?.addEventListener('click',()=>finalizeAndReport());
  $('#btnIntegrationHome')?.addEventListener('click',()=>showScreen('screenHome'));
}

// ========= ÁREA =========
function initArea(){
  const grid = $('#areaGrid'), out = $('#areaSelected'), next = $('#btnAreaNext');
  grid?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.area-pill'); if(!btn) return;
    grid.querySelectorAll('.area-pill').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.context.area = btn.dataset.area;
    out.textContent = `Área seleccionada: ${state.context.area}`;
    next.disabled = false;

    // si hay usuario, actualizamos de inmediato su perfil
    try{
      const u = (await db.auth.getUser())?.data?.user;
      if (u?.id && state.context.area) {
        await db.from('profiles').update({ department: state.context.area }).eq('id', u.id);
      }
    }catch(err){ console.warn('[profiles update pre]', err); }
  });
}

// ========= CÁMARA / FACE =========
function initFace(){
  const video = $('#faceVideo');
  const btnStart = $('#btnFaceStart');
  const btnSnap  = $('#btnFaceSnap');
  const canvas   = $('#faceCanvas');
  if (video) { video.setAttribute('playsinline',''); video.muted = true; video.autoplay = true; }

  btnStart?.addEventListener('click', async () => {
    try{
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        alert('Debes abrir por HTTPS para usar la cámara.'); return;
      }
      await ensureFaceModels();
      await startCamera(video);
      btnSnap.disabled = false;
      $('#faceHelp').textContent = 'Cámara activa. Ahora “Analizar mi expresión”.';
    }catch(err){
      console.error('[camera]', err);
      try{
        await startCamera(video, true);
        btnSnap.disabled = false;
      }catch(e){
        alert('No se pudo activar la cámara. Permite la cámara para este sitio.');
      }
    }
  });

  btnSnap?.addEventListener('click', async ()=>{
    if (!video?.srcObject) return alert('Activa primero la cámara.');
    try{
      await ensureFaceModels();

      // 1) intentar directo desde el <video>
      let det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: .5 }))
        .withFaceExpressions();

      // 2) si no detecta, tomar un frame a <canvas> y analizar el bitmap
      if (!det) {
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        det = await faceapi
          .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: .5 }))
          .withFaceExpressions();
      }

      if (!det) {
        $('#faceEmotion').textContent = 'No detectada';
        $('#faceConfidence').textContent = '—';
        $('#faceTip').textContent = 'Asegúrate de buena luz, rostro centrado y sin lentes oscuros.';
        $('#face-results-content').classList.remove('hidden');
        $('#btnFaceNext').disabled = false;
        state.face = { emotion:null, confidence:0 };
        return;
      }

      const expr = det.expressions.asSortedArray()[0];
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
async function startCamera(videoEl, fallback=false){
  const constraints = fallback
    ? { video:true, audio:false }
    : { video: { facingMode: { ideal:'user' }, width:{ideal:640}, height:{ideal:480} }, audio:false };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  cameraStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
}
function stopCamera(){ try{ cameraStream?.getTracks().forEach(t=>t.stop()); }catch{} }
function tipForEmotion(e){
  switch(e){
    case 'happy': return 'Se nota ánimo positivo. 3 respiraciones para mantener claridad.';
    case 'neutral': return 'Buen punto de partida. Define 1 tarea clave y arranca.';
    case 'sad': return 'Haz una micro-pausa con luz natural y movimiento suave.';
    case 'angry': return 'Respira 4-4-4-4 y afloja mandíbula y hombros.';
    case 'fearful': return 'Una cosa a la vez. Priorización rápida y avanza.';
    case 'disgusted': return 'Cambia de foco 2 minutos y vuelve con intención.';
    case 'surprised': return 'Canaliza esa energía: anota un objetivo rápido.';
    default: return 'Respira profundo por 60s y vuelve con foco.';
  }
}

// ========= MIC PREP =========
let micTested = false;
function initMicPrep(){
  const btn = $('#btnTestMic'), res=$('#audio-permission-result'), msg=$('#audio-permission-msg'), next=$('#btnGoToMeasure');
  btn?.addEventListener('click', async ()=>{
    try{
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      s.getTracks().forEach(t=>t.stop());
      micTested = true;
      res.textContent='Micrófono OK. Permiso otorgado.'; res.style.color='var(--success)';
      msg.textContent='Perfecto. Continúa a la medición.'; next.disabled=false;
    }catch(err){
      res.textContent='No se pudo acceder al micrófono. Revisa permisos.'; res.style.color='var(--danger)';
      next.disabled=true;
    }
  });
}

// ========= NOISE (5s promedio) =========
function initNoise(){
  const btn=$('#toggleBtn'), dbValue=$('#dbValue'), dbLabel=$('#dbLabel'), countdown=$('#countdown'), status=$('#status');
  const resultsCard=$('#noise-results-card'), finalDb=$('#final-db-result'), finalLabel=$('#final-db-label'), next=$('#btnMeasureNext');

  // Gauge semicircular
  const gctx = $('#gaugeChart').getContext('2d');
  gaugeChart = new Chart(gctx, {
    type: 'doughnut',
    data: { labels:['valor','resto'], datasets:[{ data:[0,100], borderWidth:0, cutout:'80%', backgroundColor:['#8DB596','#eee'] }]},
    options: { responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, plugins:{ legend:{display:false}, tooltip:{enabled:false} } }
  });
  const setGauge = (v)=>{ const pct = Math.max(0, Math.min(100, v)); const color = pct<45? '#8DB596' : pct<65? '#A7AD9A' : pct<80? '#f6ad55' : '#e53e3e'; gaugeChart.data.datasets[0].data=[pct,100-pct]; gaugeChart.data.datasets[0].backgroundColor=[color,'#eee']; gaugeChart.update('none'); };

  const hctx = $('#noiseHistory').getContext('2d');
  historyChart = new Chart(hctx, {
    type: 'line',
    data: { labels:[], datasets:[{ data:[], tension:.35, pointRadius:0 }]},
    options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ display:false }, y:{ beginAtZero:true, suggestedMax:90 } } }
  });

  let audioCtx, analyser, micStream, raf, values=[], started=false;

  const classify = db => {
    if (db < 45) return 'muy tranquilo';
    if (db < 60) return 'tranquilo';
    if (db < 75) return 'ruido moderado';
    return 'alto';
  };

  async function startMeasure(){
    if (!micTested) { alert('Primero prueba el micrófono.'); return; }
    if (started) return;
    started=true; values=[];
    status.textContent='Midiendo…'; btn.textContent='⏹️ Detener'; btn.disabled=true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser);

    let remaining=5.0;
    const tick=()=>{
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum=0; for (let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum += v*v; }
      const rms = Math.sqrt(sum/data.length);
      const dB = Math.max(20*Math.log10(rms)+90, 0);
      values.push(dB);

      dbValue.textContent = Math.round(dB);
      dbLabel.textContent = classify(dB);
      setGauge(Math.min(Math.max(dB,0),100));

      remaining = Math.max(0, remaining - 0.05);
      countdown.textContent = `${remaining.toFixed(1)} s`;
      if (remaining>0){ raf=requestAnimationFrame(tick); } else { stopMeasure(); }
    };
    raf=requestAnimationFrame(tick);
  }

  function stopMeasure(){
    cancelAnimationFrame(raf);
    micStream?.getTracks().forEach(t=>t.stop());
    audioCtx?.close(); btn.textContent='🎙️ Iniciar 5s'; btn.disabled=false; started=false;

    const avg = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0; // PROMEDIO REAL
    const label = classify(avg);
    finalDb.textContent = `${Math.round(avg)} dB`;
    finalLabel.textContent = label;
    resultsCard.classList.remove('hidden');
    status.textContent='Medición finalizada.';
    next.disabled=false;

    const xs = values.map((_,i)=>i);
    historyChart.data.labels = xs;
    historyChart.data.datasets[0].data = values.map(v=>Math.round(v));
    historyChart.update();

    state.noise = { samples: values.slice(), avg: Math.round(avg), label };
  }

  btn?.addEventListener('click', ()=> startMeasure());
}

// ========= INDICADORES (MODAL) =========
function initIndicatorsModal(){
  const tips = {
    saludable: {
      title: 'Ambiente saludable',
      img: './images/ind-saludable.png',
      body: 'Menos de 45 dB. Excelente para foco profundo y tareas analíticas. Mantén “franjas de silencio” y avisa al equipo cuando necesites concentración.'
    },
    oficina: {
      title: 'Oficina activa',
      img: './images/ind-conversacion.png',
      body: 'Entre 45–65 dB. Conversación breve y coordinación. Adecúa zonas: colaboración vs. foco. Usa música suave o auriculares si debes concentrarte.'
    },
    ruidoso: {
      title: 'Ruidoso',
      img: './images/ind-ruido.png',
      body: 'Entre 65–80 dB. Conversaciones cruzadas, llamadas simultáneas. Sugiere cabinas o espacios silenciosos; limita tiempo de exposición y usa cancelación de ruido.'
    },
    muyruidoso: {
      title: 'Muy ruidoso',
      img: './images/ind-silencio.png',
      body: 'Más de 80 dB. Riesgo de fatiga y errores. Muévete a un lugar más silencioso; agenda tareas de foco lejos de estos picos; pausa breve para relajar cuello/hombros.'
    }
  };
  const modal=$('#modal'), mImg=$('#modalImg'), mTitle=$('#modalTitle'), mBody=$('#modalBody'), mClose=$('#modalClose');
  $('#refCarousel')?.addEventListener('click', e=>{
    const card = e.target.closest('.ref-card'); if(!card) return;
    const k = card.dataset.key; const t = tips[k]; if(!t) return;
    mImg.src=t.img; mImg.alt=t.title; mTitle.textContent=t.title; mBody.textContent=t.body;
    modal.classList.remove('hidden');
  });
  mClose?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal?.addEventListener('click',e=>{ if(e.target===modal) modal.classList.add('hidden'); });
}

// ========= BODY SCAN =========
function initBodyScan(){
  const head=$('#bs_head'), upper=$('#bs_upper'), lower=$('#bs_lower'), tip=$('#bs_tip');
  const updateTip=()=>{
    const avg=(+head.value + +upper.value + +lower.value)/3;
    tip.textContent = avg<=3 ? 'Vas bien. Mantén micro-pausas cada 50 min.' :
                    avg<=6 ? 'Toma 2 minutos para estirar cuello y espalda.' :
                             'Haz 3 respiraciones profundas y camina 1 minuto.';
    state.body = { head:+head.value, upper:+upper.value, lower:+lower.value };
  };
  [head,upper,lower].forEach(el=>el?.addEventListener('input',updateTip));
  updateTip();
}

// ========= CONTEXTO =========
function initContextForm(){
  const dt=$('#ctx_datetime');
  if (dt) { const now=new Date(); dt.value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  $('#ctx_area')?.addEventListener('change',e=> state.context.area = e.target.value);
  $('#ctx_hours')?.addEventListener('input',e=> state.context.hours = +e.target.value||0);
  $('#ctx_load')?.addEventListener('input',e=> state.context.load = +e.target.value||5);
  $('#ctx_pace')?.addEventListener('input',e=> state.context.pace = +e.target.value||5);
  $('#ctx_stress')?.addEventListener('input',e=> state.context.stress = +e.target.value||5);
  $('#ctx_datetime')?.addEventListener('change',e=> state.context.datetime = e.target.value);
}

// ========= REPORTE + PERSISTENCIA =========
async function finalizeAndReport(){
  state.journal = ($('#journal-input')?.value || '').slice(0,1000);

  // Scores
  const faceScore = state.face.emotion ? emotionToScore(state.face.emotion) : 60;
  const noiseScore = 100 - clamp(state.noise.avg, 0, 100);             // menos dB → mayor score
  const bodyAvg01 = (state.body.head + state.body.upper + state.body.lower)/3; // 1..10
  const bodyScore = Math.round(bodyAvg01*10);                           // 10..100
  const ix = Math.round(0.33*faceScore + 0.33*noiseScore + 0.34*bodyScore);

  // Render
  const circle=$('#ix_score_circle'), label=$('#ix_label'), pf=$('#ix_face_progress'), pd=$('#ix_db_progress'), pb=$('#ix_bs_progress'), reco=$('#ix_reco');
  if (circle){ circle.textContent=ix; circle.style.background = ix>=67?'#48bb78':ix>=34?'#f6ad55':'#e53e3e'; }
  if (label){ label.textContent = ix>=67 ? 'En verde' : ix>=34 ? 'Atento' : 'Revisa tu día'; }
  if (pf){ pf.style.width=`${faceScore}%`; pf.style.background='#8DB596'; }
  if (pd){ pd.style.width=`${noiseScore}%`; pd.style.background='#A7AD9A'; }
  if (pb){ pb.style.width=`${bodyScore}%`; pb.style.background='#70755D'; }
  if (reco){ reco.textContent = buildReco(faceScore, noiseScore, bodyScore); }

  // Persistencia
  try{
    const u=(await db.auth.getUser())?.data?.user; if(!u) { showScreen('screenIntegration'); return; }
    if (state.context.area) { await db.from('profiles').update({ department: state.context.area }).eq('id', u.id); }
    await db.from('measurements').insert({
      user_id_uuid: u.id,
      face_emotion: state.face.emotion || 'neutral',
      noise_db: state.noise.avg || 0,
      body_scan_avg: +((bodyAvg01).toFixed(1)),   // escala 1..10 como float
      combined_score: ix,
      journal_entry: state.journal || null
    });
  }catch(err){ console.error('[supabase insert]', err); }

  showScreen('screenIntegration');
}
function buildReco(face, noise, body){
  const min = Math.min(face, noise, body);
  if (min===noise) return 'Reserva 10 minutos en un espacio más silencioso o usa cancelación de ruido.';
  if (min===body)  return 'Realiza 2 pausas de estiramiento (cuello y espalda) durante la mañana.';
  return 'Antes de tu próxima tarea, respira 4-4-4-4 durante 60 segundos.';
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
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
