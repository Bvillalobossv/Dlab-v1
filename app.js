/*************** SUPABASE  *****************/
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";
let db = null;

/*************** STATE  *****************/
const state = {
  user: null,
  context: { area: null },
  face: { emotion: null, confidence: 0 },
  noise: { samples: [], avg: 0, label: "" },
  body: { head: 0, upper: 0, lower: 0, pains: { head:[], upper:[], lower:[] } },
  journal: ''
};

/*************** UTILS  *****************/
const $ = s => document.querySelector(s);
const show = id => { document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active')); $('#'+id)?.classList.add('active'); };
const setAuthMessage = (t,err=false)=>{ const el=$('#auth-message'); if(!el) return; el.textContent=t||''; el.style.color=err?'var(--danger)':'var(--text-light)'; };
const capitalize = s => s? s[0].toUpperCase()+s.slice(1) : s;
const emailFromUser = u => `${(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@example.com`;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const delay = ms => new Promise(r=>setTimeout(r,ms));

/*************** FACE-API  *****************/
const MODEL_URL='./models';
let faceModelsReady=false, cameraStream=null;
const EMOJI_GIF={
  happy:'./images/mascots/happy.gif',
  neutral:'./images/mascots/neutral.gif',
  sad:'./images/mascots/sad.gif',
  angry:'./images/mascots/angry.gif',
  disgusted:'./images/mascots/disgust.gif',
  fearful:'./images/mascots/fear.gif',
  surprised:'./images/mascots/surprised.gif'
};

/*************** GAUGE  *****************/
let gaugeChart=null;

/*************** BOOT  *****************/
document.addEventListener('DOMContentLoaded', async () => {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db.auth.onAuthStateChange((_e, session) => session?.user ? onSignedIn(session.user) : onSignedOut());
  const { data:{ session } } = await db.auth.getSession();
  session?.user ? onSignedIn(session.user) : show('screenIntro');

  initIntro();
  initTabsTerms();
  initAuthForms();
  initNav();

  initArea();
  initFace(); // <-- CORRECCIÓN: Se inicia aquí para pre-cargar modelos
  initMicPrep();
  initNoise();
  initIndicatorsModal();
  initBodyScan();
});

/*************** SESSION  *****************/
async function onSignedIn(user){
  state.user=user;
  const name=(user?.user_metadata?.username)||(user?.email?.split('@')[0])||'Usuario';
  $('#welcome-user').textContent=`¡Hola, ${capitalize(name)}!`;
  show('screenHome');
}
function onSignedOut(){ state.user=null; show('screenIntro'); }

/*************** INTRO + AUTH  *****************/
function initIntro(){
  const slides=$('#introSlides'), dots=$('#introDots');
  const prev=$('#introPrev'), next=$('#introNext'), start=$('#introStart');
  if(!slides) return;
  const n=slides.children.length; let i=0;
  const render=()=>{ slides.style.transform=`translateX(${-i*100}%)`; dots.innerHTML=''; for(let k=0;k<n;k++){const d=document.createElement('div'); d.className='dot'+(k===i?' active':''); dots.appendChild(d);} prev.disabled=i===0; next.style.display=i<n-1?'inline-block':'none'; start.style.display=i===n-1?'inline-block':'none'; };
  prev.onclick=()=>{ if(i>0){i--;render();} }; next.onclick=()=>{ if(i<n-1){i++;render();} }; start.onclick=()=>show('screenAuth'); render();
}
function initTabsTerms(){
  $('#authTabLogin')?.addEventListener('click',()=>toggleAuth('login'));
  $('#authTabSignup')?.addEventListener('click',()=>toggleAuth('signup'));
  $('#view-terms-link')?.addEventListener('click',e=>{e.preventDefault();show('screenTerms');});
  $('#close-terms-button')?.addEventListener('click',()=>show('screenAuth'));
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
    const {error}=await db.auth.signInWithPassword({email:emailFromUser(u),password:p});
    if(error) setAuthMessage(error.message,true);
  });
  $('#formSignup')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const u=$('#su_user').value.trim(), p=$('#su_pass').value, ok=$('#su_terms').checked;
    if(!u||!p) return setAuthMessage('Completa los campos.',true);
    if(!ok) return setAuthMessage('Debes aceptar los términos.',true);
    const {error}=await db.auth.signUp({email:emailFromUser(u),password:p,options:{data:{username:u}}});
    if(error) return setAuthMessage(error.message,true);
    await db.auth.signInWithPassword({email:emailFromUser(u),password:p});
  });
}

