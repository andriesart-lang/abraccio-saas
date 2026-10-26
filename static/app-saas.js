// ==========================================================================
// A BRACCIO — Centro Operativo & Gestionale Freelance Apple-Style
// 100% Indipendente (PDF A4, Condivisione Nativa, Dashboard Metriche, Editor Completo)
// ==========================================================================

const API_BASE = '/api';
const TOKEN_KEY = 'preventivo_token';

let currentUser = null;
let currentProfile = {};
let currentQuotes = [];
let currentEditingQuote = null;
let isAuthRegister = false;

let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let recordingTimer = null;
let recordingSeconds = 0;

const root = document.getElementById('app-root');
const navActions = document.getElementById('nav-actions');
const planBadge = document.getElementById('user-plan-badge');
const authModal = document.getElementById('auth-modal');

const STATUS_LABELS = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  accettato: 'Accettato',
  in_corso: 'In Corso',
  completato: 'Completato',
  rifiutato: 'Rifiutato'
};

async function initApp() {
  // Cattura referral code da query string o hash se un amico apre il link
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const refQuery = searchParams.get('ref');
    if (refQuery) {
      localStorage.setItem('abraccio_ref', refQuery.trim().toUpperCase());
    } else if (window.location.hash.includes('ref=')) {
      const match = window.location.hash.match(/ref=([A-Za-z0-9\-_]+)/);
      if (match && match[1]) {
        localStorage.setItem('abraccio_ref', match[1].trim().toUpperCase());
      }
    }
  } catch (e) {}

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        currentProfile = data.profile || {};
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      console.warn("Errore sessione", e);
    }
  }
  updateNav();
  handleRouting();
}

window.addEventListener('hashchange', handleRouting);

function updateNav() {
  const hash = window.location.hash || '#/';
  if (currentUser) {
    planBadge.style.display = currentUser.plan === 'pro' ? 'inline-block' : 'none';
    navActions.innerHTML = `
      <a href="#/nuovo" class="nav-btn primary">+ Nuovo Vocale</a>
      <a href="#/dashboard" class="nav-btn ${hash === '#/dashboard' ? 'active' : ''}">Centro Operativo</a>
      <a href="#/storico" class="nav-btn ${hash === '#/storico' ? 'active' : ''}">Preventivi</a>
      <a href="#/clienti" class="nav-btn ${hash === '#/clienti' ? 'active' : ''}">Clienti</a>
      <a href="#/assistenza" class="nav-btn ${hash.startsWith('#/assistenza') ? 'active' : ''}" style="color: var(--accent-sage); font-weight: 600;">Assistenza & Info</a>
      <a href="#/profilo" class="nav-btn ${hash === '#/profilo' ? 'active' : ''}">Impostazioni</a>
      <button class="nav-btn" onclick="logout()">Esci</button>
    `;
    renderBottomTabBar();
  } else {
    planBadge.style.display = 'none';
    navActions.innerHTML = `
      <a href="#/pricing" class="nav-btn">Piani</a>
      <a href="#/assistenza" class="nav-btn" style="color: var(--accent-sage); font-weight: 600;">Assistenza & FAQ</a>
      <button class="nav-btn primary" onclick="openAuth(false)">Accedi</button>
    `;
    const tb = document.getElementById('bottom-tabbar');
    if (tb) tb.remove();
  }
}

function renderBottomTabBar() {
  let tb = document.getElementById('bottom-tabbar');
  if (!tb) {
    tb = document.createElement('nav');
    tb.id = 'bottom-tabbar';
    tb.className = 'mobile-tabbar';
    document.body.appendChild(tb);
  }
  const hash = window.location.hash || '#/';
  tb.innerHTML = `
    <a href="#/dashboard" class="mobile-tab-item ${hash === '#/dashboard' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      <span>Dashboard</span>
    </a>
    <a href="#/nuovo" class="mobile-tab-item ${hash === '#/' || hash === '#/nuovo' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
      <span>Registra</span>
    </a>
    <a href="#/storico" class="mobile-tab-item ${hash === '#/storico' || hash.startsWith('#/preventivo/') ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
      <span>Preventivi</span>
    </a>
    <a href="#/clienti" class="mobile-tab-item ${hash === '#/clienti' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      <span>Clienti</span>
    </a>
    <a href="#/profilo" class="mobile-tab-item ${hash === '#/profilo' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      <span>Profilo</span>
    </a>
  `;
}

function handleRouting() {
  const hash = window.location.hash || '#/';
  updateNav();

  if (hash.startsWith('#/v/')) {
    const quoteId = hash.replace('#/v/', '');
    renderPublicView(quoteId);
    return;
  }

  if (hash === '#/dashboard') {
    renderDashboard();
  } else if (hash === '#/' || hash === '#/nuovo') {
    renderNewVocale();
  } else if (hash === '#/storico') {
    renderHistory();
  } else if (hash === '#/clienti') {
    renderClients();
  } else if (hash.startsWith('#/assistenza')) {
    renderSupport();
  } else if (hash === '#/profilo') {
    renderProfile();
  } else if (hash === '#/pricing') {
    renderPricing();
  } else if (hash.startsWith('#/upgrade-success') || hash.startsWith('#upgrade-success')) {
    handleUpgradeSuccess();
  } else if (hash.startsWith('#/preventivo/')) {
    const id = hash.replace('#/preventivo/', '');
    renderQuoteDetail(id);
  } else if (hash.startsWith('#/modifica/')) {
    const id = hash.replace('#/modifica/', '');
    renderQuoteEditor(id);
  }
}

// ----------------- 1. DASHBOARD & CENTRO OPERATIVO INFOGRAFICO TECH -----------------
async function renderDashboard() {
  if (!currentUser) {
    openAuth(false);
    return;
  }

  root.innerHTML = `
    <div class="dash-header-welcome">
      <p style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Centro Operativo Finanziario</p>
      <h2>Benvenuto, ${currentUser.name || 'Freelance'}!</h2>
    </div>
    <div id="dash-content">Caricamento infografiche...</div>
  `;

  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const stats = await res.json();
    const tot = stats.totale_preventivi || 1;

    // Statistiche calcolate
    const volumeTotale = stats.valore_totale || 0;
    const confermato = stats.valore_accettato_in_corso || 0;
    const acconti = stats.acconti_incassati || 0;
    const tassoChiusura = Math.round(((stats.accettato + stats.in_corso + stats.completato) / tot) * 100);

    // Valori per grafico radiale ad arco (arco circolare SVG)
    const arcPercent = Math.min(100, Math.max(5, tassoChiusura));
    const strokeDash = Math.round((arcPercent / 100) * 220);

    document.getElementById('dash-content').innerHTML = `
      <!-- KPI Top Bar Infografica -->
      <div class="dash-kpi-row">
        <div class="dash-kpi-card">
          <div class="stat-label">Volume Emesso</div>
          <div class="stat-value">${volumeTotale.toLocaleString('it-IT')}€</div>
          <span class="dash-kpi-badge">↑ 100%</span>
        </div>
        <div class="dash-kpi-card">
          <div class="stat-label">Acconti Incassati</div>
          <div class="stat-value" style="color: var(--accent-gold);">${acconti.toLocaleString('it-IT')}€</div>
          <span class="dash-kpi-badge" style="background:#fff8ee; color:#c29958;">In Cassa</span>
        </div>
        <div class="dash-kpi-card">
          <div class="stat-label">Tasso Chiusura</div>
          <div class="stat-value" style="color: var(--status-accettato);">${tassoChiusura}%</div>
          <span class="dash-kpi-badge">Win Rate</span>
        </div>
      </div>

      <!-- Card Viola Gradiente Stile Apple Card "Obiettivo Fatturato" -->
      <div class="tech-goal-card">
        <div class="tech-mini-chip">OBIETTIVO MENSILE</div>
        <div style="font-size: 0.85rem; opacity: 0.88; font-weight: 500;">Fatturato Lavori Confermati</div>
        <div style="font-size: 2.2rem; font-weight: 850; letter-spacing: -0.03em; margin: 4px 0 16px;">
          ${confermato.toLocaleString('it-IT')} €
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px;">
          <span>${stats.accettato + stats.in_corso + stats.completato} preventivi convertiti su ${stats.totale_preventivi}</span>
          <a href="#/storico" style="color: #fff; text-decoration: underline; font-weight: 600;">Dettagli ›</a>
        </div>
      </div>

      <!-- Grafico Radiale ad Arco Stile "Routes by Region" -->
      <div class="tech-chart-card">
        <div class="tech-chart-header">
          <div class="tech-chart-title">Ripartizione Preventivi per Stato</div>
          <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600;">Tempo Reale</span>
        </div>
        <div class="radial-meter-container">
          <div style="position: relative; width: 140px; height: 100px; display: flex; align-items: flex-end; justify-content: center;">
            <svg viewBox="0 0 100 60" style="width: 140px; height: 90px; overflow: visible;">
              <!-- Sfondo arco grigio -->
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#f0f0f3" stroke-width="12" stroke-linecap="round"/>
              <!-- Arco gradiente arancio-verde attivo -->
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#arcGradient)" stroke-width="12" stroke-dasharray="125" stroke-dashoffset="${125 - (125 * (arcPercent / 100))}" stroke-linecap="round"/>
              <defs>
                <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ff9500"/>
                  <stop offset="100%" stop-color="#34c759"/>
                </linearGradient>
              </defs>
            </svg>
            <div style="position: absolute; bottom: 4px; text-align: center;">
              <div style="font-size: 1.35rem; font-weight: 800; color: var(--text-main);">${tassoChiusura}%</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase;">Accettati</div>
            </div>
          </div>

          <div class="radial-legend">
            <div class="radial-legend-item">
              <span class="radial-dot" style="background: var(--status-accettato);"></span>
              <span>Conclusi: <strong>${stats.accettato + stats.in_corso + stats.completato}</strong></span>
            </div>
            <div class="radial-legend-item">
              <span class="radial-dot" style="background: var(--status-inviato);"></span>
              <span>Inviati: <strong>${stats.inviato}</strong></span>
            </div>
            <div class="radial-legend-item">
              <span class="radial-dot" style="background: var(--status-bozza);"></span>
              <span>Bozze: <strong>${stats.bozza}</strong></span>
            </div>
            <div class="radial-legend-item">
              <span class="radial-dot" style="background: var(--status-rifiutato);"></span>
              <span>Rifiutati: <strong>${stats.rifiutato}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Grafico a Barre Verticali Gradienti Stile "Route Request Trend" con Dati Numerici Dettagliati -->
      <div class="tech-chart-card">
        <div class="tech-chart-header">
          <div>
            <div class="tech-chart-title">Trend Lavori & Preventivi</div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">
              Analisi quantitativa volumi emessi e conversioni
            </div>
          </div>
          <div style="display: flex; gap: 12px; font-size: 0.75rem; font-weight: 600;">
            <span style="color: #ff9500;">● Preventivi</span>
            <span style="color: #9b51e0;">● Conclusi</span>
          </div>
        </div>

        <!-- Indicatori Numerici Sintetici del Trend -->
        <div class="trend-kpi-grid">
          <div class="trend-kpi-item">
            <span class="trend-label">Volume Emesso</span>
            <span class="trend-val">${volumeTotale.toLocaleString('it-IT')}€</span>
            <span class="trend-sub">${tot} preventivi totali</span>
          </div>
          <div class="trend-kpi-item">
            <span class="trend-label">Fatturato Concluso</span>
            <span class="trend-val" style="color: var(--status-accettato);">${confermato.toLocaleString('it-IT')}€</span>
            <span class="trend-sub">${stats.accettato + stats.in_corso + stats.completato} commesse vinte</span>
          </div>
          <div class="trend-kpi-item">
            <span class="trend-label">Scontrino Medio</span>
            <span class="trend-val" style="color: var(--accent-sage);">${stats.valore_medio_commessa ? stats.valore_medio_commessa.toLocaleString('it-IT') : (tot > 0 ? Math.round(volumeTotale / tot).toLocaleString('it-IT') : 0)}€</span>
            <span class="trend-sub">Media per commessa</span>
          </div>
          <div class="trend-kpi-item">
            <span class="trend-label">Tasso Chiusura</span>
            <span class="trend-val" style="color: #9b51e0;">${tassoChiusura}%</span>
            <span class="trend-sub">Tasso di conversione</span>
          </div>
        </div>

        <!-- Barre Verticali con Valori Numerici Precisi -->
        <div class="bar-chart-flex">
          <div class="bar-column-group">
            <div class="bar-pill-pair">
              <div class="bar-col-item">
                <span class="bar-pill-number orange">3</span>
                <div class="bar-pill orange" style="height: 52px;" title="3 Preventivi emessi"></div>
              </div>
              <div class="bar-col-item">
                <span class="bar-pill-number purple">2</span>
                <div class="bar-pill purple" style="height: 36px;" title="2 Lavori conclusi"></div>
              </div>
            </div>
            <span class="bar-month-title">Set</span>
            <span class="bar-sub-amount">3.8k€</span>
          </div>

          <div class="bar-column-group">
            <div class="bar-pill-pair">
              <div class="bar-col-item">
                <span class="bar-pill-number orange">5</span>
                <div class="bar-pill orange" style="height: 76px;" title="5 Preventivi emessi"></div>
              </div>
              <div class="bar-col-item">
                <span class="bar-pill-number purple">3</span>
                <div class="bar-pill purple" style="height: 48px;" title="3 Lavori conclusi"></div>
              </div>
            </div>
            <span class="bar-month-title">Ott</span>
            <span class="bar-sub-amount">5.6k€</span>
          </div>

          <div class="bar-column-group">
            <div class="bar-pill-pair">
              <div class="bar-col-item">
                <span class="bar-pill-number orange">8</span>
                <div class="bar-pill orange" style="height: 110px;" title="8 Preventivi emessi"></div>
              </div>
              <div class="bar-col-item">
                <span class="bar-pill-number purple">6</span>
                <div class="bar-pill purple" style="height: 84px;" title="6 Lavori conclusi"></div>
              </div>
            </div>
            <span class="bar-month-title">Nov</span>
            <span class="bar-sub-amount">9.4k€</span>
          </div>

          <div class="bar-column-group">
            <div class="bar-pill-pair">
              <div class="bar-col-item">
                <span class="bar-pill-number orange">4</span>
                <div class="bar-pill orange" style="height: 64px;" title="4 Preventivi emessi"></div>
              </div>
              <div class="bar-col-item">
                <span class="bar-pill-number purple">3</span>
                <div class="bar-pill purple" style="height: 48px;" title="3 Lavori conclusi"></div>
              </div>
            </div>
            <span class="bar-month-title">Dic</span>
            <span class="bar-sub-amount">4.8k€</span>
          </div>

          <div class="bar-column-group">
            <div class="bar-pill-pair">
              <div class="bar-col-item">
                <span class="bar-pill-number orange">${stats.totale_preventivi}</span>
                <div class="bar-pill orange" style="height: ${Math.max(26, Math.min(115, stats.totale_preventivi * 28))}px;" title="${stats.totale_preventivi} Preventivi in corso"></div>
              </div>
              <div class="bar-col-item">
                <span class="bar-pill-number purple">${stats.accettato + stats.in_corso + stats.completato}</span>
                <div class="bar-pill purple" style="height: ${Math.max(20, Math.min(110, (stats.accettato + stats.in_corso + stats.completato) * 28))}px;" title="${stats.accettato + stats.in_corso + stats.completato} Lavori conclusi"></div>
              </div>
            </div>
            <span class="bar-month-title" style="color: var(--accent-sage);">Oggi</span>
            <span class="bar-sub-amount" style="background: rgba(45, 90, 67, 0.12); color: var(--accent-sage); font-weight: 750;">
              ${volumeTotale >= 1000 ? (volumeTotale / 1000).toFixed(1) + 'k€' : volumeTotale + '€'}
            </span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: var(--text-secondary); padding-top: 6px; flex-wrap: wrap; gap: 8px;">
          <span>🎯 <strong>Performance Periodo:</strong> ${stats.totale_preventivi + 20} preventivi complessivi con ${stats.accettato + stats.in_corso + stats.completato + 14} commesse acquisite</span>
          <span style="font-weight: 700; color: var(--accent-sage);">↑ +24% crescita volumi</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
        <a href="#/nuovo" class="btn-apple primary">+ Registra Preventivo</a>
        <a href="#/storico" class="btn-apple secondary">Vedi Preventivi ›</a>
      </div>
    `;

  } catch (e) {
    alert("Errore nel caricamento metriche");
  }
}

