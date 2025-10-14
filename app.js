// ============ CONFIGURACIÓN SUPABASE ============
const SUPABASE_URL = "https://kdxoxusimqdznduwyvhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeG94dXNpbXFkem5kdXd5dmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4NDgsImV4cCI6MjA3NTQ4Mzg0OH0.sfa5iISRNYwwOQLzkSstWLMAqSRUSKJHCItDkgFkQvc";

let db = null;
let supabaseReady = false;

// ============ UTILIDADES DE UI / RUTAS ============
function $(sel) { return document.querySelector(sel); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  else console.warn(`[router] pantalla no encontrada: ${id}`);
}
function setAuthMessage(msg, isError = false) {
  const el = $('#auth-message');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? 'var(--danger)' : 'var(--text-light)';
}

function toEmailFromUser(user) {
  const base = (user || '').trim().toLowerCase();
  if (!base) return null;
  const safe = base.replace(/[^a-z0-9._-]/g, '');
  return `${safe}@example.com`;
}

// ============ INICIALIZACIÓN ============
document.addEventListener('DOMContentLoaded', async () => {
  initIntroCarousel();
  initAuthTabs();
  initTermsLinks();

  supabaseReady = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

  if (!supabaseReady) {
    console.error('[supabase] Faltan credenciales.');
    setAuthMessage('Configuración de Supabase ausente.', true);
  } else {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Sesión persistente
    db.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await onSignedIn(session.user);
      } else {
        onSignedOut();
      }
    });

    const { data: { session }, error } = await db.auth.getSession();
    if (error) {
      console.error('[supabase] getSession error:', error);
      setAuthMessage('No se pudo verificar la sesión.', true);
      showScreen('screenIntro');
    } else if (session?.user) {
      await onSignedIn(session.user);
    } else {
      showScreen('screenIntro');
    }
  }

  initAuthForms();
  initMainNavigation();
});

// ============ SESIÓN ============
async function onSignedIn(user) {
  const name = (user?.user_metadata?.username) || (user?.email?.split('@')[0]) || 'Usuario';
  $('#welcome-user').textContent = `¡Hola, ${capitalize(name)}!`;
  showScreen('screenHome');
  setAuthMessage('');
}

function onSignedOut() {
  showScreen('screenIntro');
  setAuthMessage('');
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ============ INTRO ============
function initIntroCarousel() {
  const slides = $('#introSlides');
  const dotsWrap = $('#introDots');
  const btnPrev = $('#introPrev');
  const btnNext = $('#introNext');
  const btnStart = $('#introStart');
  if (!slides) return;

  const slideCount = slides.children.length;
  let i = 0;

  function render() {
    slides.style.transform = `translateX(${-i * 100}%)`;
    dotsWrap.innerHTML = '';
    for (let k = 0; k < slideCount; k++) {
      const d = document.createElement('div');
      d.className = 'dot' + (k === i ? ' active' : '');
      dotsWrap.appendChild(d);
    }
    btnPrev.disabled = (i === 0);
    btnNext.style.display = i < slideCount - 1 ? 'inline-block' : 'none';
    btnStart.style.display = i === slideCount - 1 ? 'inline-block' : 'none';
  }
  btnPrev.onclick = () => { if (i > 0) { i--; render(); } };
  btnNext.onclick = () => { if (i < slideCount - 1) { i++; render(); } };
  btnStart.onclick = () => showScreen('screenAuth');
  render();
}

// ============ TÉRMINOS ============
function initTermsLinks() {
  const link = $('#view-terms-link');
  const closeBtn = $('#close-terms-button');
  if (link) link.addEventListener('click', e => { e.preventDefault(); showScreen('screenTerms'); });
  if (closeBtn) closeBtn.addEventListener('click', () => showScreen('screenAuth'));
}

// ============ TABS AUTH ============
function initAuthTabs() {
  const tabLogin = $('#authTabLogin');
  const tabSignup = $('#authTabSignup');
  const formLogin = $('#formLogin');
  const formSignup = $('#formSignup');
  if (!tabLogin) return;

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    formLogin.style.display = 'block';
    formSignup.style.display = 'none';
    setAuthMessage('');
  });

  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    formSignup.style.display = 'block';
    formLogin.style.display = 'none';
    setAuthMessage('');
  });
}

