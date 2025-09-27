/*********** Navegación entre pantallas ***********/
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
document.getElementById("btnStart").addEventListener("click", ()=>showScreen("screen2"));
document.getElementById("btnNext").addEventListener("click",  ()=>showScreen("screen3"));
document.getElementById("btnMedirOtraVez")?.addEventListener("click", ()=>showScreen("screen3"));
document.getElementById("btnVolverResultados")?.addEventListener("click", ()=>showScreen("screen4"));
document.getElementById("btnIrAMedir")?.addEventListener("click", ()=>showScreen("screen3"));

/*********** Indicadores (contenido + assets) ***********/
const INDICATORS = {
  alegria: {
    key: "alegria", title: "🌟 Alegría", range: "60–75 dB",
    img: "ind-alegria.png",
    body: [
      "✨ ¡Tu voz está brillando de alegría! Se nota entusiasmo y buena vibra. Esta energía no solo te hace sentir bien a ti, también impacta en quienes te escuchan.",
      "🎮 Dato curioso: cuando sonríes al hablar, tus cuerdas vocales vibran distinto y la otra persona lo percibe aunque no te vea.",
      "👉 Mini-reto: intenta grabarte diciendo una frase con y sin sonrisa… ¿Notas la diferencia?"
    ]
  },
  enojo: {
    key: "enojo", title: "🔥 Enojo", range: "75–90 dB",
    img: "ind-enojo.png",
    body: [
      "😤 Tu voz está encendida como una llama. La fuerza con que hablas transmite enojo o mucha tensión. Esto puede servir para defender tus ideas, pero si se descontrola puede chocar con los demás.",
      "📚 Dato curioso: al enojarnos, los músculos del cuello se tensan y el aire sale con más presión, por eso la voz suena más fuerte.",
      "👉 Juego rápido: antes de responder, pon un temporizador de 10 segundos de respiración y mira cómo baja el “volumen de tu enojo”."
    ]
  },
  estres: {
    key: "estres", title: "⚡ Estrés", range: "65–80 dB",
    img: "ind-estres.png",
    body: [
      "⏳ Tu voz suena como un motor acelerado. El estrés hace que hablemos más rápido y con cambios bruscos en la intensidad. Eso puede confundir a quien te escucha.",
      "🔍 Dato curioso: el estrés activa la adrenalina, que acelera tu ritmo cardíaco y se refleja en la velocidad de tu voz.",
      "👉 Ejercicio express: coloca una mano en tu abdomen y respira profundamente 5 veces. ¿Notas cómo tu voz se vuelve más estable después?"
    ]
  },
  ansiedad: {
    key: "ansiedad", title: "🌊 Ansiedad", range: "55–70 dB",
    img: "ind-ansiedad.png",
    body: [
      "💙 Tu voz tiene olas de inestabilidad. La ansiedad suele hacer que suene temblorosa o con altibajos. Esto puede hacerte sentir inseguro aunque tengas claro lo que quieres decir.",
      "🧠 Dato curioso: cuando estamos ansiosos, el cuerpo tiembla levemente y eso se refleja en la voz.",
      "👉 Dinámica lúdica: intenta leer un texto en voz alta muy lentamente, como si fueras un narrador de audiolibro. Esto engaña a tu cerebro y te transmite calma."
    ]
  },
  tristeza: {
    key: "tristeza", title: "🌧️ Tristeza", range: "35–55 dB",
    img: "ind-tristeza.png",
    body: [
      "🌥️ Tu voz se escucha bajita y sin energía. Eso refleja tristeza o desánimo, emociones que son totalmente válidas.",
      "📖 Dato curioso: la tristeza activa menos músculos en la laringe, por eso la voz se vuelve más monótona.",
      "👉 Mini-desafío: cambia de lugar (ve a un sitio con luz natural o abre una ventana) y vuelve a hablar. Tu entorno puede ser el primer paso para levantar tu energía."
    ]
  },
};