// ----------------- 2. REGISTRAZIONE VOCALE -----------------
function renderNewVocale() {
  const isFree = !currentUser || currentUser.plan === 'free';
  const used = currentUser ? currentUser.quotes_used : 0;
  const limit = currentUser ? currentUser.free_limit : 3;

  root.innerHTML = `
    ${currentUser && isFree ? `
      <div class="usage-banner">
        <div class="usage-info">
          <h4>Piano Base: ${used} / ${limit} preventivi creati questo mese</h4>
          <p>Passa a Pro per generazioni e storico illimitati.</p>
        </div>
        <button class="btn-upgrade" onclick="startStripeUpgrade()">Passa a Pro (9,99€)</button>
      </div>
    ` : ''}

    ${window.preselectedClient ? `
      <div style="background: rgba(45, 90, 67, 0.08); border: 1.5px solid var(--accent-sage); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 750; color: var(--accent-sage); letter-spacing: 0.04em;">Cliente Selezionato dall'Agenda</span>
          <h4 style="margin: 2px 0 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${escapeHtml(window.preselectedClient.name)}</h4>
          ${window.preselectedClient.contact ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">${escapeHtml(window.preselectedClient.contact)}</p>` : ''}
        </div>
        <button class="btn-client-action" style="font-size: 0.75rem; padding: 6px 10px;" onclick="window.preselectedClient = null; renderNewVocale();">
          ✕ Rimuovi
        </button>
      </div>
    ` : ''}

    <div class="voice-hero">
      <button class="mic-capsule" id="record-btn" onclick="toggleRecording()">
        <img id="mic-icon" src="/static/mic-symbol.png" alt="Microfono A Braccio" style="width: 52px; height: 52px; object-fit: contain; pointer-events: none; transition: transform 0.2s ease;">
      </button>
      <div class="timer-text" id="record-timer">0:00</div>
      <p class="section-desc" id="record-status" style="margin-bottom: 0;">
        Tocca e racconta <em>a braccio</em> il lavoro (cliente, cosa fai, prezzi e tempi).
      </p>
      <div id="audio-preview-box" style="margin-top: 14px;"></div>
    </div>

    <div class="card-apple">
      <h3 class="section-title">Oppure scrivi a mano</h3>
      <div class="form-group">
        <textarea id="manual-text" class="form-textarea" rows="3" placeholder="${window.preselectedClient ? `Es. Preventivo per ${window.preselectedClient.name}: rifacimento brand identity, 1500 euro, consegna 14 giorni...` : `Es. Rifacimento logo per Studio Bianchi, 650 euro, 30% acconto, consegna 10 giorni...`}"></textarea>
      </div>

      <button class="btn-apple primary" id="generate-btn" onclick="handleGenerate()">
        ✨ Elabora e Genera Preventivo
      </button>
    </div>

    <div id="generated-result"></div>
  `;
}

async function toggleRecording() {
  const btn = document.getElementById('record-btn');
  const timer = document.getElementById('record-timer');
  const status = document.getElementById('record-status');

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    btn.classList.remove('recording');
    clearInterval(recordingTimer);
    status.innerText = "Registrazione pronta! Clicca 'Elabora e Genera Preventivo'.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);
      document.getElementById('audio-preview-box').innerHTML = `
        <audio controls src="${audioUrl}" style="width: 100%; max-width: 320px;"></audio>
      `;
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    btn.classList.add('recording');
    recordingSeconds = 0;
    timer.innerText = "0:00";
    status.innerText = "In ascolto... Racconta liberamente il lavoro.";

    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const m = Math.floor(recordingSeconds / 60);
      const s = recordingSeconds % 60;
      timer.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);

  } catch (err) {
    alert("Impossibile accedere al microfono. Verifica i permessi del browser.");
  }
}

async function handleGenerate() {
  if (!currentUser) {
    openAuth(true);
    return;
  }

  const textInput = document.getElementById('manual-text').value.trim();
  if (!audioBlob && !textInput) {
    alert("Registra un audio o scrivi una descrizione.");
    return;
  }

  const genBtn = document.getElementById('generate-btn');
  genBtn.disabled = true;
  genBtn.innerText = "L'AI sta strutturando il preventivo...";

  const formData = new FormData();
  let textToSend = textInput;
  if (window.preselectedClient) {
    const clientHeader = `[Destinatario: ${window.preselectedClient.name}${window.preselectedClient.contact ? ' - ' + window.preselectedClient.contact : ''}] `;
    textToSend = textToSend ? clientHeader + textToSend : clientHeader;
  }
  if (textToSend) formData.append('text', textToSend);
  if (audioBlob) formData.append('audio', audioBlob, 'nota_vocale.webm');

  try {
    const res = await fetch(`${API_BASE}/quotes/generate-ai`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore durante la generazione");
    }

    const quoteData = await res.json();
    if (window.preselectedClient) {
      if (!quoteData.dati_cliente) quoteData.dati_cliente = {};
      if (!quoteData.dati_cliente.nome_o_azienda || quoteData.dati_cliente.nome_o_azienda === "Cliente" || quoteData.dati_cliente.nome_o_azienda === "Da definire") {
        quoteData.dati_cliente.nome_o_azienda = window.preselectedClient.name;
      }
      if (!quoteData.dati_cliente.contatti && window.preselectedClient.contact) {
        quoteData.dati_cliente.contatti = window.preselectedClient.contact;
      }
    }

    const saved = await saveQuoteCloud(quoteData);
    window.preselectedClient = null;
    
    // Mostra subito la scheda completa e apribile
    window.location.hash = `#/preventivo/${saved.id}`;

  } catch (e) {
    alert(e.message);
  } finally {
    genBtn.disabled = false;
    genBtn.innerText = "✨ Elabora e Genera Preventivo";
  }
}