/*************** NAV  *****************/
function initNav(){
  $('#btnHomeStart')?.addEventListener('click',()=>show('screenArea'));
  $('#btnSignOut')?.addEventListener('click',async()=>{ await db.auth.signOut(); onSignedOut(); });
  $('#btnAreaNext')?.addEventListener('click',()=>show('screenFace'));
  $('#btnFaceSkip')?.addEventListener('click',()=>{ $('#faceEmotion').textContent='—'; $('#faceTip').textContent=''; $('#btnFaceNext').disabled=false; stopCamera(); show('screenAudioPrep'); });
  $('#btnFaceNext')?.addEventListener('click',()=>{ stopCamera(); show('screenAudioPrep'); });
  $('#btnGoToMeasure')?.addEventListener('click',()=>show('screenMeasure'));
  $('#btnMeasureNext')?.addEventListener('click',()=>show('screenBodyScan'));
  $('#btnBodyScanNext')?.addEventListener('click',()=>show('screenJournal'));
  $('#btnJournalNext')?.addEventListener('click',()=>finalizeAndReport());
  $('#btnIntegrationHome')?.addEventListener('click',()=>show('screenHome'));
}

/*************** ÁREA  *****************/
function initArea(){
  const grid = $('#areaGrid'), out = $('#areaSelected'), next = $('#btnAreaNext');
  grid?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.area-pill'); if(!btn) return;
    grid.querySelectorAll('.area-pill').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.context.area = btn.dataset.area;
    out.textContent = `Área seleccionada: ${state.context.area}`;
    next.disabled = false;
    try{
      const u = (await db.auth.getUser())?.data?.user;
      if (u?.id && state.context.area) await db.from('profiles').update({ department: state.context.area }).eq('id', u.id);
    }catch(err){ console.warn('[profiles update]', err); }
  });
}

/*************** CÁMARA / FACE (CORREGIDO) *****************/
async function ensureFaceModels(){
  if(faceModelsReady) return;
  const status = $('#faceStatus');
  try {
    status.textContent = 'Cargando modelos de IA...';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);
    faceModelsReady = true;
    status.textContent = 'Modelos listos. Puedes activar la cámara.';
  } catch (err) {
    console.error('[face-api models]', err);
    status.textContent = 'Error al cargar los modelos de IA. Refresca la página.';
    faceModelsReady = false;
  }
}

function initFace(){
  const video=$('#faceVideo'), canvas=$('#faceCanvas');
  const btnStart=$('#btnFaceStart'), btnSnap=$('#btnFaceSnap'), status=$('#faceStatus');

  if (video) { video.setAttribute('playsinline',''); video.muted=true; video.autoplay=true; }

  // CORRECCIÓN: Pre-cargar modelos y actualizar UI
  ensureFaceModels().then(() => {
    if (faceModelsReady) {
      btnStart.disabled = false;
    } else {
      btnStart.disabled = true;
    }
  });

  btnStart?.addEventListener('click', async ()=>{
    if (!faceModelsReady) {
      status.textContent = 'Los modelos de IA aún no están listos. Espera un momento.';
      return;
    }
    btnStart.disabled = true; // Evitar doble click
    status.textContent = 'Iniciando cámara...';
    try{
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      cameraStream = stream;
      video.srcObject = stream;
      await video.play();
      await delay(200); // Dar tiempo al video para estabilizarse
      btnSnap.disabled = false;
      status.textContent = 'Cámara lista ✅. Centra tu rostro y analiza.';
    } catch(err){
      console.error('[camera]', err);
      status.textContent = 'No se pudo activar la cámara. Verifica permisos y HTTPS.';
      btnStart.disabled = false; // Permitir reintentar
    }
  });

  btnSnap?.addEventListener('click', async ()=>{
    if(!video?.srcObject){ status.textContent='Activa primero la cámara.'; return; }
    btnSnap.disabled = true;
    status.textContent = 'Analizando rostro…';
    try{
      // Intento directo sobre <video>
      let detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceExpressions();

      // Fallback a <canvas> si falla el video
      if(!detections?.length){
        await delay(100); // Pequeña pausa
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        detections = await faceapi
          .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceExpressions();
      }

      if(!detections?.length){
        status.textContent = 'No se detectó rostro. Busca mejor luz y centra tu cara 🙂';
        $('#faceEmotion').textContent = 'No detectada';
        $('#face-results-content').classList.remove('hidden');
        $('#btnFaceNext').disabled = false;
        state.face = { emotion: null, confidence: 0 };
        btnSnap.disabled = false; // Permitir reintento
        return;
      }

      const expr = detections[0].expressions.asSortedArray()[0];
      const emotion = expr.expression;
      const conf = +(expr.probability * 100).toFixed(1);

      $('#faceEmotion').textContent = capitalize(emotion);
      const img = $('#faceMascot');
      img.src = EMOJI_GIF[emotion] || EMOJI_GIF.neutral;
      img.alt = `Emoción: ${emotion}`;
      $('#faceTip').textContent = tipForEmotion(emotion, conf);
      $('#face-results-content').classList.remove('hidden');
      $('#btnFaceNext').disabled = false;
      status.textContent = 'Análisis completado ✅';
      state.face = { emotion, confidence: conf };

    } catch(err){
      console.error('[analyze]', err);
      status.textContent = 'Error al analizar rostro. Intenta nuevamente.';
      btnSnap.disabled = false; // Permitir reintento
    }
  });
}