/*********** Clasificación por dB ***********/
const CLASSES = [
  { min: -Infinity, max: 55,  key:"tristeza" },
  { min: 55,        max: 65,  key:"ansiedad" },
  { min: 65,        max: 75,  key:"estres"   },
  { min: 75,        max: 90,  key:"enojo"    },
  { min: 60,        max: 72,  key:"alegria", priority: 1 }, // solape ejemplo
];
function classifyDb(db){
  let match=null, pri=-99;
  for(const c of CLASSES){
    if(db>=c.min && db< c.max){
      const p=c.priority??0;
      if(p>pri){pri=p; match=c;}
      else if(!match){match=c;}
    }
  }
  return match ? INDICATORS[match.key] : null;
}

/*********** Elementos de Medición ***********/
const toggleBtn   = document.getElementById("toggleBtn");
const loaderEl    = document.getElementById("loader");
const dbValueEl   = document.getElementById("dbValue");
const barEl       = document.getElementById("bar");
const statusEl    = document.getElementById("status");
const calSlider   = document.getElementById("calibration");
const calValEl    = document.getElementById("calVal");
const smoothingEl = document.getElementById("smoothing");

let audioContext, analyser, sourceNode, mediaStream;
let dataBuf;

/*********** Utilidades ***********/
function rmsToDb(rms){ const min=1e-8; return 20*Math.log10(Math.max(min,rms)); }
function computeRmsFloat(buf){ let s=0; for(let i=0;i<buf.length;i++) s+=buf[i]*buf[i]; return Math.sqrt(s/buf.length); }
function setStatus(text){ statusEl.textContent = text; }
function setBar(db){ const pct=Math.max(0, Math.min(100, ((db-30)/60)*100)); barEl.style.width = pct + "%"; }
function saveSession({avg,max,labelKey}){
  const rec = { t: Date.now(), avg, max, labelKey };
  const arr = JSON.parse(localStorage.getItem("sw_history")||"[]");
  arr.push(rec);
  localStorage.setItem("sw_history", JSON.stringify(arr.slice(-20))); // guarda últimas 20
  return arr.slice(-20);
}
function getHistory(){ return JSON.parse(localStorage.getItem("sw_history")||"[]"); }

/*********** Medición 5s ***********/
async function startMeasurement(){
  try{
    loaderEl.hidden = false;
    dbValueEl.textContent = "…";
    setStatus("Analizando ambiente laboral…");
    barEl.style.width = "0%";
    toggleBtn.disabled = true;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)({latencyHint:"interactive"});
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = parseFloat(smoothingEl.value);
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);
    dataBuf = new Float32Array(analyser.fftSize);

    const samples=[];
    const duration=5000, interval=100;
    const intId=setInterval(()=>{
      analyser.getFloatTimeDomainData(dataBuf);
      const rms = computeRmsFloat(dataBuf);
      const db  = rmsToDb(rms);
      const cal = parseInt(calSlider.value||"0",10);
      const mapped = Math.round(30 + ((db+60)/60)*60 + cal);
      samples.push(mapped);
    }, interval);

    setTimeout(()=>{
      clearInterval(intId);
      // cerrar audio
      mediaStream.getTracks().forEach(t=>t.stop());
      audioContext.close();

      loaderEl.hidden = true;
      toggleBtn.disabled = false;

      if(!samples.length){ setStatus("Sin datos"); return; }

      const avg = Math.round(samples.reduce((a,b)=>a+b,0)/samples.length);
      const max = Math.max(...samples);
      dbValueEl.textContent = avg;
      setBar(avg);

      const ind = classifyDb(avg);
      setStatus(ind ? `${ind.title} · ${ind.range}` : "Medición completada");

      // guardar y mostrar resultados
      saveSession({avg,max,labelKey: ind?.key});
      renderResults();
      showScreen("screen4");
    }, duration);

  }catch(err){
    console.error(err);
    alert("No se pudo acceder al micrófono. Verifica permisos y HTTPS.");
    loaderEl.hidden = true;
    toggleBtn.disabled = false;
  }
}
toggleBtn.addEventListener("click", startMeasurement);
calSlider.addEventListener("input", ()=>{calValEl.textContent = calSlider.value});