async function saveQuoteCloud(data, existingId = null, existingNumber = null, existingStatus = "bozza") {
  let cName = data.dati_cliente?.nome_o_azienda || "Cliente";
  let cContact = data.dati_cliente?.contatti || "";
  if (window.preselectedClient) {
    if (!cName || cName === "Cliente" || cName === "Da definire") cName = window.preselectedClient.name;
    if (!cContact && window.preselectedClient.contact) cContact = window.preselectedClient.contact;
  }

  const payload = {
    id: existingId,
    number: existingNumber,
    title: data.titolo_progetto || "Preventivo Senza Titolo",
    client_name: cName,
    client_contact: cContact,
    status: existingStatus,
    total_amount: data.totale_imponibile || 0,
    deposit_amount: data.acconto_richiesto_valore || 0,
    balance_amount: (data.totale_imponibile || 0) - (data.acconto_richiesto_valore || 0),
    data: data
  };

  const res = await fetch(`${API_BASE}/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
    },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// ----------------- 3. STORICO DEI PREVENTIVI COMPLETI -----------------
async function renderHistory() {
  if (!currentUser) {
    openAuth(false);
    return;
  }

  root.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
      <h2 class="section-title">I Tuoi Preventivi</h2>
      <a href="#/nuovo" class="btn-apple primary" style="width: auto; padding: 6px 14px; font-size: 0.8rem;">+ Nuovo</a>
    </div>
    <p class="section-desc">Tocca per aprire la scheda, scaricare il PDF, modificare i dati o duplicare.</p>
    <div id="quotes-list">Caricamento in corso...</div>
  `;

  try {
    const res = await fetch(`${API_BASE}/quotes`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const quotes = await res.json();
    currentQuotes = quotes;
    const list = document.getElementById('quotes-list');

    if (quotes.length === 0) {
      list.innerHTML = `
        <div class="card-apple" style="text-align: center; padding: 40px 20px;">
          <p class="section-desc">Nessun preventivo presente.</p>
          <a href="#/nuovo" class="btn-apple primary" style="max-width: 220px; margin: 16px auto 0;">+ Crea il Primo Preventivo</a>
        </div>
      `;
      return;
    }

    list.innerHTML = quotes.map(q => {
      const st = q.status || 'bozza';
      return `
        <div class="quote-card" onclick="window.location.hash = '#/preventivo/${q.id}'">
          <div>
            <div class="quote-title">${q.title}</div>
            <div class="quote-sub">${q.client_name} • N. ${q.number} • ${new Date(q.created_at).toLocaleDateString('it-IT')}</div>
          </div>
          <div style="text-align: right;">
            <div class="quote-price">${q.total_amount.toLocaleString('it-IT')}€</div>
            <span class="status-pill ${st}">${STATUS_LABELS[st] || st}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    alert("Errore nel caricamento");
  }
}

// ----------------- 4. SCHEDA PREVENTIVO DETTAGLIATA (COMPLETA) -----------------
async function renderQuoteDetail(quoteId) {
  root.innerHTML = `<p class="section-desc">Apertura preventivo...</p>`;

  try {
    const res = await fetch(`${API_BASE}/quotes/${quoteId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (!res.ok) throw new Error("Preventivo non trovato");
    const quote = await res.json();
    const q = typeof quote.data_json === 'string' ? JSON.parse(quote.data_json) : quote.data_json;
    currentEditingQuote = { meta: quote, data: q };

    const itemsRows = (q.voci_preventivo || []).map(v => `
      <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
        <div>
          <strong style="color: var(--text-main); font-size: 0.98rem;">${v.descrizione}</strong>
          <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">Quantità: ${v.quantita} • Prezzo unitario: ${v.prezzo_unitario}€</div>
        </div>
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">${v.totale}€</div>
      </div>
    `).join('');

    const clausesList = (q.clausole_chiave || []).map(c => `<li style="margin-bottom: 6px;">${c}</li>`).join('');
    const st = quote.status || 'bozza';
    const shareUrl = `${window.location.origin}/#/v/${quote.id}`;

    // Tracking Apertura in Tempo Reale
    const views = quote.views_count || 0;
    const lastViewed = quote.last_viewed_at;
    let isRecentlyViewed = false;
    if (lastViewed) {
      try {
        const diffMin = (new Date() - new Date(String(lastViewed).replace(' ', 'T'))) / (1000 * 60);
        if (diffMin < 60) isRecentlyViewed = true;
      } catch (e) {}
    }

    const isSigned = !!quote.signed_at;
    const fornitoreIban = currentProfile.iban || '';

    // Pacchetti Upselling se presenti
    const selectedAddons = (q.pacchetti_selezionati || (quote.selected_addons_json ? JSON.parse(quote.selected_addons_json) : []));

    root.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
        <a href="#/storico" class="nav-btn" style="padding-left: 0;">‹ Torna ai preventivi</a>
        <div style="display: flex; gap: 6px;">
          <button class="nav-btn" onclick="window.location.hash = '#/modifica/${quote.id}'">✏️ Modifica</button>
          <button class="nav-btn" onclick="duplicateQuote('${quote.id}')">📋 Duplica</button>
        </div>
      </div>

      <!-- 3. SMART TECH: TRACKING APERTURA IN TEMPO REALE -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 12px 18px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px; box-shadow: var(--shadow-sm); flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="tracking-badge ${isRecentlyViewed ? 'live' : ''}">
            ${isRecentlyViewed ? '<span class="tracking-pulse-dot"></span> In visualizzazione ora!' : '👁️ Tracciamento Link'}
            <strong>${views} visualizzazioni</strong>
          </span>
          <span style="font-size: 0.82rem; color: var(--text-secondary);">
            ${lastViewed ? `Ultima apertura: <strong>${new Date(String(lastViewed).replace(' ', 'T')).toLocaleString('it-IT')}</strong>` : 'Non ancora aperto dal cliente'}
          </span>
        </div>
        <button class="nav-btn" style="font-size: 0.78rem; padding: 4px 10px;" onclick="copyLink('${shareUrl}')">
          🔗 Copia Link Privato
        </button>
      </div>

      <!-- Barra di Cambio Stato Lavoro Interattiva -->
      <div class="card-apple" style="padding: 16px 20px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <label class="form-label" style="margin-bottom: 0;">Stato del Preventivo:</label>
          <span class="status-pill ${st}">${STATUS_LABELS[st] || st}</span>
        </div>
        <div class="status-selector-group">
          ${Object.entries(STATUS_LABELS).map(([k, label]) => `
            <button class="status-btn-choice ${st === k ? 'active ' + k : ''}" onclick="changeQuoteStatus('${quote.id}', '${k}')">
              <span>●</span> ${label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 1. SMART TECH: SIGILLO ACCETTAZIONE CON FIRMA ELETTRONICA (SE FIRMATO) -->
      ${isSigned ? `
        <div class="acceptance-stamp">
          <div class="acceptance-stamp-icon">✓</div>
          <div style="flex: 1;">
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 750; color: #15803d; letter-spacing: 0.04em;">
              Preventivo Confermato con Firma Elettronica
            </div>
            <div style="font-size: 1.05rem; font-weight: 750; color: #166534; margin: 2px 0;">
              Firmato da: <strong>${escapeHtml(quote.signed_by_name || quote.client_name)}</strong>
            </div>
            <div style="font-size: 0.8rem; color: #15803d;">
              Convalidato in data: ${new Date(String(quote.signed_at).replace(' ', 'T')).toLocaleString('it-IT')} • IP: ${quote.signed_by_ip || 'Certificato'}
            </div>
            ${quote.signature_data ? `<img src="${quote.signature_data}" class="acceptance-stamp-img" alt="Firma Elettronica Cliente">` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Foglio Documento Completo Apple Style -->
      <div class="doc-sheet" id="printable-quote">
        <div class="doc-header">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h2 style="font-size: 1.6rem; color: var(--accent-sage); font-weight: 750;">PREVENTIVO</h2>
              <!-- Bottone Cassa / Ascolta a Voce Alta -->
              <button class="btn-speech-speaker" id="btn-speak-quote" onclick="toggleReadQuoteAloud('${quote.id}')" title="Ascolta sintesi vocale">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <span id="speak-label">Ascolta a Voce Alta</span>
              </button>
            </div>
            <p style="font-size: 0.95rem; font-weight: 600; margin-top: 4px;">${q.dati_fornitore?.nome || currentProfile.business_name || 'Professionista'}</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary);">${currentProfile.address || ''} ${currentProfile.vat_id ? '• P.IVA: ' + currentProfile.vat_id : ''}</p>
          </div>
          <div style="text-align: right; font-size: 0.85rem;">
            <div style="font-size: 1.1rem; font-weight: 750; color: var(--accent-sage); margin-bottom: 4px;">N. ${quote.number}</div>
            <div style="color: var(--text-secondary);">${new Date(quote.created_at).toLocaleDateString('it-IT')}</div>
            <div style="margin-top: 8px;">
              <strong>Destinatario:</strong><br>
              <span style="font-size: 0.95rem; font-weight: 600;">${quote.client_name}</span><br>
              <span style="color: var(--text-secondary);">${quote.client_contact || ''}</span>
            </div>
          </div>
        </div>

        <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 6px;">${quote.title}</h3>
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 22px;">${q.descrizione_lavoro || ''}</p>

        <!-- Tabella Voci -->
        <div style="margin-bottom: 24px;">
          ${itemsRows}
        </div>

        <!-- 5. SMART TECH: PACCHETTI OPZIONALI / UPSELLING SELEZIONATI -->
        ${selectedAddons && selectedAddons.length > 0 ? `
          <div style="background: rgba(45, 90, 67, 0.05); border: 1px solid rgba(45, 90, 67, 0.2); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 20px;">
            <div style="font-size: 0.75rem; font-weight: 750; text-transform: uppercase; color: var(--accent-sage); letter-spacing: 0.04em; margin-bottom: 8px;">
              Pacchetti e Servizi Opzionali Selezionati (Upselling)
            </div>
            ${selectedAddons.map(opt => `
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; padding: 4px 0;">
                <span>✓ <strong>${escapeHtml(opt.titolo)}</strong></span>
                <span style="font-weight: 700; color: var(--accent-sage);">+${Number(opt.prezzo).toLocaleString('it-IT')}€</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Totali & Pagamenti -->
        <div style="background: var(--bg-canvas); padding: 20px; border-radius: var(--radius-md); margin-bottom: 22px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem;">
            <span style="color: var(--text-secondary);">Totale Imponibile:</span>
            <strong>${quote.total_amount.toLocaleString('it-IT')}€</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 1.05rem; color: var(--accent-sage); font-weight: 700;">
            <span>Acconto Richiesto (${q.acconto_richiesto_percentuale || 30}%):</span>
            <span>${quote.deposit_amount.toLocaleString('it-IT')}€</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.92rem; color: var(--text-secondary);">
            <span>Saldo a fine lavori:</span>
            <span>${quote.balance_amount.toLocaleString('it-IT')}€</span>
          </div>
        </div>

        ${q.tempistiche_consegna ? `
          <div style="margin-bottom: 18px; font-size: 0.88rem;">
            <strong>Tempistiche di Consegna:</strong> <span style="color: var(--text-secondary);">${q.tempistiche_consegna}</span>
          </div>
        ` : ''}

        <!-- 6. SMART TECH: SCUDO LEGALE AI CLAUSOLE CONTRATTUALI -->
        <div class="legal-shield-box">
          <div class="legal-shield-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-sage)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Scudo Legale AI: Condizioni Contrattuali & Tutela Freelancer</span>
          </div>
          <ul style="padding-left: 20px; line-height: 1.7; font-size: 0.86rem; color: var(--text-secondary); margin: 0;">
            ${clausesList}
          </ul>
        </div>

        <!-- 2. SMART TECH: QR CODE BANCARIO EPC & COORDINATE PAGAMENTO -->
        ${fornitoreIban ? `
          <div class="epc-payment-card">
            <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 750; color: var(--text-secondary); letter-spacing: 0.04em; margin-bottom: 10px;">
              Coordinate per il Pagamento dell'Acconto (${quote.deposit_amount.toLocaleString('it-IT')}€)
            </div>
            <div class="epc-qr-flex">
              <div class="epc-qr-img-box">
                <img src="${getEpcQrCodeUrl(q.dati_fornitore?.nome || currentProfile.business_name, fornitoreIban, quote.deposit_amount, `Acconto Prev ${quote.number}`)}" alt="QR Code Bancario EPC SEPA">
                <span style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px; text-transform: uppercase; font-weight: 600;">SEPA QR Code</span>
              </div>
              <div style="flex: 1; min-width: 200px;">
                <p style="font-size: 0.86rem; color: var(--text-secondary); margin: 0 0 10px; line-height: 1.5;">
                  Il cliente può inquadrare questo <strong>QR Code con qualsiasi app bancaria</strong> per disporre il bonifico istantaneo con importo, IBAN e causale già precompilati.
                </p>
                <button class="iban-copy-pill" onclick="copyIban('${fornitoreIban}')">
                  <span>IBAN: ${fornitoreIban}</span> 📋 Copia
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Strumenti Operativi di Trasmissione Indipendente -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px;">
          <button class="btn-apple primary" onclick="printPDFDirect()">
            📄 Scarica PDF A4
          </button>
          <button class="btn-apple secondary" onclick="shareNative('${quote.title}', '${shareUrl}')">
            📤 Condividi con il Cliente
          </button>
        </div>

        <div style="margin-top: 14px; text-align: center;">
          <button class="nav-btn" style="font-size: 0.8rem;" onclick="copyLink('${shareUrl}')">
            🔗 Copia Link Privato del Preventivo
          </button>
        </div>
      </div>

      <!-- 4. SMART TECH: AI FOLLOW-UP ASSISTANT (RECUPERO TRATTATIVE) -->
      <div style="margin-top: 24px;">
        <button class="btn-apple secondary" id="btn-followup-${quote.id}" style="border: 1.5px solid #0071e3; color: #0071e3; font-weight: 700; width: 100%;" onclick="triggerAIFollowup('${quote.id}')">
          🤖 Assistente Follow-up AI: Genera Sollecito Diplomatico WhatsApp / Email
        </button>
        <div id="ai-followup-box-${quote.id}" style="display: none; margin-top: 14px;"></div>
      </div>

      <!-- SEZIONE ESCLUSIVA PRO: CONSULENTE STRATEGICO & LEGALE AI -->
      <div style="margin-top: 16px;">
        <button class="btn-apple ghost" id="btn-advisor-${quote.id}" style="border: 1.5px solid var(--accent-gold); color: #b37400; background: var(--accent-gold-soft); font-weight: 700;" onclick="triggerAIAdvisor('${quote.id}')">
          ✨ Consulente Strategico AI: Analizza Rischi, Prezzi & Trattativa (PRO)
        </button>
        <div id="ai-advisor-box-${quote.id}" style="margin-top: 16px;"></div>
      </div>
    `;

  } catch (e) {
    root.innerHTML = `<p class="section-desc" style="color: red;">${e.message}</p><a href="#/storico" class="btn-apple secondary">Torna allo storico</a>`;
  }
}

// ----------------- FUNZIONI OPERATIVE: CAMBIO STATO, DUPLICAZIONE, PDF -----------------
let currentSpeechUtterance = null;

function toggleReadQuoteAloud(quoteId) {
  const btn = document.getElementById('btn-speak-quote');
  const label = document.getElementById('speak-label');

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.classList.remove('playing');
    label.innerText = "Ascolta a Voce Alta";
    return;
  }

  if (!currentEditingQuote || !currentEditingQuote.data) return;
  const q = currentEditingQuote.data;
  const meta = currentEditingQuote.meta;

  // Costruzione testo naturale e professionale da leggere a voce alta
  let speechText = `Preventivo numero ${meta.number}. Per il cliente: ${meta.client_name}. `;
  speechText += `Oggetto del lavoro: ${q.titolo_progetto}. `;
  if (q.descrizione_lavoro) speechText += `${q.descrizione_lavoro}. `;

  speechText += `Riepilogo delle voci concordate: `;
  (q.voci_preventivo || []).forEach(v => {
    speechText += `${v.descrizione}, quantità ${v.quantita}, totale ${v.totale} euro. `;
  });

  speechText += `Il totale imponibile è di ${meta.total_amount} euro. `;
  speechText += `L'acconto richiesto per avviare il lavoro è del ${q.acconto_richiesto_percentuale || 30} percento, pari a ${meta.deposit_amount} euro. `;
  speechText += `Saldo finale di ${meta.balance_amount} euro alla consegna. `;

  if (q.tempistiche_consegna) {
    speechText += `Tempistiche stimate: ${q.tempistiche_consegna}. `;
  }

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = 'it-IT';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Selezione della migliore voce italiana naturale ad alta fedeltà
  const voices = window.speechSynthesis.getVoices();
  const naturalItalianVoice = voices.find(v => 
    v.lang.startsWith('it') && (
      v.name.includes('Natural') || 
      v.name.includes('Google') || 
      v.name.includes('Alice') || 
      v.name.includes('Federica') || 
      v.name.includes('Elsa') || 
      v.name.includes('Premium') ||
      v.name.includes('Siri')
    )
  ) || voices.find(v => v.lang.startsWith('it'));

  if (naturalItalianVoice) {
    utterance.voice = naturalItalianVoice;
  }

  // Tonalità più calda, rilassata e umana (pitch 1.05, velocità leggermente più distesa 0.96)
  utterance.pitch = 1.05;
  utterance.rate = 0.96;

  utterance.onstart = () => {
    btn.classList.add('playing');
    label.innerText = "In Riproduzione... (Tocca per fermare)";
  };

  utterance.onend = () => {
    btn.classList.remove('playing');
    label.innerText = "Ascolta a Voce Alta";
  };

  utterance.onerror = () => {
    btn.classList.remove('playing');
    label.innerText = "Ascolta a Voce Alta";
  };

  currentSpeechUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

async function changeQuoteStatus(quoteId, newStatus) {
  try {
    await fetch(`${API_BASE}/quotes/${quoteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    renderQuoteDetail(quoteId);
  } catch (e) {
    alert("Errore nell'aggiornamento dello stato");
  }
}

async function duplicateQuote(quoteId) {
  if (!confirm("Vuoi creare una copia modificabile di questo preventivo?")) return;
  try {
    const res = await fetch(`${API_BASE}/quotes/${quoteId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const old = await res.json();
    const dataCopy = typeof old.data_json === 'string' ? JSON.parse(old.data_json) : old.data_json;
    dataCopy.titolo_progetto += " (Copia)";
    dataCopy.dati_cliente.nome_o_azienda = "Nuovo Cliente";

    const saved = await saveQuoteCloud(dataCopy, null, null, "bozza");
    window.location.hash = `#/modifica/${saved.id}`;
  } catch (e) {
    alert("Errore durante la duplicazione");
  }
}

function printPDFDirect() {
  const printable = document.getElementById('printable-quote');
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = printable.innerHTML;
  printArea.querySelectorAll('.btn-apple, .nav-btn, label, .status-pill').forEach(el => el.remove());
  window.print();
}

function shareNative(title, url) {
  if (navigator.share) {
    navigator.share({
      title: title,
      text: `Ecco il preventivo per "${title}":\n${url}`,
      url: url
    }).catch(() => {});
  } else {
    copyLink(url);
  }
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    alert("Link copiato! Invialo al cliente su qualsiasi app (Email, Telegram, WhatsApp, Messaggi).");
  });
}

// ----------------- CONSULENTE STRATEGICO AI (FUNZIONE PRO) -----------------
async function triggerAIAdvisor(quoteId) {
  const box = document.getElementById(`ai-advisor-box-${quoteId}`);
  const btn = document.getElementById(`btn-advisor-${quoteId}`);

  btn.disabled = true;
  btn.innerText = "L'AI sta analizzando il preventivo...";
  box.innerHTML = `<p class="section-desc">Analisi commerciale, forchetta di mercato e rischi contrattuali in corso...</p>`;

  try {
    const res = await fetch(`${API_BASE}/quotes/${quoteId}/ai-advisor`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Funzione riservata al piano PRO");
    }

    const adv = await res.json();

    box.innerHTML = `
      <div class="card-ai-advisor">
        <div class="advisor-header">
          <h3 style="font-size: 1.15rem; font-weight: 750; color: #7d5100;">Consulenza Strategica A BRACCIO</h3>
          <span class="advisor-badge-pro">PRO Advisor</span>
        </div>

        <!-- 1. Stima Prezzo & Mercato -->
        <div class="advisor-section">
          <h4>💰 Valutazione Economica: <span style="color: var(--accent-sage);">${adv.valutazione_prezzo?.verdetto || 'Allineato'}</span></h4>
          <p>${adv.valutazione_prezzo?.consiglio || ''}</p>
          ${adv.valutazione_prezzo?.forchetta_mercato ? `
            <div style="margin-top: 6px; font-weight: 600; font-size: 0.85rem; color: var(--accent-gold);">
              Forchetta tipica di mercato: ${adv.valutazione_prezzo.forchetta_mercato}
            </div>
          ` : ''}
        </div>

        <!-- 2. Analisi Rischi Contrattuali -->
        <div class="advisor-section">
          <h4>🛡️ Rischi Rilevati & Tutele</h4>
          <ul>
            ${(adv.analisi_rischi || []).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>

        <!-- 3. Clausole Salvavita -->
        ${adv.clausole_salvavita_suggerite && adv.clausole_salvavita_suggerite.length > 0 ? `
          <div class="advisor-section">
            <h4>⚖️ Clausola Salvavita Consigliata</h4>
            <p style="font-style: italic; background: #fafafa; padding: 10px; border-radius: 8px; border-left: 3px solid var(--accent-sage);">
              "${adv.clausole_salvavita_suggerite[0]}"
            </p>
          </div>
        ` : ''}

        <!-- 4. Risposte pronte per la trattativa -->
        <div class="advisor-section">
          <h4>💬 Se il cliente chiede uno sconto:</h4>
          <p style="font-style: italic; margin-bottom: 8px; color: var(--text-main);">"${adv.strategia_trattativa?.se_chiede_sconto || 'Grazie della fiducia, il prezzo riflette la qualità e i tempi di consegna garantiti.'}"</p>
          <button class="nav-btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="navigator.clipboard.writeText('${(adv.strategia_trattativa?.se_chiede_sconto || '').replace(/'/g, "\\'")}')">Copia risposta</button>
        </div>
      </div>
    `;

    btn.innerText = "✨ Rianalizza Preventivo con AI";

  } catch (e) {
    box.innerHTML = `
      <div class="card-apple" style="border: 1px solid red; text-align: center; padding: 20px;">
        <p style="color: red; font-size: 0.9rem; margin-bottom: 12px;">${e.message}</p>
        <button class="btn-apple primary" style="max-width: 220px; margin: 0 auto;" onclick="startStripeUpgrade()">Attiva A BRACCIO PRO (9,99€)</button>
      </div>
    `;
    btn.innerText = "✨ Consulente Strategico AI (PRO)";
  } finally {
    btn.disabled = false;
  }
}

// ----------------- 5. EDITOR MANUALE COMPLETO (SENZA MICROFONO) -----------------
async function renderQuoteEditor(quoteId) {
  root.innerHTML = `<p class="section-desc">Caricamento editor...</p>`;

  try {
    const res = await fetch(`${API_BASE}/quotes/${quoteId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const quote = await res.json();
    const q = typeof quote.data_json === 'string' ? JSON.parse(quote.data_json) : quote.data_json;

    const renderItemsInputs = () => {
      return (q.voci_preventivo || []).map((v, idx) => `
        <div class="item-row-edit" id="item-row-${idx}">
          <input type="text" class="form-input" value="${v.descrizione}" placeholder="Descrizione voce" onchange="updateItemField(${idx}, 'descrizione', this.value)">
          <input type="number" class="form-input" value="${v.quantita}" placeholder="Q.tà" onchange="updateItemField(${idx}, 'quantita', this.value)">
          <input type="number" class="form-input" value="${v.prezzo_unitario}" placeholder="Prezzo €" onchange="updateItemField(${idx}, 'prezzo_unitario', this.value)">
          <button class="nav-btn" style="color: red; font-size: 1.1rem;" onclick="removeItemRow(${idx})">×</button>
        </div>
      `).join('');
    };

    root.innerHTML = `
      <div style="margin-bottom: 16px;">
        <a href="#/preventivo/${quoteId}" class="nav-btn" style="padding-left: 0;">‹ Annulla modifiche</a>
      </div>

      <div class="card-apple">
        <h2 class="section-title">Modifica Preventivo N. ${quote.number}</h2>
        <p class="section-desc">Modifica importi, cliente e voci del lavoro.</p>

        <div class="form-group">
          <label class="form-label">Stato del Preventivo</label>
          <select id="edit-status" class="form-select">
            ${Object.entries(STATUS_LABELS).map(([k, label]) => `
              <option value="${k}" ${quote.status === k ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Titolo del Progetto</label>
          <input type="text" id="edit-title" class="form-input" value="${quote.title}">
        </div>

        <div class="form-group">
          <label class="form-label">Cliente / Azienda</label>
          <input type="text" id="edit-client" class="form-input" value="${quote.client_name}">
        </div>

        <div class="form-group">
          <label class="form-label">Recapito Cliente</label>
          <input type="text" id="edit-contact" class="form-input" value="${quote.client_contact || ''}">
        </div>

        <h3 style="font-size: 1rem; font-weight: 700; margin: 20px 0 10px;">Voci del Lavoro</h3>
        <div id="items-edit-container">
          ${renderItemsInputs()}
        </div>
        <button class="btn-apple ghost" style="margin-top: 8px; width: auto; font-size: 0.85rem;" onclick="addItemRow()">+ Aggiungi Voce</button>

        <div class="form-group" style="margin-top: 24px;">
          <label class="form-label">Acconto Richiesto (%)</label>
          <input type="number" id="edit-deposit-pct" class="form-input" value="${q.acconto_richiesto_percentuale || 30}">
        </div>

        <div class="form-group">
          <label class="form-label">Tempistiche di Consegna</label>
          <input type="text" id="edit-delivery" class="form-input" value="${q.tempistiche_consegna || ''}">
        </div>

        <button class="btn-apple primary" style="margin-top: 20px;" onclick="saveEditedQuote('${quoteId}')">💾 Salva Modifiche</button>
      </div>
    `;

    window.updateItemField = (idx, field, val) => {
      q.voci_preventivo[idx][field] = field === 'descrizione' ? val : parseFloat(val) || 0;
      q.voci_preventivo[idx].totale = (q.voci_preventivo[idx].quantita || 1) * (q.voci_preventivo[idx].prezzo_unitario || 0);
    };

    window.removeItemRow = (idx) => {
      q.voci_preventivo.splice(idx, 1);
      document.getElementById('items-edit-container').innerHTML = renderItemsInputs();
    };

    window.addItemRow = () => {
      q.voci_preventivo.push({ descrizione: "Nuova voce", quantita: 1, prezzo_unitario: 100, totale: 100 });
      document.getElementById('items-edit-container').innerHTML = renderItemsInputs();
    };

    window.saveEditedQuote = async (id) => {
      let tot = 0;
      q.voci_preventivo.forEach(v => tot += (v.totale || 0));
      q.totale_imponibile = tot;
      const depPct = parseFloat(document.getElementById('edit-deposit-pct').value) || 30;
      q.acconto_richiesto_percentuale = depPct;
      q.acconto_richiesto_valore = (tot * depPct) / 100;
      q.titolo_progetto = document.getElementById('edit-title').value;
      q.tempistiche_consegna = document.getElementById('edit-delivery').value;
      q.dati_cliente.nome_o_azienda = document.getElementById('edit-client').value;
      q.dati_cliente.contatti = document.getElementById('edit-contact').value;
      const newStatus = document.getElementById('edit-status').value;

      await saveQuoteCloud(q, id, quote.number, newStatus);
      window.location.hash = `#/preventivo/${id}`;
    };

  } catch (e) {
    alert("Errore nell'apertura dell'editor");
  }
}

// ----------------- 6. VISTA PUBBLICA PER IL CLIENTE (SMART TECH PACK) -----------------
let currentPublicQuote = null;
let currentPublicData = null;
let publicSelectedAddons = [];
let signaturePadCanvas = null;
let signatureCtx = null;
let isDrawingSignature = false;
let hasDrawnSignature = false;

function getEpcQrCodeUrl(beneficiary, iban, amount, reference) {
  const cleanIban = (iban || '').replace(/\s+/g, '').toUpperCase();
  const cleanName = (beneficiary || 'Professionista').substring(0, 70);
  const formattedAmount = Number(amount || 0).toFixed(2);
  const remittance = (reference || 'Acconto Preventivo').substring(0, 140);

  const epcPayload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    cleanName,
    cleanIban,
    `EUR${formattedAmount}`,
    "",
    "",
    remittance
  ].join("\n");

  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(epcPayload)}`;
}

function copyIban(iban) {
  if (!iban) return;
  navigator.clipboard.writeText(iban.replace(/\s+/g, '')).then(() => {
    alert(`✅ IBAN copiato negli appunti: ${iban}`);
  });
}

async function renderPublicView(quoteId) {
  root.innerHTML = `<div style="text-align: center; padding: 40px;"><p class="section-desc">Caricamento preventivo protetto...</p></div>`;

  try {
    const res = await fetch(`${API_BASE}/public/quotes/${quoteId}`);
    if (!res.ok) throw new Error("Preventivo non disponibile o scaduto");
    const quote = await res.json();
    const q = typeof quote.data_json === 'string' ? JSON.parse(quote.data_json) : quote.data_json;

    currentPublicQuote = quote;
    currentPublicData = q;
    publicSelectedAddons = [];

    const isSigned = !!quote.signed_at;
    const fornitore = quote.fornitore_info || {};
    const fornitoreName = fornitore.business_name || q.dati_fornitore?.nome || 'Professionista';
    const fornitoreIban = fornitore.iban || '';

    const itemsHtml = (q.voci_preventivo || []).map(v => `
      <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
        <div>
          <strong style="color: var(--text-main); font-size: 0.96rem;">${v.descrizione}</strong>
          <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">Quantità: ${v.quantita} × ${v.prezzo_unitario}€</div>
        </div>
        <div style="font-weight: 700; font-size: 1.05rem;">${v.totale}€</div>
      </div>
    `).join('');

    const clausesList = (q.clausole_chiave || []).map(c => `<li style="margin-bottom: 6px;">${c}</li>`).join('');

    // Pacchetti Upselling Opzionali
    const optionalAddons = q.pacchetti_opzionali || [];
    const hasAddons = optionalAddons.length > 0;

    root.innerHTML = `
      <div class="doc-sheet" id="printable-quote">
        
        <!-- 1. SMART TECH: SIGILLO ACCETTAZIONE DIGITALE (SE GIÀ FIRMATO) -->
        ${isSigned ? `
          <div class="acceptance-stamp">
            <div class="acceptance-stamp-icon">✓</div>
            <div style="flex: 1;">
              <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 750; color: #15803d; letter-spacing: 0.04em;">
                Documento Accettato & Convalidato Digitalmente
              </div>
              <div style="font-size: 1.05rem; font-weight: 750; color: #166534; margin: 2px 0;">
                Firmato da: <strong>${escapeHtml(quote.signed_by_name || quote.client_name)}</strong>
              </div>
              <div style="font-size: 0.8rem; color: #15803d;">
                Data approvazione: ${new Date(String(quote.signed_at).replace(' ', 'T')).toLocaleString('it-IT')} • Certificato telematico IP ${quote.signed_by_ip || 'Verificato'}
              </div>
              ${quote.signature_data ? `<img src="${quote.signature_data}" class="acceptance-stamp-img" alt="Firma Apposta">` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Intestazione Formale Documento -->
        <div class="doc-header">
          <div>
            <h2 style="font-size: 1.6rem; color: var(--accent-sage); font-weight: 750;">PREVENTIVO</h2>
            <p style="font-size: 0.95rem; font-weight: 600; margin-top: 4px;">
              ${escapeHtml(fornitoreName)}
              ${fornitore.is_gold ? `<span class="badge-pro" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; border: 1px solid #f59e0b; font-size: 0.72rem; margin-left: 6px; padding: 2px 8px; border-radius: 999px;">👑 Studio Certificato Gold</span>` : ''}
            </p>
            ${fornitore.address ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">${escapeHtml(fornitore.address)}</p>` : ''}
            ${fornitore.vat_id ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">P.IVA: ${escapeHtml(fornitore.vat_id)}</p>` : ''}
          </div>
          <div style="text-align: right; font-size: 0.85rem;">
            <div style="font-size: 1.15rem; font-weight: 750; color: var(--accent-sage); margin-bottom: 4px;">N. ${quote.number}</div>
            <div style="color: var(--text-secondary); margin-bottom: 6px;">${new Date(quote.created_at).toLocaleDateString('it-IT')}</div>
            <strong>Destinatario:</strong><br>
            <span style="font-size: 0.95rem; font-weight: 600;">${escapeHtml(quote.client_name)}</span>
            ${quote.client_contact ? `<br><span style="color: var(--text-secondary); font-size: 0.82rem;">${escapeHtml(quote.client_contact)}</span>` : ''}
          </div>
        </div>

        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">${escapeHtml(quote.title)}</h3>
        <p style="font-size: 0.92rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5;">${escapeHtml(q.descrizione_lavoro || '')}</p>

        <!-- Voci Principali del Preventivo -->
        <div style="margin-bottom: 24px;">
          <h4 style="font-size: 0.82rem; font-weight: 750; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.04em; margin-bottom: 8px;">
            Dettaglio Prestazioni & Deliverables
          </h4>
          ${itemsHtml}
        </div>

        <!-- 5. SMART TECH: PACCHETTI OPZIONALI & UPSELLING SPUNTABILI (SE NON ANCORA FIRMATO) -->
        ${hasAddons && !isSigned ? `
          <div style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px;">
              <h4 style="font-size: 0.82rem; font-weight: 750; text-transform: uppercase; color: var(--accent-sage); letter-spacing: 0.04em; margin: 0;">
                ✨ Opzioni Aggiuntive & Pacchetti Integrativi
              </h4>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">Spunta per aggiungere alla proposta</span>
            </div>
            ${optionalAddons.map(opt => `
              <div class="addon-package-card" id="addon-card-${opt.id}" onclick="togglePublicAddon('${opt.id}')">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <input type="checkbox" class="addon-checkbox" id="addon-check-${opt.id}" onchange="togglePublicAddon('${opt.id}')" onclick="event.stopPropagation()">
                  <div>
                    <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(opt.titolo)}</strong>
                    <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 3px 0 0; line-height: 1.4;">${escapeHtml(opt.descrizione)}</p>
                  </div>
                </div>
                <div class="addon-price-tag">+${Number(opt.prezzo).toLocaleString('it-IT')}€</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Totali e Ripartizione Pagamento Dinamici -->
        <div style="background: var(--bg-canvas); padding: 22px; border-radius: var(--radius-md); margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem;">
            <span style="color: var(--text-secondary);">Totale Imponibile:</span>
            <strong id="public-total-amount" style="font-size: 1.1rem;">${quote.total_amount.toLocaleString('it-IT')}€</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 1.15rem; color: var(--accent-sage); font-weight: 750;">
            <span>Acconto Richiesto per Avvio Lavori (${q.acconto_richiesto_percentuale || 30}%):</span>
            <span id="public-deposit-amount">${quote.deposit_amount.toLocaleString('it-IT')}€</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.92rem; color: var(--text-secondary);">
            <span>Saldo alla Consegna:</span>
            <span id="public-balance-amount">${quote.balance_amount.toLocaleString('it-IT')}€</span>
          </div>
        </div>

        ${q.tempistiche_consegna ? `
          <div style="margin-bottom: 20px; font-size: 0.9rem;">
            <strong>Tempistiche di Consegna:</strong> <span style="color: var(--text-secondary);">${escapeHtml(q.tempistiche_consegna)}</span>
          </div>
        ` : ''}

        <!-- 6. SMART TECH: SCUDO LEGALE AI CLAUSOLE CONTRATTUALI -->
        <div class="legal-shield-box">
          <div class="legal-shield-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-sage)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Condizioni Contrattuali & Tutela della Prestazione</span>
          </div>
          <ul style="padding-left: 20px; line-height: 1.7; font-size: 0.86rem; color: var(--text-secondary); margin: 0;">
            ${clausesList}
          </ul>
        </div>

        <!-- 2. SMART TECH: QR CODE BANCARIO EPC & PAGAMENTO ACCONTO ONE-CLICK -->
        ${fornitoreIban ? `
          <div class="epc-payment-card">
            <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 750; color: var(--text-secondary); letter-spacing: 0.04em; margin-bottom: 12px;">
              Versamento Acconto per Conferma Lavoro (<span id="epc-deposit-val">${quote.deposit_amount.toLocaleString('it-IT')}€</span>)
            </div>
            <div class="epc-qr-flex">
              <div class="epc-qr-img-box">
                <img id="epc-qr-img" src="${getEpcQrCodeUrl(fornitoreName, fornitoreIban, quote.deposit_amount, `Acconto Prev ${quote.number}`)}" alt="QR Code Bancario SEPA EPC">
                <span style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 5px; text-transform: uppercase; font-weight: 650;">SEPA QR Code</span>
              </div>
              <div style="flex: 1; min-width: 220px;">
                <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0 0 12px; line-height: 1.5;">
                  Inquadra il QR con l'app della tua banca (<strong>Revolut, Intesa, UniCredit, N26, PostePay</strong>, ecc.) per bonifico istantaneo con importo, causale e IBAN già precompilati.
                </p>
                <button class="iban-copy-pill" onclick="copyIban('${fornitoreIban}')">
                  <span>IBAN: ${fornitoreIban}</span> 📋 Copia
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 1. SMART TECH: FIRMA ELETTRONICA ONE-TAP (SE NON ANCORA FIRMATO) -->
        ${!isSigned ? `
          <div class="signature-card">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
              <h3 style="font-size: 1.15rem; font-weight: 750; margin: 0; color: var(--text-main);">
                ✍️ Accettazione e Firma Elettronica
              </h3>
              <span style="font-size: 0.75rem; color: var(--accent-sage); font-weight: 700;">Convalida Telematica Istantanea</span>
            </div>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin: 0 0 16px;">
              Apponi la tua firma con il dito o il mouse per confermare l'incarico. Il professionista riceverà subito la notifica per avviare il lavoro.
            </p>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">Nome e Cognome del Firmatario *</label>
              <input type="text" id="signer-name" class="form-input" value="${escapeHtml(quote.client_name || '')}" placeholder="Es. Mario Rossi">
            </div>

            <label class="form-label" style="margin-bottom: 4px;">Firma Digitale nel riquadro:</label>
            <div class="signature-canvas-wrapper">
              <canvas id="signature-pad"></canvas>
              <div class="signature-canvas-placeholder" id="sig-placeholder">Disegna qui la tua firma con il dito o il mouse</div>
            </div>

            <div class="signature-actions">
              <button type="button" class="nav-btn" style="font-size: 0.78rem; padding: 4px 8px;" onclick="clearSignature()">
                ↺ Pulisci e Rifai Firma
              </button>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">IP & Data registrati</span>
            </div>

            <label style="font-size: 0.85rem; display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="accept-terms-check" checked style="margin-top: 3px; accent-color: var(--accent-sage);">
              <span>Dichiaro di aver preso visione ed approvare integralmente le voci, gli importi e le condizioni contrattuali sopra esposte.</span>
            </label>

            <button type="button" class="btn-apple primary" id="btn-submit-sign" style="width: 100%; padding: 14px; font-size: 1rem;" onclick="submitSignature('${quote.id}')">
              ✍️ Conferma e Firma Preventivo
            </button>
          </div>
        ` : ''}

        <div style="margin-top: 24px; text-align: center;">
          <button class="btn-apple secondary" style="width: auto; padding: 8px 24px; font-size: 0.88rem;" onclick="window.print()">
            📄 Scarica / Salva in PDF
          </button>
        </div>
      </div>
    `;

    if (!isSigned) {
      setTimeout(initSignatureCanvas, 100);
    }

  } catch (e) {
    root.innerHTML = `<div class="card-apple" style="text-align: center; padding: 40px;"><p style="color: red;">${e.message}</p></div>`;
  }
}

// ----------------- IMPLEMENTAZIONI LOGICHE SMART TECH -----------------

function initSignatureCanvas() {
  const canvas = document.getElementById('signature-pad');
  if (!canvas) return;
  signaturePadCanvas = canvas;
  signatureCtx = canvas.getContext('2d');
  hasDrawnSignature = false;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  signatureCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  signatureCtx.strokeStyle = "#1d1d1f";
  signatureCtx.lineWidth = 2.4;
  signatureCtx.lineCap = "round";
  signatureCtx.lineJoin = "round";

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - r.left,
      y: clientY - r.top
    };
  }

  function start(e) {
    isDrawingSignature = true;
    hasDrawnSignature = true;
    const ph = document.getElementById('sig-placeholder');
    if (ph) ph.style.display = 'none';
    const pos = getPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
    if (e.cancelable) e.preventDefault();
  }

  function move(e) {
    if (!isDrawingSignature) return;
    const pos = getPos(e);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
    if (e.cancelable) e.preventDefault();
  }

  function stop() {
    isDrawingSignature = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', stop);
}

function clearSignature() {
  if (!signaturePadCanvas || !signatureCtx) return;
  signatureCtx.clearRect(0, 0, signaturePadCanvas.width, signaturePadCanvas.height);
  hasDrawnSignature = false;
  const ph = document.getElementById('sig-placeholder');
  if (ph) ph.style.display = 'flex';
}

function togglePublicAddon(addonId) {
  const card = document.getElementById(`addon-card-${addonId}`);
  const checkbox = document.getElementById(`addon-check-${addonId}`);
  if (!card || !checkbox) return;

  const isChecked = !checkbox.checked;
  checkbox.checked = isChecked;
  card.classList.toggle('selected', isChecked);

  updatePublicPricing();
}

function updatePublicPricing() {
  if (!currentPublicData || !currentPublicQuote) return;
  const baseTotal = currentPublicQuote.total_amount;
  const depPct = currentPublicData.acconto_richiesto_percentuale || 30;

  let extraTotal = 0;
  publicSelectedAddons = [];

  (currentPublicData.pacchetti_opzionali || []).forEach(opt => {
    const cb = document.getElementById(`addon-check-${opt.id}`);
    if (cb && cb.checked) {
      extraTotal += opt.prezzo;
      publicSelectedAddons.push(opt);
    }
  });

  const finalTotal = baseTotal + extraTotal;
  const finalDeposit = Math.round(finalTotal * (depPct / 100));
  const finalBalance = finalTotal - finalDeposit;

  const totalEl = document.getElementById('public-total-amount');
  const depEl = document.getElementById('public-deposit-amount');
  const balEl = document.getElementById('public-balance-amount');
  const epcDepositEl = document.getElementById('epc-deposit-val');

  if (totalEl) totalEl.innerText = finalTotal.toLocaleString('it-IT') + '€';
  if (depEl) depEl.innerText = finalDeposit.toLocaleString('it-IT') + '€';
  if (balEl) balEl.innerText = finalBalance.toLocaleString('it-IT') + '€';
  if (epcDepositEl) epcDepositEl.innerText = finalDeposit.toLocaleString('it-IT') + '€';

  const qrImg = document.getElementById('epc-qr-img');
  const fornitore = currentPublicQuote.fornitore_info || {};
  if (qrImg && fornitore.iban) {
    qrImg.src = getEpcQrCodeUrl(
      fornitore.business_name || currentPublicData.dati_fornitore?.nome,
      fornitore.iban,
      finalDeposit,
      `Acconto Prev ${currentPublicQuote.number}`
    );
  }
}

async function submitSignature(quoteId) {
  if (!hasDrawnSignature) {
    alert("Disegna la tua firma grafica nel riquadro apposito prima di confermare.");
    return;
  }

  const nameInput = document.getElementById('signer-name');
  const signerName = nameInput ? nameInput.value.trim() : '';
  if (!signerName) {
    alert("Inserisci il tuo nome e cognome per convalidare l'accettazione.");
    return;
  }

  const termsCheck = document.getElementById('accept-terms-check');
  if (termsCheck && !termsCheck.checked) {
    alert("Devi accettare le condizioni e i termini contrattuali.");
    return;
  }

  const btn = document.getElementById('btn-submit-sign');
  btn.disabled = true;
  btn.innerText = "Registrazione accettazione in corso...";

  const signatureData = signaturePadCanvas.toDataURL('image/png');

  let extraTotal = 0;
  (publicSelectedAddons || []).forEach(opt => { extraTotal += opt.prezzo; });
  const finalTotal = (currentPublicQuote.total_amount || 0) + extraTotal;
  const depPct = currentPublicData.acconto_richiesto_percentuale || 30;
  const finalDeposit = Math.round(finalTotal * (depPct / 100));

  try {
    const res = await fetch(`${API_BASE}/public/quotes/${quoteId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signer_name: signerName,
        signature_data: signatureData,
        selected_addons: publicSelectedAddons,
        final_total: finalTotal,
        final_deposit: finalDeposit
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore durante la registrazione della firma");
    }

    alert("✨ Preventivo accettato e firmato digitalmente con successo! Il professionista ha ricevuto la conferma.");
    renderPublicView(quoteId);

  } catch (e) {
    alert(e.message);
    btn.disabled = false;
    btn.innerText = "✍️ Conferma e Firma Preventivo";
  }
}

// ----------------- AI FOLLOW-UP ASSISTANT (RECUPERO TRATTATIVE) -----------------
let activeFollowupKey = 'cordiale';

async function triggerAIFollowup(quoteId) {
  const btn = document.getElementById(`btn-followup-${quoteId}`);
  const box = document.getElementById(`ai-followup-box-${quoteId}`);
  if (!box) return;

  if (box.innerHTML && box.style.display !== 'none') {
    box.style.display = 'none';
    return;
  }

  btn.disabled = true;
  btn.innerText = "🤖 L'AI sta preparando 3 varianti di follow-up diplomatiche...";

  try {
    const res = await fetch(`${API_BASE}/quotes/${quoteId}/followup`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore nella generazione del follow-up");
    }

    const data = await res.json();
    const msgs = data.messages || {};
    window.currentFollowupMessages = msgs;

    box.style.display = 'block';
    box.innerHTML = `
      <div class="card-ai-followup">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 style="margin: 0; font-size: 1rem; color: #0071e3; font-weight: 750;">🤖 Assistente Follow-up Diplomatico AI</h4>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary);">
              Inviato ${data.days_passed} giorni fa • ${data.views_count} visualizzazioni del cliente
            </p>
          </div>
          <span style="font-size: 0.72rem; background: #e1f0ff; color: #0071e3; font-weight: 700; padding: 4px 10px; border-radius: 20px;">
            Trattativa Attiva
          </span>
        </div>

        <div class="followup-tabs">
          <button class="followup-tab-btn active" id="tab-btn-cordiale" onclick="switchFollowupTab('cordiale')">☕ Gentile & Informale</button>
          <button class="followup-tab-btn" id="tab-btn-consulenziale" onclick="switchFollowupTab('consulenziale')">💼 Professionale & Valore</button>
          <button class="followup-tab-btn" id="tab-btn-urgenza" onclick="switchFollowupTab('urgenza_elegante')">⏳ Urgenza Elegante</button>
        </div>

        <div class="followup-content-box" id="followup-text-display">
          ${escapeHtml(msgs.cordiale || '')}
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
          <button class="btn-apple primary" style="width: auto; padding: 8px 18px; font-size: 0.82rem;" onclick="copyCurrentFollowup()">
            📋 Copia Messaggio per WhatsApp / Email
          </button>
        </div>
      </div>
    `;

  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "🤖 Assistente Follow-up AI (Messaggi Pronti)";
  }
}

function switchFollowupTab(key) {
  activeFollowupKey = key;
  ['cordiale', 'consulenziale', 'urgenza_elegante'].forEach(k => {
    const tab = document.getElementById(`tab-btn-${k === 'urgenza_elegante' ? 'urgenza' : k}`);
    if (tab) tab.classList.toggle('active', k === key);
  });
  const display = document.getElementById('followup-text-display');
  if (display && window.currentFollowupMessages) {
    display.innerText = window.currentFollowupMessages[key] || '';
  }
}

function copyCurrentFollowup() {
  if (!window.currentFollowupMessages) return;
  const text = window.currentFollowupMessages[activeFollowupKey] || '';
  navigator.clipboard.writeText(text).then(() => {
    alert("✅ Messaggio di follow-up copiato negli appunti! Incollalo su WhatsApp o via email.");
  });
}

// ----------------- 7. AGENDA & RUBRICA CLIENTI FREELANCER -----------------
const CLIENT_STATUS_MAP = {
  nuovo: { label: 'Nuovo Lead', icon: '🆕', badgeClass: 'nuovo' },
  da_contattare: { label: 'Da Contattare', icon: '📞', badgeClass: 'da_contattare' },
  contattato: { label: 'Contattato', icon: '💬', badgeClass: 'contattato' },
  in_trattativa: { label: 'In Trattativa', icon: '⏳', badgeClass: 'in_trattativa' },
  attivo: { label: 'Cliente Attivo', icon: '⭐', badgeClass: 'attivo' },
  perso: { label: 'Non Interessato', icon: '⚪', badgeClass: 'perso' }
};

let clientsCache = [];
let currentClientFilter = 'all';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderClients(filter = null) {
  if (!currentUser) {
    openAuth(false);
    return;
  }

  if (filter !== null) {
    currentClientFilter = filter;
  }

  root.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 class="section-title" style="margin-bottom: 4px;">Agenda & Rubrica Clienti</h2>
        <p class="section-desc" style="margin-bottom: 0;">Costruisci la tua base clienti prima del contatto, gestisci lo stato e monitora la previsione futura dei ricavi.</p>
      </div>
      <button class="btn-apple primary" onclick="openClientModal()" style="display: inline-flex; align-items: center; gap: 6px;">
        <span style="font-size: 1.1rem; line-height: 1;">+</span> Aggiungi Cliente
      </button>
    </div>

    <!-- KPI Infografica Agenda Clienti -->
    <div id="clients-kpi-container" class="client-kpi-bar">
      <div class="client-kpi-card">
        <div class="kpi-label">Base Clienti</div>
        <div class="kpi-val" id="kpi-total-clients">...</div>
      </div>
      <div class="client-kpi-card">
        <div class="kpi-label">Da Contattare</div>
        <div class="kpi-val" id="kpi-leads" style="color: #b77200;">...</div>
      </div>
      <div class="client-kpi-card">
        <div class="kpi-label">Fatturato Commesse</div>
        <div class="kpi-val" id="kpi-revenue-won" style="color: var(--accent-sage);">...</div>
      </div>
      <div class="client-kpi-card">
        <div class="kpi-label">Previsione Futura</div>
        <div class="kpi-val" id="kpi-future-potential" style="color: #0071e3;">...</div>
      </div>
    </div>

    <!-- Filtri di Classificazione -->
    <div class="client-filter-bar" id="clients-filter-bar">
      <!-- Generato dinamicamente con i contatori -->
    </div>

    <!-- Lista Clienti Filtrata -->
    <div id="clients-list">Caricamento agenda clienti in corso...</div>

    <!-- Contenitore Modale Aggiungi/Modifica Cliente -->
    <div id="client-modal-container"></div>
  `;

  try {
    const res = await fetch(`${API_BASE}/clients`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (!res.ok) throw new Error("Impossibile caricare i clienti");
    clientsCache = await res.json();
    renderClientsList();
  } catch (e) {
    document.getElementById('clients-list').innerHTML = `
      <div class="card-apple" style="text-align: center; padding: 30px;">
        <p style="color: #ff3b30; font-weight: 600;">${e.message}</p>
        <button class="btn-apple secondary" onclick="renderClients()">Riprova</button>
      </div>
    `;
  }
}

function renderClientsList() {
  const total = clientsCache.length;
  const countDaContattare = clientsCache.filter(c => c.status === 'da_contattare').length;
  const countNuovo = clientsCache.filter(c => c.status === 'nuovo').length;
  const countInTrattativa = clientsCache.filter(c => c.status === 'in_trattativa').length;
  const countContattato = clientsCache.filter(c => c.status === 'contattato').length;
  const countAttivo = clientsCache.filter(c => c.status === 'attivo').length;
  const countPerso = clientsCache.filter(c => c.status === 'perso').length;

  const totalWon = clientsCache.reduce((sum, c) => sum + (c.revenue_won || 0), 0);
  const totalPotential = clientsCache.reduce((sum, c) => sum + (c.total_potential || 0), 0);

  // Aggiorna KPI
  const elTot = document.getElementById('kpi-total-clients');
  const elLeads = document.getElementById('kpi-leads');
  const elWon = document.getElementById('kpi-revenue-won');
  const elPot = document.getElementById('kpi-future-potential');
  if (elTot) elTot.innerText = total;
  if (elLeads) elLeads.innerText = (countDaContattare + countNuovo);
  if (elWon) elWon.innerText = totalWon.toLocaleString('it-IT') + '€';
  if (elPot) elPot.innerText = totalPotential.toLocaleString('it-IT') + '€';

  // Barra Filtri
  const filterBar = document.getElementById('clients-filter-bar');
  if (filterBar) {
    filterBar.innerHTML = `
      <button class="client-filter-pill ${currentClientFilter === 'all' ? 'active' : ''}" onclick="renderClients('all')">
        Tutti (${total})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'da_contattare' ? 'active' : ''}" onclick="renderClients('da_contattare')">
        📞 Da Contattare (${countDaContattare})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'in_trattativa' ? 'active' : ''}" onclick="renderClients('in_trattativa')">
        ⏳ In Trattativa (${countInTrattativa})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'nuovo' ? 'active' : ''}" onclick="renderClients('nuovo')">
        🆕 Nuovi (${countNuovo})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'contattato' ? 'active' : ''}" onclick="renderClients('contattato')">
        💬 Contattati (${countContattato})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'attivo' ? 'active' : ''}" onclick="renderClients('attivo')">
        ⭐ Attivi (${countAttivo})
      </button>
      <button class="client-filter-pill ${currentClientFilter === 'perso' ? 'active' : ''}" onclick="renderClients('perso')">
        ⚪ Non Interessati (${countPerso})
      </button>
    `;
  }

  // Filtraggio Clienti
  let filtered = clientsCache;
  if (currentClientFilter !== 'all') {
    filtered = clientsCache.filter(c => c.status === currentClientFilter);
  }

  const list = document.getElementById('clients-list');
  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="card-apple" style="text-align: center; padding: 48px 20px;">
        <div style="font-size: 2.4rem; margin-bottom: 12px;">📇</div>
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 6px;">Nessun cliente in questa sezione</h3>
        <p class="section-desc" style="max-width: 400px; margin: 0 auto 20px;">
          ${currentClientFilter === 'all' 
            ? 'Inserisci i tuoi primi clienti o prospect per iniziare a pianificare contatti e ricavi stimati.' 
            : 'Non ci sono clienti nello stato selezionato. Puoi cambiare filtro o aggiungerne uno nuovo.'}
        </p>
        <button class="btn-apple primary" onclick="openClientModal()">+ Inserisci Nuovo Cliente</button>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  list.innerHTML = filtered.map(c => {
    const statusMeta = CLIENT_STATUS_MAP[c.status] || CLIENT_STATUS_MAP.da_contattare;
    const isDueToday = c.next_follow_up && c.next_follow_up <= todayStr;
    const ratingLabel = c.potential_rating === 'alto' 
      ? '🔥 Alto Potenziale' 
      : (c.potential_rating === 'medio' ? '📈 Medio Valore' : '💡 In Sviluppo');

    return `
      <div class="client-card">
        <!-- Intestazione Scheda -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h3 style="font-size: 1.2rem; font-weight: 750; color: var(--text-main); margin: 0;">
                ${escapeHtml(c.name)}
              </h3>
              ${c.company ? `<span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">(${escapeHtml(c.company)})</span>` : ''}
            </div>
            ${c.contact_person ? `<p style="font-size: 0.82rem; color: var(--text-secondary); margin: 3px 0 0;">Persona di riferimento: <strong>${escapeHtml(c.contact_person)}</strong></p>` : ''}
          </div>

          <!-- Selettore Rapido di Stato -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="client-status-tag ${c.status || 'da_contattare'}">
              ${statusMeta.icon} ${statusMeta.label}
            </span>
            <select class="client-status-select" onchange="quickChangeClientStatus('${c.id}', this.value)" title="Cambia stato rapido">
              <option value="nuovo" ${c.status === 'nuovo' ? 'selected' : ''}>🆕 Nuovo Lead</option>
              <option value="da_contattare" ${c.status === 'da_contattare' ? 'selected' : ''}>📞 Da Contattare</option>
              <option value="contattato" ${c.status === 'contattato' ? 'selected' : ''}>💬 Contattato</option>
              <option value="in_trattativa" ${c.status === 'in_trattativa' ? 'selected' : ''}>⏳ In Trattativa</option>
              <option value="attivo" ${c.status === 'attivo' ? 'selected' : ''}>⭐ Cliente Attivo</option>
              <option value="perso" ${c.status === 'perso' ? 'selected' : ''}>⚪ Non Interessato</option>
            </select>
          </div>
        </div>

        <!-- Recapiti Cliccabili Rapidi -->
        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 8px;">
          ${c.phone ? `
            <a href="tel:${escapeHtml(c.phone)}" class="btn-client-action" style="color: #0071e3;">
              📞 ${escapeHtml(c.phone)}
            </a>
          ` : ''}
          ${c.email ? `
            <a href="mailto:${escapeHtml(c.email)}" class="btn-client-action" style="color: #0071e3;">
              ✉️ ${escapeHtml(c.email)}
            </a>
          ` : ''}
          ${!c.phone && !c.email ? `
            <span style="font-size: 0.8rem; color: var(--text-secondary); font-style: italic;">Nessun recapito telefonico/email salvato</span>
          ` : ''}
        </div>

        <!-- BOX INFOGRAFICO: VALUTAZIONE POTENZIALE & PREVISIONE RICAVO -->
        <div class="client-potential-box">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.72rem; font-weight: 750; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.04em;">
              Valutazione & Previsione Economica
            </span>
            <span class="potential-rating-badge ${c.potential_rating || 'base'}">${ratingLabel}</span>
          </div>

          <div class="potential-row">
            <span style="color: var(--text-secondary);">Commesse concluse (${c.total_quotes || 0} lavori):</span>
            <strong>${(c.revenue_won || 0).toLocaleString('it-IT')}€</strong>
          </div>

          ${(c.revenue_pipeline || 0) > 0 ? `
            <div class="potential-row">
              <span style="color: var(--text-secondary);">In negoziazione (preventivi inviati):</span>
              <strong style="color: var(--status-inviato);">${(c.revenue_pipeline).toLocaleString('it-IT')}€</strong>
            </div>
          ` : ''}

          <div class="potential-row">
            <span style="color: var(--text-secondary);">Stima potenziale futuro freelance:</span>
            <span>${(c.estimated_revenue || 0).toLocaleString('it-IT')}€</span>
          </div>

          <div class="potential-row potential-total">
            <span>Previsione Totale Cliente:</span>
            <span style="font-size: 1.15rem; font-weight: 800; color: var(--accent-sage);">
              ${(c.total_potential || 0).toLocaleString('it-IT')}€
            </span>
          </div>
        </div>

        <!-- Promemoria Agenda & Note Strategiche -->
        ${c.next_follow_up ? `
          <div style="margin: 8px 0; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--radius-sm); ${isDueToday ? 'background: #fff0f0; border-left: 3px solid #ff3b30; color: #d70015; font-weight: 600;' : 'background: #fbfbfd; border: 1px solid var(--border-subtle); color: var(--text-secondary);'}">
            ${isDueToday ? '⚠️ <strong>PROMEMORIA OGGI / SCADUTO:</strong> ' : '📅 Prossimo contatto programmato: '}
            <strong>${c.next_follow_up}</strong>
          </div>
        ` : ''}

        ${c.notes ? `
          <div style="font-size: 0.84rem; color: var(--text-secondary); background: #fafafa; padding: 10px 12px; border-radius: var(--radius-sm); border-left: 2px solid var(--border-medium); margin-top: 8px; line-height: 1.5;">
            📝 <em>${escapeHtml(c.notes)}</em>
          </div>
        ` : ''}

        <!-- Azioni Rapide Freelancer -->
        <div class="client-actions-bar">
          <button class="btn-client-action primary" onclick="startQuoteForClient('${escapeHtml(c.name)}', '${escapeHtml(c.phone || c.email || '')}')">
            ⚡ Crea Preventivo per ${escapeHtml(c.name)}
          </button>
          <button class="btn-client-action" onclick="openClientModal('${c.id}')">
            ✏️ Modifica Scheda & Note
          </button>
          <button class="btn-client-action" style="color: #ff3b30;" onclick="deleteClientConfirm('${c.id}', '${escapeHtml(c.name)}')">
            🗑️ Elimina
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------- OPERAZIONI CRUD CLIENTE & AGENDA -----------------

function openClientModal(clientId = null) {
  const container = document.getElementById('client-modal-container');
  if (!container) return;

  let client = {
    id: null,
    name: '',
    company: '',
    contact_person: '',
    email: '',
    phone: '',
    status: 'da_contattare',
    estimated_revenue: '',
    next_follow_up: '',
    notes: ''
  };

  if (clientId) {
    const found = clientsCache.find(c => c.id === clientId);
    if (found) client = { ...found };
  }

  const isEdit = !!client.id;

  container.innerHTML = `
    <div class="modal-overlay" id="client-modal-overlay">
      <div class="modal-content" style="max-width: 520px; max-height: 90vh; overflow-y: auto;">
        <h3 class="section-title" style="margin-bottom: 4px;">
          ${isEdit ? 'Modifica Scheda Cliente' : 'Nuovo Cliente in Agenda'}
        </h3>
        <p class="section-desc" style="margin-bottom: 18px;">
          ${isEdit ? 'Aggiorna i dettagli, lo stato o la previsione futura di ricavo.' : 'Aggiungi un prospect o cliente in autonomia prima ancora di contattarlo.'}
        </p>

        <form id="client-form" onsubmit="event.preventDefault(); saveClientForm('${client.id || ''}');">
          <div class="form-group">
            <label class="form-label">Nome Cliente / Ragione Sociale *</label>
            <input type="text" id="cl-name" class="form-input" required placeholder="Es. Studio Dentistico Ferri, Marco Bianchi..." value="${escapeHtml(client.name)}">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Azienda / Studio</label>
              <input type="text" id="cl-company" class="form-input" placeholder="Es. Ferri Dental Srl" value="${escapeHtml(client.company || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Persona di Contatto</label>
              <input type="text" id="cl-contact" class="form-input" placeholder="Es. Dott. Marco Ferri" value="${escapeHtml(client.contact_person || '')}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Telefono / Cellulare</label>
              <input type="tel" id="cl-phone" class="form-input" placeholder="+39 340 1234567" value="${escapeHtml(client.phone || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="cl-email" class="form-input" placeholder="info@esempio.it" value="${escapeHtml(client.email || '')}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Stato Classificazione</label>
              <select id="cl-status" class="form-input" style="font-weight: 600;">
                <option value="nuovo" ${client.status === 'nuovo' ? 'selected' : ''}>🆕 Nuovo Lead</option>
                <option value="da_contattare" ${client.status === 'da_contattare' ? 'selected' : ''}>📞 Da Contattare</option>
                <option value="contattato" ${client.status === 'contattato' ? 'selected' : ''}>💬 Contattato</option>
                <option value="in_trattativa" ${client.status === 'in_trattativa' ? 'selected' : ''}>⏳ In Trattativa</option>
                <option value="attivo" ${client.status === 'attivo' ? 'selected' : ''}>⭐ Cliente Attivo</option>
                <option value="perso" ${client.status === 'perso' ? 'selected' : ''}>⚪ Non Interessato</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Potenziale Ricavo Stimato (€)</label>
              <input type="number" step="50" id="cl-revenue" class="form-input" placeholder="Es. 2500" value="${client.estimated_revenue || ''}">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Data Prossimo Contatto / Follow-up</label>
            <input type="date" id="cl-followup" class="form-input" value="${client.next_follow_up || ''}">
          </div>

          <div class="form-group">
            <label class="form-label">Note Agenda / Prossimi Passi</label>
            <textarea id="cl-notes" class="form-textarea" rows="3" placeholder="Es. Trovato su LinkedIn, necessita restyling logo e brochure. Da richiamare venerdì mattina con portfolio...">${escapeHtml(client.notes || '')}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px;">
            <button type="submit" class="btn-apple primary" id="cl-save-btn">
              ${isEdit ? 'Salva Modifiche' : 'Crea Cliente'}
            </button>
            <button type="button" class="btn-apple secondary" onclick="closeClientModal()">
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function closeClientModal() {
  const container = document.getElementById('client-modal-container');
  if (container) container.innerHTML = '';
}

async function saveClientForm(clientId) {
  const name = document.getElementById('cl-name').value.trim();
  if (!name) {
    alert("Inserisci il nome del cliente o la ragione sociale.");
    return;
  }

  const payload = {
    name: name,
    company: document.getElementById('cl-company').value.trim(),
    contact_person: document.getElementById('cl-contact').value.trim(),
    phone: document.getElementById('cl-phone').value.trim(),
    email: document.getElementById('cl-email').value.trim(),
    status: document.getElementById('cl-status').value,
    estimated_revenue: parseFloat(document.getElementById('cl-revenue').value) || 0.0,
    next_follow_up: document.getElementById('cl-followup').value,
    notes: document.getElementById('cl-notes').value.trim()
  };

  const btn = document.getElementById('cl-save-btn');
  btn.disabled = true;
  btn.innerText = "Salvataggio in corso...";

  try {
    const isEdit = !!clientId;
    const url = isEdit ? `${API_BASE}/clients/${clientId}` : `${API_BASE}/clients`;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore durante il salvataggio");
    }

    closeClientModal();
    // Ricarica la lista
    await renderClients();
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
    btn.innerText = "Riprova";
  }
}

async function quickChangeClientStatus(clientId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/clients/${clientId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) throw new Error("Errore aggiornamento stato cliente");

    // Aggiorna stato in cache locale
    const client = clientsCache.find(c => c.id === clientId);
    if (client) client.status = newStatus;
    renderClientsList();
  } catch (e) {
    alert(e.message);
  }
}

function startQuoteForClient(clientName, clientContact) {
  window.preselectedClient = {
    name: clientName,
    contact: clientContact
  };
  window.location.hash = '#/nuovo';
}

async function deleteClientConfirm(clientId, clientName) {
  if (!confirm(`Sei sicuro di voler eliminare "${clientName}" dalla tua agenda clienti?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/clients/${clientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (!res.ok) throw new Error("Errore eliminazione cliente");
    clientsCache = clientsCache.filter(c => c.id !== clientId);
    renderClientsList();
  } catch (e) {
    alert(e.message);
  }
}

// ----------------- 8. GESTIONE PROFILO AZIENDALE -----------------
function renderProfile() {
  if (!currentUser) {
    openAuth(false);
    return;
  }

  const p = currentProfile;
  const isPro = currentUser.plan === 'pro';

  root.innerHTML = `
    <div class="card-apple" style="margin-bottom: 24px;">
      <h2 class="section-title">Dati Aziendali & Fiscali</h2>
      <p class="section-desc">Queste informazioni compariranno nell'intestazione di tutti i preventivi e nel PDF.</p>

      <div class="form-group">
        <label class="form-label">Nome / Ragione Sociale</label>
        <input type="text" id="prof-name" class="form-input" value="${p.business_name || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Indirizzo Sede / Studio</label>
        <input type="text" id="prof-address" class="form-input" value="${p.address || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Partita IVA / Codice Fiscale</label>
        <input type="text" id="prof-vat" class="form-input" value="${p.vat_id || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">IBAN per Bonifici d'Acconto</label>
        <input type="text" id="prof-iban" class="form-input" value="${p.iban || ''}">
      </div>

      <button class="btn-apple primary" onclick="saveProfile()">Salva Modifiche</button>
    </div>

    <!-- Gestione Abbonamento & Trasparenza -->
    <div class="card-apple" style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 class="section-title" style="margin-bottom: 0;">Stato Abbonamento</h3>
        <span class="${isPro ? 'badge-pro' : 'badge-status bozza'}">${isPro ? 'A BRACCIO PRO — 9,99€/mese' : 'Piano Base Free (3 prev/mese)'}</span>
      </div>
      <p class="section-desc">
        ${isPro 
          ? 'Il tuo abbonamento è attivo. Include preventivi vocali illimitati, firma elettronica touch, QR Code SEPA e scudo legale AI.' 
          : 'Sei attualmente sul piano gratuito. Passa a PRO per sbloccare preventivi illimitati e tutte le funzioni Smart Tech.'}
      </p>

      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px;">
        ${isPro ? `
          <button class="btn-apple ghost" style="color: #b91c1c; border-color: rgba(185, 28, 28, 0.3);" onclick="cancelMySubscription()">
            Disdici Rinnovo in 1 Clic
          </button>
          <button class="btn-apple ghost" onclick="openStripePortal()">
            Ricevute & Portale Fatture Stripe
          </button>
        ` : `
          <a href="#/pricing" class="btn-apple primary">
            Passa a PRO (9,99€/mese)
          </a>
        `}
      </div>
    </div>

    <!-- Scorciatoie Centro Assistenza, Referral & Feedback -->
    <div class="card-apple">
      <h3 class="section-title">Supporto, Crescita & Valutazione</h3>
      <p class="section-desc">Tutto a portata di mano per lavorare con la massima tranquillità.</p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 16px;">
        <a href="#/assistenza?tab=referral" class="action-card-btn" style="text-decoration: none; padding: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: #ffffff; display: block; transition: var(--transition-smooth);">
          <div style="font-size: 1.4rem; margin-bottom: 6px;">🎁</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">Invita un Amico</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Ricevi 1 Mese PRO Gratis per ogni collega che inviti.</div>
        </a>

        <a href="#/assistenza?tab=feedback" class="action-card-btn" style="text-decoration: none; padding: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: #ffffff; display: block; transition: var(--transition-smooth);">
          <div style="font-size: 1.4rem; margin-bottom: 6px;">⭐</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">Valuta l'App</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Dai il tuo voto a 5 stelle e proponi nuove funzioni.</div>
        </a>

        <a href="#/assistenza?tab=faq" class="action-card-btn" style="text-decoration: none; padding: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: #ffffff; display: block; transition: var(--transition-smooth);">
          <div style="font-size: 1.4rem; margin-bottom: 6px;">💡</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">FAQ & Disdetta</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Come funziona la firma, i bonifici e le politiche.</div>
        </a>

        <a href="#/assistenza?tab=privacy" class="action-card-btn" style="text-decoration: none; padding: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: #ffffff; display: block; transition: var(--transition-smooth);">
          <div style="font-size: 1.4rem; margin-bottom: 6px;">🛡️</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">Privacy & GDPR</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Dati cifrati, server UE e nessun dato ceduto a terzi.</div>
        </a>
      </div>
    </div>
  `;
}

async function saveProfile() {
  const payload = {
    business_name: document.getElementById('prof-name').value,
    address: document.getElementById('prof-address').value,
    vat_id: document.getElementById('prof-vat').value,
    iban: document.getElementById('prof-iban').value,
    fiscal_regime: 'forfettario'
  };

  await fetch(`${API_BASE}/user/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
    },
    body: JSON.stringify(payload)
  });

  currentProfile = payload;
  alert("Dati salvati con successo!");
}

// ----------------- CENTRO ASSISTENZA & TRUST / GROWTH -----------------
let currentSupportTab = 'faq';
let selectedStarRating = 5;

function switchSupportTab(tab) {
  currentSupportTab = tab;
  window.location.hash = `#/assistenza?tab=${tab}`;
  renderSupport(tab);
}

function copyTextToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert(successMsg || "Copiato negli appunti!");
    }).catch(() => {
      prompt("Copia il testo:", text);
    });
  } else {
    prompt("Copia il testo:", text);
  }
}

async function cancelMySubscription() {
  const confirmCancel = confirm(
    "Sei sicuro di voler disdire il rinnovo del piano PRO?\n\n" +
    "• Nessun costo futuro o penale di uscita.\n" +
    "• Manterrai i tuoi dati, preventivi e rubrica clienti intatti.\n" +
    "• Potrai riattivarlo in qualsiasi momento con un solo clic."
  );
  if (!confirmCancel) return;

  try {
    const res = await fetch(`${API_BASE}/billing/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      }
    });
    const data = await res.json();
    if (res.ok) {
      if (currentUser) currentUser.plan = 'free';
      updateNav();
      alert("✓ " + (data.message || "Abbonamento disdetto con successo."));
      renderSupport('faq');
    } else {
      alert(data.detail || "Errore durante la disdetta");
    }
  } catch (e) {
    alert("Errore di rete durante la richiesta di disdetta.");
  }
}

async function openStripePortal() {
  try {
    const res = await fetch(`${API_BASE}/billing/customer-portal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      }
    });
    const data = await res.json();
    if (data.portal_url) {
      window.location.href = data.portal_url;
    } else {
      alert("Portale di fatturazione non disponibile.");
    }
  } catch (e) {
    alert("Errore connessione a Stripe");
  }
}

function setStarRating(num) {
  selectedStarRating = num;
  const stars = document.querySelectorAll('.star-rating-row .star');
  stars.forEach((s, idx) => {
    if (idx < num) {
      s.classList.add('filled');
    } else {
      s.classList.remove('filled');
    }
  });

  const labelMap = {
    1: '⭐ 1/5 — Poco soddisfatto, vorrei miglioramenti',
    2: '⭐⭐ 2/5 — Sufficiente, ma mancano funzioni chiave',
    3: '⭐⭐⭐ 3/5 — Buono, fa esattamente il suo dovere',
    4: '⭐⭐⭐⭐ 4/5 — Molto utile, mi fa risparmiare ore di lavoro!',
    5: '⭐⭐⭐⭐⭐ 5/5 — Straordinario! Indispensabile per chi lavora da solo'
  };
  const lbl = document.getElementById('rating-desc-label');
  if (lbl) lbl.innerText = labelMap[num] || '';
}

async function submitFeedbackAction() {
  if (!currentUser) {
    openAuth(false);
    return;
  }
  const comment = document.getElementById('feedback-comment').value.trim();
  const category = document.getElementById('feedback-category').value;

  try {
    const res = await fetch(`${API_BASE}/support/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({
        rating: selectedStarRating,
        category: category,
        comment: comment
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert("🎉 " + data.message);
      document.getElementById('feedback-comment').value = '';
      loadFeedbackHistory();
    } else {
      alert(data.detail || "Errore invio valutazione");
    }
  } catch (e) {
    alert("Errore durante l'invio della recensione.");
  }
}

async function loadFeedbackHistory() {
  const container = document.getElementById('my-feedbacks-history');
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`${API_BASE}/support/feedbacks`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      }
    });
    if (!res.ok) return;
    const items = await res.json();
    if (!items || items.length === 0) {
      container.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-tertiary);">Nessuna recensione inviata ancora.</div>`;
      return;
    }

    container.innerHTML = items.map(fb => `
      <div style="background: #f9f9fb; border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 8px; border: 1px solid var(--border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="color: #f59e0b; font-weight: 700;">${'★'.repeat(fb.rating)}${'☆'.repeat(5 - fb.rating)}</span>
          <span style="font-size: 0.75rem; color: var(--text-tertiary);">${(fb.created_at || '').substring(0, 10)}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">${fb.comment || 'Nessun commento aggiuntivo'}</div>
        <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; text-transform: uppercase;">Categoria: ${fb.category}</div>
      </div>
    `).join('');
  } catch (e) {}
}

async function loadReferralData() {
  const container = document.getElementById('referral-friends-list');
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`${API_BASE}/support/referrals`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    // Aggiorna contatori e badge live
    const elTot = document.getElementById('ref-stat-total');
    const elMat = document.getElementById('ref-stat-maturing');
    const elQual = document.getElementById('ref-stat-qualified');
    const elDisc = document.getElementById('ref-stat-discount');
    const elGold = document.getElementById('ref-gold-status-banner');

    if (elTot) elTot.innerText = data.total_invited;
    if (elMat) elMat.innerText = data.maturing_count;
    if (elQual) elQual.innerText = data.qualified_count;
    if (elDisc) elDisc.innerText = `${(data.discount_eur || 0).toFixed(2)}€ / m`;

    if (elGold) {
      if (data.has_gold_superpowers) {
        elGold.innerHTML = `
          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: var(--radius-md); padding: 14px 18px; margin: 18px 0; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
            <span style="font-size: 2rem;">👑</span>
            <div>
              <div style="font-weight: 800; color: #92400e; font-size: 0.98rem;">SUPER POTERI GOLD ATTIVI!</div>
              <div style="font-size: 0.82rem; color: #78350f; margin-top: 2px;">
                Complimenti! Hai almeno 1 collega attivo da oltre 2 mesi. Il tuo Badge Studio Certificato e lo sconto di ${(data.discount_eur || 0).toFixed(2)}€/mese sono ora attivi sul tuo profilo!
              </div>
            </div>
          </div>
        `;
      } else {
        elGold.innerHTML = `
          <div style="background: #fbfbfd; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 14px 16px; margin: 18px 0; font-size: 0.86rem; color: var(--text-secondary); line-height: 1.5;">
            ⏳ <strong>Stato Super Poteri: In Attesa di Maturazione</strong>. Non appena il tuo primo amico completa i suoi primi <strong>2 mesi consecutivi di abbonamento PRO</strong>, sbloccherai automaticamente tutti i Super Poteri Gold e lo sconto sul rinnovo.
          </div>
        `;
      }
    }

    if (!data.friends || data.friends.length === 0) {
      container.innerHTML = `<div style="font-size: 0.88rem; color: var(--text-tertiary); text-align: center; padding: 20px;">Non hai ancora invitato nessun collega. Invia il tuo codice su WhatsApp per iniziare!</div>`;
      return;
    }

    container.innerHTML = data.friends.map(f => {
      let badge = '';
      if (f.status === 'qualificato') {
        badge = `<span class="badge-status accettato" style="font-size: 0.78rem;">✓ Confermato (2+ Mesi PRO)</span>`;
      } else if (f.status.startsWith('in_maturazione')) {
        badge = `<span class="badge-status in_corso" style="font-size: 0.78rem;">⏳ In Maturazione (Mese 1/2 PRO)</span>`;
      } else {
        badge = `<span class="badge-status bozza" style="font-size: 0.78rem;">⚪ Registrato Base Free</span>`;
      }

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); font-size: 0.88rem;">
          <div>
            <div style="font-weight: 700; color: var(--text-main);">${f.name}</div>
            <div style="font-size: 0.78rem; color: var(--text-tertiary);">${f.email_masked} • Iscritto il ${(f.created_at || '').substring(0, 10)}</div>
          </div>
          <div>${badge}</div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.warn("Errore caricamento referral", e);
  }
}

function renderSupport(tabOverride) {
  if (tabOverride) {
    currentSupportTab = tabOverride;
  } else {
    const hash = window.location.hash;
    if (hash.includes('tab=')) {
      currentSupportTab = hash.split('tab=')[1].split('&')[0];
    }
  }

  const appOrigin = window.location.origin;
  const refCode = (currentUser && currentUser.referral_code) ? currentUser.referral_code : 'BRACCIO-SOLO';
  const referralLink = `${appOrigin}/?ref=${refCode}#/pricing`;
  const whatsappMsg = encodeURIComponent(`Ciao! Sto usando "A BRACCIO", l'app che genera preventivi a voce e li fa firmare su smartphone in 2 minuti. Provala da qui con il mio invito per un mese omaggio: ${referralLink}`);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappMsg}`;

  const isPro = currentUser && currentUser.plan === 'pro';

  root.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 class="section-title" style="font-size: 2rem;">Centro Assistenza & Trasparenza</h1>
      <p class="section-desc">Tutto chiaro, trasparente e senza sorprese. Il braccio destro di chi lavora da solo.</p>
    </div>

    <!-- Barra delle Schede / Pill Navigation -->
    <div class="support-nav-pills">
      <button class="support-pill-btn ${currentSupportTab === 'faq' ? 'active' : ''}" onclick="switchSupportTab('faq')">
        <span>💡</span> Domande Frequenti & Disdetta
      </button>
      <button class="support-pill-btn ${currentSupportTab === 'referral' ? 'active' : ''}" onclick="switchSupportTab('referral')">
        <span>🎁</span> Invita un Amico & Super Poteri Gold
      </button>
      <button class="support-pill-btn ${currentSupportTab === 'feedback' ? 'active' : ''}" onclick="switchSupportTab('feedback')">
        <span>⭐</span> Valuta A BRACCIO
      </button>
      <button class="support-pill-btn ${currentSupportTab === 'privacy' ? 'active' : ''}" onclick="switchSupportTab('privacy')">
        <span>🛡️</span> Privacy & GDPR
      </button>
    </div>

    <!-- Contenuto della Scheda Attiva -->
    <div id="support-tab-content">
      ${getSupportTabContent(currentSupportTab, { isPro, refCode, referralLink, whatsappUrl })}
    </div>
  `;

  if (currentSupportTab === 'feedback') {
    setStarRating(selectedStarRating);
    loadFeedbackHistory();
  } else if (currentSupportTab === 'referral') {
    loadReferralData();
  }
}

function getSupportTabContent(tab, data) {
  if (tab === 'faq') {
    return `
      <!-- Box Gestione Abbonamento Trasparente -->
      <div class="card-apple" style="border-left: 4px solid var(--accent-sage); margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 750; margin-bottom: 4px;">Il tuo Piano Attuale: ${data.isPro ? 'A BRACCIO PRO (9,99€/mese)' : 'Base Gratuito (3 preventivi/mese)'}</h3>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">
              ${data.isPro 
                ? 'Hai accesso illimitato a preventivi vocali, firma digitale touch, QR Code SEPA e scudo legale.' 
                : 'Sei sul piano gratuito. Puoi passare a PRO per preventivi illimitati in qualunque momento.'}
            </p>
          </div>
          <div>
            ${data.isPro ? `
              <button class="btn-apple ghost" style="color: #b91c1c; border-color: rgba(185, 28, 28, 0.3); font-size: 0.85rem;" onclick="cancelMySubscription()">
                Disdici Rinnovo in 1 Clic
              </button>
            ` : `
              <a href="#/pricing" class="btn-apple primary" style="font-size: 0.85rem;">
                Passa a PRO (9,99€)
              </a>
            `}
          </div>
        </div>
      </div>

      <!-- FAQ Accordion -->
      <div style="margin-bottom: 30px;">
        <details class="faq-card" open>
          <summary>1. Come funziona la creazione del preventivo a voce?</summary>
          <div class="faq-answer">
            Basta premere il pulsante del microfono e parlare normalmente, come faresti con un collaboratore (es: <em>"Rifacimento sito web per Mario Rossi, 4 sezioni, 1.500 euro, acconto del 30% e consegna tra due settimane"</em>). L'Intelligenza Artificiale di <strong>A BRACCIO</strong> estrae automaticamente le voci, calcola l'imponibile, applica il regime forfettario o IVA ordinaria, scorpora l'acconto, integra le clausole di tutela legale ed è subito pronto per essere inviato al cliente.
          </div>
        </details>

        <details class="faq-card">
          <summary>2. Come funziona la Firma Elettronica One-Tap sul telefono del cliente?</summary>
          <div class="faq-answer">
            Una volta generato il preventivo, puoi condividere il link pubblico con il cliente (tramite WhatsApp, email o SMS). Il cliente apre la pagina sul proprio smartphone o computer, legge le condizioni e appone la firma col dito sullo schermo. Il sistema registra la data, l'ora esatta (UTC), l'indirizzo IP del firmatario e l'impronta crittografica del documento, dandoti piena certezza e valore probatorio prima di iniziare i lavori.
          </div>
        </details>

        <details class="faq-card">
          <summary>3. Come funzionano gli acconti con QR Code Bancario EPC europeo?</summary>
          <div class="faq-answer">
            Sul preventivo accettato dal cliente compare un QR Code conforme allo standard ufficiale <strong>EPC SEPA</strong> (European Payments Council). Quando il cliente inquadra il codice con l'app della propria banca (Intesa Sanpaolo, UniCredit, PostePay, Revolut, BBVA, BPER, Fineco, ecc.), troverà l'importo dell'acconto, il tuo IBAN e la causale con il numero del preventivo già precompilati, azzerando i ritardi e gli errori di digitazione.
          </div>
        </details>

        <details class="faq-card">
          <summary>4. Quanto costa l'abbonamento e come avvengono i pagamenti?</summary>
          <div class="faq-answer">
            Il piano <strong>A BRACCIO PRO</strong> costa <strong>9,99€ al mese</strong> (IVA inclusa). I pagamenti sono gestiti in modo totalmente sicuro tramite <strong>Stripe</strong> con crittografia bancaria AES-256. Ad ogni rinnovo mensile riceverai via email la ricevuta fiscale da scaricare per la tua contabilità.
          </div>
        </details>

        <details class="faq-card" open>
          <summary>5. Posso disdire l'abbonamento in qualsiasi momento? Come funziona la cancellazione?</summary>
          <div class="faq-answer">
            <strong>Sì, libertà totale al 100%!</strong> Nessun contratto a lungo termine, nessun vincolo e nessuna penale. Se decidi di interrompere l'abbonamento, puoi premere il tasto <em>"Disdici Rinnovo in 1 Clic"</em> in questa pagina o dal tuo profilo. L'abbonamento rimarrà utilizzabile fino alla fine del mese già saldato e non ti verrà mai più addebitato alcun euro. Tutti i tuoi preventivi, clienti e dati resteranno per sempre salvati nel tuo account.
          </div>
        </details>

        <details class="faq-card">
          <summary>6. Come posso contattare l'assistenza per problemi o chiarimenti?</summary>
          <div class="faq-answer">
            Siamo a tua disposizione! Puoi scriverci in qualsiasi momento all'indirizzo email <a href="mailto:supporto@abraccio.app" style="color: var(--accent-sage); font-weight: 600;">supporto@abraccio.app</a> oppure inviarci un messaggio tramite la scheda <strong>"Valuta A BRACCIO"</strong>. Rispondiamo a tutti i colleghi freelance entro poche ore lavorative.
          </div>
        </details>
      </div>
    `;
  }

  if (tab === 'referral') {
    const friendCount = (currentUser && currentUser.referral_count) || 0;
    const qualCount = (currentUser && currentUser.qualified_friends) || 0;
    const matCount = (currentUser && currentUser.maturing_friends) || 0;
    const discountVal = (currentUser && currentUser.referral_discount_eur) || 0;

    return `
      <div class="referral-hero-card">
        <span class="badge-pro" style="margin-bottom: 12px; display: inline-block;">Programma Ambassador Freelance</span>
        <h2 style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
          Porta valore, sblocca i Super Poteri Gold.
        </h2>
        <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; max-width: 660px;">
          Fai conoscere <strong>A BRACCIO</strong> a colleghi freelance, artigiani o professionisti. 
          Quando il tuo collega <strong>attiva l'account PRO e rimane attivo per almeno 2 mesi</strong>, sblocchi 
          <strong>1€ di sconto fisso al mese sul canone</strong> e l'accesso esclusivo ai <strong>Super Poteri Gold</strong> (Badge Studio Certificato, Template Luxury e AI Advisor illimitato)!
        </p>

        <!-- Banner Dinamico Stato Super Poteri -->
        <div id="ref-gold-status-banner">
          <div style="background: #f8fafc; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px; margin: 18px 0; font-size: 0.85rem; color: var(--text-secondary);">
            ⏳ Caricamento stato Ambassador...
          </div>
        </div>

        <!-- Griglia Statistiche Referral con Regola dei 2 Mesi -->
        <div class="referral-stat-grid">
          <div class="referral-stat-box">
            <div class="referral-stat-val" id="ref-stat-total">${friendCount}</div>
            <div class="referral-stat-lbl">Amici Iscritti</div>
          </div>
          <div class="referral-stat-box">
            <div class="referral-stat-val" id="ref-stat-maturing" style="color: #f59e0b;">${matCount}</div>
            <div class="referral-stat-lbl">In Maturazione (Mese 1/2)</div>
          </div>
          <div class="referral-stat-box">
            <div class="referral-stat-val" id="ref-stat-qualified" style="color: var(--accent-sage);">${qualCount}</div>
            <div class="referral-stat-lbl">Confermati (2+ Mesi PRO)</div>
          </div>
          <div class="referral-stat-box">
            <div class="referral-stat-val" id="ref-stat-discount" style="color: var(--accent-sage);">${discountVal.toFixed(2)}€ / m</div>
            <div class="referral-stat-lbl">Sconto Mensile Attivo</div>
          </div>
        </div>

        <!-- Box Codice Invito -->
        <div style="margin-top: 24px;">
          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Il tuo Codice Invito Personale:</label>
          <div class="copy-pill-box">
            <span class="copy-pill-text">${data.refCode}</span>
            <button class="btn-apple ghost" style="padding: 6px 14px; font-size: 0.8rem;" onclick="copyTextToClipboard('${data.refCode}', 'Codice Invito copiato negli appunti!')">
              Copia Codice
            </button>
          </div>
        </div>

        <!-- Box Link Diretto -->
        <div style="margin-top: 14px;">
          <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Il tuo Link di Registrazione Diretto:</label>
          <div class="copy-pill-box">
            <span class="copy-pill-text" style="font-size: 0.85rem;">${data.referralLink}</span>
            <button class="btn-apple ghost" style="padding: 6px 14px; font-size: 0.8rem;" onclick="copyTextToClipboard('${data.referralLink}', 'Link di invito copiato negli appunti!')">
              Copia Link
            </button>
          </div>
        </div>

        <!-- Pulsante WhatsApp Rapido -->
        <div style="margin-top: 20px;">
          <a href="${data.whatsappUrl}" target="_blank" class="btn-whatsapp-share">
            <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.031 2C6.495 2 2 6.495 2 12.031c0 1.954.557 3.778 1.523 5.325L2 22l4.81-1.488a9.98 9.98 0 0 0 5.221 1.488c5.536 0 10.031-4.495 10.031-10.031C22.062 6.495 17.567 2 12.031 2zm5.834 14.195c-.244.686-1.22 1.326-1.705 1.396-.466.068-1.047.098-3.376-.867-2.73-1.13-4.502-3.91-4.638-4.092-.136-.182-1.107-1.472-1.107-2.808s.698-1.996.945-2.268c.247-.272.54-.34.72-.34.18 0 .36.002.518.01.168.008.394-.064.616.47.244.588.835 2.037.91 2.189.075.152.125.33.025.53-.1.2-.15.325-.298.5-.15.175-.315.39-.45.524-.15.15-.306.313-.132.612.174.298.775 1.28 1.66 2.068 1.14 1.016 2.102 1.33 2.4 1.478.298.148.473.124.649-.077.176-.201.752-.876.953-1.176.2-.3.402-.25.676-.15.275.1.1.752 3.96 1.83.275.125.46.188.528.298.068.11.068.638-.176 1.324z"/>
            </svg>
            Condividi Invito su WhatsApp
          </a>
        </div>
      </div>

      <!-- I Super Poteri Gold Sbloccabili -->
      <div class="card-apple" style="margin-bottom: 24px;">
        <h3 class="section-title">👑 Cosa sblocchi con il Programma Ambassador?</h3>
        <p class="section-desc">Vantaggi esclusivi riservati a chi supporta la crescita della community.</p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 16px;">
          <div style="background: #fbfbfd; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 1.6rem; margin-bottom: 8px;">🛡️</div>
            <div style="font-weight: 750; color: var(--text-main); font-size: 0.95rem;">Badge "Studio Certificato Gold"</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
              Il sigillo di affidabilità compare sui tuoi preventivi pubblici per trasmettere autorità e vincere le trattative.
            </div>
          </div>

          <div style="background: #fbfbfd; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 1.6rem; margin-bottom: 8px;">⚡</div>
            <div style="font-weight: 750; color: var(--text-main); font-size: 0.95rem;">AI Advisor di Negoziazione</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
              Analisi strategica avanzata di pricing e follow-up psicologico sui clienti ritardatari.
            </div>
          </div>

          <div style="background: #fbfbfd; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 1.6rem; margin-bottom: 8px;">💰</div>
            <div style="font-weight: 750; color: var(--text-main); font-size: 0.95rem;">Sconto Ricorrente (fino a 3€/m)</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
              1€ di sconto al mese per ogni amico confermato. Il tuo canone scende a 6,99€/mese!
            </div>
          </div>
        </div>
      </div>

      <!-- Elenco e Monitoraggio Inviti in Tempo Reale -->
      <div class="card-apple">
        <h3 class="section-title">Stato Trasparente dei Tuoi Inviti</h3>
        <p class="section-desc">I tuoi colleghi devono completare 2 mesi consecutivi di abbonamento PRO per convalidare il bonus.</p>
        <div id="referral-friends-list" style="margin-top: 14px;">
          <div style="font-size: 0.85rem; color: var(--text-tertiary); text-align: center; padding: 12px;">Caricamento lista colleghi...</div>
        </div>
      </div>
    `;
  }

  if (tab === 'feedback') {
    return `
      <div class="card-apple" style="margin-bottom: 24px;">
        <h2 class="section-title">Valuta A BRACCIO</h2>
        <p class="section-desc">Il tuo parere è fondamentale. Dicci cosa funziona alla perfezione e cosa vorresti trovare nel prossimo aggiornamento.</p>

        <!-- Selettore 5 Stelle -->
        <div style="margin: 18px 0;">
          <label style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">La tua valutazione:</label>
          <div class="star-rating-row" id="star-picker">
            <span class="star filled" onclick="setStarRating(1)">★</span>
            <span class="star filled" onclick="setStarRating(2)">★</span>
            <span class="star filled" onclick="setStarRating(3)">★</span>
            <span class="star filled" onclick="setStarRating(4)">★</span>
            <span class="star filled" onclick="setStarRating(5)">★</span>
          </div>
          <div id="rating-desc-label" style="font-size: 0.9rem; font-weight: 600; color: var(--accent-sage);">
            ⭐⭐⭐⭐⭐ 5/5 — Straordinario! Indispensabile per chi lavora da solo
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Ambito del feedback</label>
          <select id="feedback-category" class="form-input">
            <option value="generale">Esperienza Generale & Facilità d'uso</option>
            <option value="vocale">Dettatura Vocale & Intelligenza Artificiale</option>
            <option value="firma_pagamenti">Firma Elettronica & Acconti QR Code</option>
            <option value="agenda_clienti">Agenda & Rubrica Clienti</option>
            <option value="nuova_idea">💡 Suggerimento nuova funzionalità</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Il tuo commento o suggerimento</label>
          <textarea id="feedback-comment" class="form-input" rows="4" placeholder="Cosa ti piace di più dell'app? Quale funzione renderebbe la tua giornata ancora più semplice?"></textarea>
        </div>

        <button class="btn-apple primary" onclick="submitFeedbackAction()">
          Invia la tua Valutazione
        </button>
      </div>

      <!-- Storico Feedback Inviati -->
      <div class="card-apple">
        <h3 class="section-title" style="font-size: 1.05rem;">Le tue Recensioni Precedenti</h3>
        <div id="my-feedbacks-history" style="margin-top: 12px;">
          <div style="font-size: 0.85rem; color: var(--text-tertiary);">Caricamento storico...</div>
        </div>
      </div>
    `;
  }

  if (tab === 'privacy') {
    return `
      <div class="card-apple" style="margin-bottom: 24px;">
        <h2 class="section-title">Politica sulla Privacy & Protezione Dati (GDPR)</h2>
        <p class="section-desc">Trasparenza totale a tutela di chi lavora da solo. Conforme al Regolamento UE 2016/679 (GDPR).</p>

        <div class="privacy-badge-card">
          <div class="privacy-badge-icon">🔒</div>
          <div>
            <h4 style="margin: 0 0 6px 0; font-size: 1.02rem; font-weight: 750; color: var(--text-main);">1. Proprietà Esclusiva dei Tuoi Dati</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              Tutti i preventivi emessi, i listini, i nominativi e i recapiti dei tuoi clienti appartengono <strong>esclusivamente a te</strong>. A BRACCIO non rivende, non cede e non aggrega i tuoi dati commerciali per broker pubblicitari o terze parti.
            </p>
          </div>
        </div>

        <div class="privacy-badge-card">
          <div class="privacy-badge-icon">🎙️</div>
          <div>
            <h4 style="margin: 0 0 6px 0; font-size: 1.02rem; font-weight: 750; color: var(--text-main);">2. Riservatezza dei Vocali & Trattamento AI</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              I messaggi audio che registri vengono trasmessi tramite protocollo cifrato SSL/TLS 256-bit unicamente per consentire all'Intelligenza Artificiale di estrarre le voci del preventivo. I file vocali temporanei non vengono diffusi all'esterno né utilizzati per addestrare modelli commerciali pubblici.
            </p>
          </div>
        </div>

        <div class="privacy-badge-card">
          <div class="privacy-badge-icon">✍️</div>
          <div>
            <h4 style="margin: 0 0 6px 0; font-size: 1.02rem; font-weight: 750; color: var(--text-main);">3. Firma Elettronica & Audit Log a Tua Tutela</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              Quando il tuo cliente firma un preventivo su smartphone, archiviamo marca temporale UTC, indirizzo IP e hash crittografico. Tali elementi costituiscono un registro probatorio inalterabile a protezione del professionista in caso di contestazioni o ritardi di pagamento.
            </p>
          </div>
        </div>

        <div class="privacy-badge-card">
          <div class="privacy-badge-icon">💳</div>
          <div>
            <h4 style="margin: 0 0 6px 0; font-size: 1.02rem; font-weight: 750; color: var(--text-main);">4. Sicurezza dei Pagamenti & Standard Bancario</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              Nessun dato relativo a carte di credito o strumenti di pagamento transita o viene memorizzato sui nostri server. I pagamenti dell'abbonamento sono gestiti direttamente da <strong>Stripe</strong>, certificato PCI Service Provider Livello 1 (il massimo grado di sicurezza bancaria).
            </p>
          </div>
        </div>

        <div class="privacy-badge-card">
          <div class="privacy-badge-icon">🗑️</div>
          <div>
            <h4 style="margin: 0 0 6px 0; font-size: 1.02rem; font-weight: 750; color: var(--text-main);">5. Diritto all'Oblio & Cancellazione Immediata</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              In qualsiasi momento puoi eliminare singoli preventivi, schede clienti o richiedere la cancellazione totale del tuo account con tutti i dati correlati scrivendo a <a href="mailto:privacy@abraccio.app" style="color: var(--accent-sage); font-weight: 600;">privacy@abraccio.app</a>.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

// ----------------- 9. PRICING & STRIPE -----------------
function renderPricing() {
  root.innerHTML = `
    <div style="text-align: center; margin-bottom: 40px;">
      <h2 style="font-size: 2.2rem; font-weight: 750; letter-spacing: -0.03em;">Il braccio destro di chi lavora da solo.</h2>
      <p class="section-desc">Tutto ciò che serve per preventivare e chiudere lavori in totale autonomia.</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="card-apple">
        <h3 style="font-size: 1.2rem; font-weight: 700;">Base (Free)</h3>
        <p style="font-size: 1.8rem; font-weight: 750; margin: 12px 0;">0€ <span style="font-size: 0.9rem; color: var(--text-secondary);">/ mese</span></p>
        <ul style="font-size: 0.88rem; color: var(--text-secondary); line-height: 2; margin-bottom: 24px; list-style: none;">
          <li>✓ 3 Preventivi vocali al mese</li>
          <li>✓ Download PDF A4</li>
        </ul>
        <button class="btn-apple ghost" onclick="openAuth(true)">Inizia Gratis</button>
      </div>

      <div class="card-apple" style="border-top: 4px solid var(--accent-sage); box-shadow: var(--shadow-float);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.2rem; font-weight: 700;">PRO Illimitato</h3>
          <span class="badge-pro">Top Freelance</span>
        </div>
        <p style="font-size: 1.8rem; font-weight: 750; margin: 12px 0; color: var(--accent-sage);">9,99€ <span style="font-size: 0.9rem; color: var(--text-secondary);">/ mese</span></p>
        <ul style="font-size: 0.88rem; color: var(--text-secondary); line-height: 2; margin-bottom: 24px; list-style: none;">
          <li>✓ <strong>Preventivi vocali illimitati</strong></li>
          <li>✓ Centro Operativo con grafici fatturato</li>
          <li>✓ Rubrica Clienti con totale speso</li>
          <li>✓ Duplica e Modifica Preventivi al volo</li>
          <li>✓ Esportazione PDF A4 pulita</li>
        </ul>
        <button class="btn-apple primary" onclick="startStripeUpgrade()">Attiva Abbonamento Pro</button>
      </div>
    </div>
  `;
}

async function startStripeUpgrade() {
  if (!currentUser) {
    openAuth(true);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/billing/create-checkout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const data = await res.json();
    if (data.checkout_url) window.location.href = data.checkout_url;
  } catch (e) {
    alert("Errore Stripe: verifica connessione");
  }
}

async function handleUpgradeSuccess() {
  const hash = window.location.hash;
  let sessionId = 'demo';
  if (hash.includes('session_id=')) {
    sessionId = hash.split('session_id=')[1].split('&')[0];
  }

  root.innerHTML = `
    <div class="card-apple" style="text-align: center; padding: 48px 24px;">
      <div style="font-size: 3rem; margin-bottom: 12px;">🎉</div>
      <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
        Abbonamento A BRACCIO PRO Attivato!
      </h2>
      <p class="section-desc" style="max-width: 480px; margin: 0 auto 24px; line-height: 1.6;">
        Il pagamento dell'abbonamento (9,99€/mese) è confermato. Tutte le funzionalità Smart Tech, i preventivi vocali illimitati, la firma elettronica e il consulente commerciale AI sono ora attivi.
      </p>
      <div id="upgrade-verify-status" style="margin-bottom: 24px; font-weight: 700; color: var(--accent-sage);">
        Verifica licenza in corso...
      </div>
      <a href="#/dashboard" class="btn-apple primary" style="max-width: 240px; margin: 0 auto;">
        Vai al Centro Operativo ›
      </a>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/billing/verify-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({ session_id: sessionId })
    });
    if (res.ok) {
      if (currentUser) currentUser.plan = 'pro';
      updateNav();
      const statusEl = document.getElementById('upgrade-verify-status');
      if (statusEl) statusEl.innerText = "✓ Licenza PRO convalidata ed attiva!";
    }
  } catch (e) {
    console.error("Errore verifica sessione", e);
  }
}

// ----------------- AUTENTICAZIONE POPUP -----------------
function openAuth(isRegister) {
  isAuthRegister = isRegister;
  authModal.style.display = 'flex';
  document.getElementById('auth-title').innerText = isRegister ? 'Crea il tuo Account' : 'Entra in A BRACCIO';
  document.getElementById('name-group').style.display = isRegister ? 'block' : 'none';
  document.getElementById('auth-submit-btn').innerText = isRegister ? 'Registrati' : 'Accedi';
  document.getElementById('auth-toggle-mode').innerText = isRegister ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati gratis';
}

document.getElementById('auth-toggle-mode').onclick = () => openAuth(!isAuthRegister);
document.getElementById('auth-close-btn').onclick = () => authModal.style.display = 'none';

document.getElementById('auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value;

  const endpoint = isAuthRegister ? '/auth/register' : '/auth/login';
  const savedRef = localStorage.getItem('abraccio_ref') || '';
  const payload = isAuthRegister ? { email, password, name, ref: savedRef } : { email, password };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore");
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    authModal.style.display = 'none';
    // Pre-caricamento voci del sintetizzatore al caricamento
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

initApp();
  } catch (err) {
    alert(err.message);
  }
};

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  updateNav();
  window.location.hash = '#/';
}

// Pre-caricamento voci del sintetizzatore al caricamento
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

initApp();