function stopCamera(){
  try{
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
      $('#faceVideo').srcObject = null;
    }
  } catch(err) {
    console.warn('Error al detener la cámara:', err);
  }
}
function tipForEmotion(e,c){
  const conf=c?` (${c}%)`:'';
  switch(e){
    case 'happy':return`Se nota buena energía${conf} 😄. 3 respiraciones para mantener claridad.`;
    case 'neutral':return`Buen punto de partida${conf}. Define 1 tarea clave y arranca 🧭.`;
    case 'sad':return`Ánimo${conf} 💛. Luz natural y movimiento suave 2 min.`;
    case 'angry':return`Baja revoluciones${conf}. Respira 4-4-4-4 y afloja mandíbula.`;
    case 'fearful':return`Una cosa a la vez${conf} 🧘. Prioriza y avanza.`;
    case 'disgusted':return`Cambia de foco 2 min${conf} y vuelve con intención.`;
    case 'surprised':return`Canaliza esa chispa${conf}: objetivo rápido ✍️.`;
    default:return`Respira profundo por 60 s y vuelve con foco.`;
  }
}

/*************** MIC PREP  *****************/
let micTested=false;
function initMicPrep(){
  const btn=$('#btnTestMic'), res=$('#audio-permission-result'), next=$('#btnGoToMeasure');
  btn?.addEventListener('click', async ()=>{
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      s.getTracks().forEach(t=>t.stop());
      micTested=true; res.textContent='Micrófono OK. Permiso otorgado ✅'; res.style.color='var(--success)'; next.disabled=false;
    }catch(err){ res.textContent='No se pudo acceder al micrófono. Revisa permisos.'; res.style.color='var(--danger)'; next.disabled=true; }
  });
}