/*********** Resultados: resumen, gráfico, carrusel ***********/
function renderResults(){
  const history = getHistory();
  const rangeTitle = document.getElementById("rangeTitle");
  const rangeSubtitle = document.getElementById("rangeSubtitle");
  const xLabels = document.getElementById("xLabels");
  const svg = document.getElementById("chart");

  if(history.length===0){
    rangeTitle.textContent = "Aún no hay mediciones";
    rangeSubtitle.textContent = "Realiza tu primera medición para ver resultados.";
    svg.innerHTML=""; xLabels.innerHTML="";
    renderCarousel([]);
    return;
  }

  const lastN = history.slice(-7); // últimas 7
  const vals = lastN.map(r=>r.avg);
  const min = Math.min(...vals), max = Math.max(...vals);
  rangeTitle.textContent = `Esta semana los decibeles fueron ${min}–${max} dB`;

  // subtítulo según indicador más reciente
  const last = lastN[lastN.length-1];
  const ind = last.labelKey ? INDICATORS[last.labelKey] : null;
  rangeSubtitle.textContent = ind ? `Voces ${ind.title.replace(/^[^\s]+\s/,'').toLowerCase()} de lo habitual.` : "Historial de tus últimas mediciones.";

  // gráfico simple SVG
  const W=320, H=160, PAD=16;
  const yFromDb = d=> {
    const y = H - PAD - ((d-30)/60)*(H-2*PAD);
    return Math.max(PAD, Math.min(H-PAD, y));
  };
  const xStep = (W-2*PAD)/(lastN.length-1 || 1);
  let d = "";
  lastN.forEach((r,i)=>{
    const x = PAD + i*xStep;
    const y = yFromDb(r.avg);
    d += (i===0?`M ${x} ${y}`:` L ${x} ${y}`);
  });
  svg.innerHTML = `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a5b4fc" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#a5b4fc" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${d}" fill="none" stroke="#6366f1" stroke-width="3" />
    <path d="${d} L ${PAD + (lastN.length-1)*xStep} ${H-PAD} L ${PAD} ${H-PAD} Z" fill="url(#g)" opacity="0.25"/>
    ${lastN.map((r,i)=>{
      const x = PAD + i*xStep, y = yFromDb(r.avg);
      return `<circle cx="${x}" cy="${y}" r="3" fill="#111"/>`;
    }).join("")}
  `;
  xLabels.innerHTML = lastN.map(r=>{
    const dt = new Date(r.t); const dd = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][dt.getDay()];
    return `<span>${dd}</span>`;
  }).join("");

  // carrusel
  const keys = [...new Set(lastN.map(r=>r.labelKey).filter(Boolean))];
  renderCarousel(keys);
}

function renderCarousel(keys){
  const wrap = document.getElementById("carousel");
  wrap.innerHTML = "";
  const order = keys.length ? keys : ["tristeza","ansiedad","estres","enojo","alegria"];
  order.forEach(k=>{
    const it = INDICATORS[k];
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="thumb" style="background-image:url('${it.img}')"></div>
      <div class="body">
        <p class="title">${it.title}</p>
        <p class="range">${it.range}</p>
      </div>
    `;
    card.addEventListener("click", ()=>openIndicator(it));
    wrap.appendChild(card);
  });
}

function openIndicator(it){
  document.getElementById("indicatorHero").style.backgroundImage = `url('${it.img}')`;
  document.getElementById("indicatorTitle").textContent = it.title;
  document.getElementById("indicatorRange").textContent = it.range;
  const body = document.getElementById("indicatorBody");
  body.innerHTML = it.body.map(p=>`<p>${p}</p>`).join("");
  showScreen("screen5");
}

/* inicializa */
calValEl.textContent = "0";
renderResults();