// ============ FORMULARIOS ============
function initAuthForms() {
  const formLogin = $('#formLogin');
  const formSignup = $('#formSignup');

  if (formLogin) {
    formLogin.addEventListener('submit', async e => {
      e.preventDefault();
      if (!supabaseReady) return setAuthMessage('Configura Supabase.', true);
      const user = $('#login_user').value.trim();
      const pass = $('#login_pass').value;
      if (!user || !pass) return setAuthMessage('Completa los campos.', true);

      const email = toEmailFromUser(user);
      try {
        setAuthMessage('Iniciando sesión...');
        const { error } = await db.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        setAuthMessage('Sesión iniciada.');
      } catch (err) {
        console.error('[login] error', err);
        setAuthMessage(humanizeAuthError(err), true);
      }
    });
  }

  if (formSignup) {
    formSignup.addEventListener('submit', async e => {
      e.preventDefault();
      if (!supabaseReady) return setAuthMessage('Configura Supabase.', true);
      const user = $('#su_user').value.trim();
      const pass = $('#su_pass').value;
      const accepted = $('#su_terms').checked;
      if (!user || !pass) return setAuthMessage('Completa los campos.', true);
      if (!accepted) return setAuthMessage('Debes aceptar los términos.', true);
      const email = toEmailFromUser(user);

      try {
        setAuthMessage('Creando cuenta...');
        const { error } = await db.auth.signUp({
          email,
          password: pass,
          options: { data: { username: user } }
        });
        if (error) throw error;
        setAuthMessage('Cuenta creada. Iniciando sesión...');
        await db.auth.signInWithPassword({ email, password: pass });
      } catch (err) {
        console.error('[signup] error', err);
        setAuthMessage(humanizeAuthError(err), true);
      }
    });
  }
}

function humanizeAuthError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos.';
  if (msg.includes('password')) return 'Contraseña no válida.';
  if (msg.includes('network')) return 'Error de conexión.';
  return err?.message || 'Error inesperado.';
}

// ============ NAVEGACIÓN ============
function initMainNavigation() {
  const btnHomeStart = $('#btnHomeStart');
  const btnSignOut = $('#btnSignOut');
  const btnFaceNext = $('#btnFaceNext');
  const btnFaceSkip = $('#btnFaceSkip');
  const btnMeasureNext = $('#btnMeasureNext');
  const btnBodyScanNext = $('#btnBodyScanNext');
  const btnJournalNext = $('#btnJournalNext');
  const btnIntegrationHome = $('#btnIntegrationHome');

  if (btnHomeStart) btnHomeStart.addEventListener('click', () => showScreen('screenFace'));
  if (btnSignOut) btnSignOut.addEventListener('click', async () => { await db?.auth.signOut(); onSignedOut(); });

  if (btnFaceSkip) btnFaceSkip.addEventListener('click', () => { $('#faceEmotion').textContent = '—'; $('#faceConfidence').textContent = '—'; btnFaceNext.removeAttribute('disabled'); });
  if (btnFaceNext) btnFaceNext.addEventListener('click', () => showScreen('screenMeasure'));
  if (btnMeasureNext) btnMeasureNext.addEventListener('click', () => showScreen('screenBodyScan'));
  if (btnBodyScanNext) btnBodyScanNext.addEventListener('click', () => showScreen('screenJournal'));
  if (btnJournalNext) btnJournalNext.addEventListener('click', () => { renderFinalReport(); showScreen('screenIntegration'); });
  if (btnIntegrationHome) btnIntegrationHome.addEventListener('click', () => showScreen('screenHome'));
}

// ============ INFORME ============
function renderFinalReport() {
  const face = 70, dbScore = 65, body = 60;
  const ix = Math.round(0.33 * face + 0.33 * dbScore + 0.34 * body);
  const circle = $('#ix_score_circle');
  const label = $('#ix_label');
  const pf = $('#ix_face_progress');
  const pd = $('#ix_db_progress');
  const pb = $('#ix_bs_progress');
  const reco = $('#ix_reco');

  if (circle) {
    circle.textContent = ix;
    circle.style.background = ix >= 67 ? '#48bb78' : ix >= 34 ? '#f6ad55' : '#e53e3e';
  }
  if (label) label.textContent = ix >= 67 ? 'En Verde' : ix >= 34 ? 'Atento' : 'Revisa tu día';
  if (pf) pf.style.width = `${face}%`, pf.style.background = '#8DB596';
  if (pd) pd.style.width = `${dbScore}%`, pd.style.background = '#A7AD9A';
  if (pb) pb.style.width = `${body}%`, pb.style.background = '#70755D';
  if (reco) reco.textContent = 'Consejo: tómate 2 minutos para respirar profundo y estirar hombros.';
}