/*************** NOISE 5s PROMEDIO  *****************/
function initNoise(){
  const btn=$('#toggleBtn'), dbValue=$('#dbValue'), dbLabel=$('#dbLabel'), countdown=$('#countdown'), status=$('#status');
  const resultsCard=$('#noise-results-card'), finalDb=$('#final-db-result'), finalLabel=$('#final-db-label'), next=$('#btnMeasureNext');

  const gctx=$('#gaugeChart').getContext('2d');
  gaugeChart=new Chart(gctx,{ type:'doughnut', data:{labels:['valor','resto'],datasets:[{data:[0,100],borderWidth:0,cutout:'80%',backgroundColor:['#A7AD9A','#eee']}]}, options:{responsive:true,maintainAspectRatio:false,rotation:-90,circumference:180,plugins:{legend:{display:false},tooltip:{enabled:false}}}});
  const setGauge=v=>{ const pct=Math.max(0,Math.min(100,v)); const color=pct<45?'#8DB596':pct<65?'#A7AD9A':pct<80?'#f6ad55':'#e53e3e'; gaugeChart.data.datasets[0].data=[pct,100-pct]; gaugeChart.data.datasets[0].backgroundColor=[color,'#eee']; gaugeChart.update('none'); };
  const classify=db=> db<45?'muy tranquilo': db<60?'tranquilo': db<75?'ruido moderado':'alto';

  let audioCtx, analyser, micStream, raf, values=[], started=false;

  async function startMeasure(){
    if(!micTested){ alert('Primero prueba el micrófono.'); return; }
    if(started) return;
    started=true; values=[]; status.textContent='Midiendo…'; btn.textContent='⏹️ Detener'; btn.disabled=true;

    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    const src=audioCtx.createMediaStreamSource(micStream);
    analyser=audioCtx.createAnalyser(); analyser.fftSize=2048; src.connect(analyser);

    let remaining=5.0;
    const tick=()=>{
      const data=new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
      const rms=Math.sqrt(sum/data.length);
      const dB=Math.max(20*Math.log10(rms)+90,0);

      values.push(dB);
      dbValue.textContent=Math.round(dB);
      dbLabel.textContent=classify(dB);
      setGauge(Math.min(Math.max(dB,0),100));

      remaining=Math.max(0,remaining-0.05);
      countdown.textContent=`${remaining.toFixed(1)} s`;
      if(remaining>0){ raf=requestAnimationFrame(tick);} else { stopMeasure(); }
    };
    raf=requestAnimationFrame(tick);
  }

  function stopMeasure(){
    cancelAnimationFrame(raf);
    micStream?.getTracks().forEach(t=>t.stop());
    audioCtx?.close(); btn.textContent='🎙️ Iniciar 5s'; btn.disabled=false; started=false;

    const avg = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
    const label = classify(avg);
    finalDb.textContent=`${Math.round(avg)} dB`; finalLabel.textContent=label;
    resultsCard.classList.remove('hidden'); status.textContent='Medición finalizada.'; next.disabled=false;
    state.noise={samples:values.slice(),avg:Math.round(avg),label};
  }
  btn?.addEventListener('click',()=>startMeasure());
}

/*************** MODAL INDICADORES  *****************/
function initIndicatorsModal(){
  const tips={
    saludable:{title:'Ambiente saludable',img:'./images/ind-saludable.png',body:'<45 dB. Ideal para foco profundo. Mantén “franjas de silencio” y avisa al equipo cuando necesites concentración.'},
    oficina:{title:'Oficina activa',img:'./images/ind-conversacion.png',body:'45–65 dB. Conversación breve y coordinación. Si necesitas foco, usa música suave o auriculares.'},
    ruidoso:{title:'Ruidoso',img:'./images/ind-ruido.png',body:'65–80 dB. Conversaciones cruzadas o llamadas simultáneas. Usa cabinas o zonas de silencio para tareas de precisión.'},
    muyruidoso:{title:'Muy ruidoso',img:'./images/ind-silencio.png',body:'>80 dB. Riesgo de fatiga. Muévete a un lugar más silencioso; pausa breve para relajar cuello/hombros.'}
  };
  const modal=$('#modal'), mImg=$('#modalImg'), mTitle=$('#modalTitle'), mBody=$('#modalBody'), mClose=$('#modalClose');
  $('#refCarousel')?.addEventListener('click',e=>{
    const card=e.target.closest('.ref-card'); if(!card) return;
    const k=card.dataset.key, t=tips[k]; if(!t) return;
    mImg.src=t.img; mImg.alt=t.title; mTitle.textContent=t.title; mBody.textContent=t.body;
    modal.classList.remove('hidden');
  });
  mClose?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal?.addEventListener('click',e=>{ if(e.target===modal) modal.classList.add('hidden'); });
}

/*************** BODY SCAN  *****************/
function initBodyScan(){
  const head=$('#bs_head'), upper=$('#bs_upper'), lower=$('#bs_lower'), tip=$('#bs_tip');
  const vH=$('#valHead'), vU=$('#valUpper'), vL=$('#valLower');

  const painsHead = ()=>[...document.querySelectorAll('.pain-head:checked')].map(x=>x.value);
  const painsUpper= ()=>[...document.querySelectorAll('.pain-upper:checked')].map(x=>x.value);
  const painsLower= ()=>[...document.querySelectorAll('.pain-lower:checked')].map(x=>x.value);

  const update=()=>{
    vH.textContent=`${head.value}/10`; vU.textContent=`${upper.value}/10`; vL.textContent=`${lower.value}/10`;
    state.body.head=+head.value; state.body.upper=+upper.value; state.body.lower=+lower.value;
    state.body.pains.head=painsHead(); state.body.pains.upper=painsUpper(); state.body.pains.lower=painsLower();
    const avg=(state.body.head+state.body.upper+state.body.lower)/3;
    const painsCount=state.body.pains.head.length+state.body.pains.upper.length+state.body.pains.lower.length;
    if(avg<=3 && painsCount===0) tip.textContent='¡Vas muy bien hoy! Tu cuerpo está equilibrado y atento 💪';
    else if(avg<=6 && painsCount<=1) tip.textContent='Tu cuerpo te pide una pausa suave 🧘. Estira cuello/espalda 2 min.';
    else tip.textContent='Tu cuerpo está tenso 😣. Date un respiro, estira hombros y camina 1 minuto.';
  };

  [head,upper,lower].forEach(el=>el?.addEventListener('input',update));
  document.querySelectorAll('.pain-head,.pain-upper,.pain-lower').forEach(el=>el.addEventListener('change',update));
  update();
}

/*************** REPORTE + PERSISTENCIA  *****************/
async function finalizeAndReport(){
  state.journal = ($('#journal-input')?.value || '').slice(0,1000);

  // CORRECCIÓN: Ponderación ajustada a README (Selfie 25%, Ruido 35%, Cuerpo 40%)
  const faceScore = state.face.emotion ? emotionToScore(state.face.emotion) : 60; // Puntuación de 0 a 100
  const noiseScore = 100 - clamp(state.noise.avg, 0, 100); // Puntuación de 0 a 100 (mayor ruido, menor puntaje)
  const bodyAvg10 = (state.body.head + state.body.upper + state.body.lower)/3; // Promedio de 0 a 10
  const bodyScore = 100 - (bodyAvg10 * 10); // Puntuación de 0 a 100 (mayor tensión, menor puntaje)

  const ix = Math.round(0.25 * faceScore + 0.35 * noiseScore + 0.40 * bodyScore);

  const circle=$('#ix_score_circle'), label=$('#ix_label'), pf=$('#ix_face_progress'), pd=$('#ix_db_progress'), pb=$('#ix_bs_progress');
  if(circle){ circle.textContent=ix; circle.style.background = ix>=67?'#48bb78':ix>=34?'#f6ad55':'#e53e3e'; }
  if(label){ label.textContent = ix>=67 ? 'En verde' : ix>=34 ? 'Atento' : 'Revisa tu día'; }
  if(pf){ pf.style.width=`${faceScore}%`; pf.style.background='#8DB596'; }
  if(pd){ pd.style.width=`${noiseScore}%`; pd.style.background='#A7AD9A'; }
  if(pb){ pb.style.width=`${bodyScore}%`; pb.style.background='#70755D'; }

  $('#ix_reco').textContent = buildReco(faceScore, noiseScore, bodyScore, state);
  $('#ix_meaning').textContent = buildMeaning(ix, state);

  try{
    const u=(await db.auth.getUser())?.data?.user;
    if(u?.id){
      await db.from('measurements').insert({
        user_id_uuid: u.id,
        face_emotion: state.face.emotion || 'skipped',
        noise_db: state.noise.avg || 0,
        body_scan_avg: +(bodyAvg10.toFixed(1)),
        combined_score: ix,
        journal_entry: state.journal || null
      });
    }
  }catch(err){ console.error('[supabase insert]', err); }

  show('screenIntegration');
}

function buildMeaning(ix){
  if(ix>=67) return '“En verde”: tu día luce equilibrado. Mantén pausas breves y conserva lo que te está funcionando hoy.';
  if(ix>=34) return '“Atento”: hay señales de cansancio físico o ruido ambiental. Ajusta el entorno y toma micro-pausas para recuperar foco.';
  return '“Revisa tu día”: tu cuerpo/entorno piden descanso. Prioriza lo esencial, busca un lugar más silencioso y cuida tus hombros/espalda.';
}
function buildReco(face, noise, body, st){
  const parts=[];
  if(['sad','angry','fearful'].includes(st.face.emotion)) parts.push('Respira 2-3 min y afloja hombros para resetear el foco.');
  const painsCount=st.body.pains.head.length+st.body.pains.upper.length+st.body.pains.lower.length;
  if(painsCount > 0 || body < 60) parts.push('Estira cuello y espalda 2 min; camina 1 minuto para oxigenar.');
  if(noise < 45) parts.push('Si puedes, cambia a una zona más silenciosa o usa cancelación de ruido.');
  if((st.journal||'').length>60) parts.push('Gracias por compartir: lo que escribes ayuda a ajustar tu día con más precisión.');
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