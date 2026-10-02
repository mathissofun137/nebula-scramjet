(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    searchEngine: 'google',
    animations: true,
    particles: true,
    backend: 'scramjet',      // scramjet | ultraviolet | auto
    transport: 'epoxy',       // epoxy | libcurl
    wisp: 'wss://wisp.mercurywork.shop/',
    customWisp: ''
  };
  const NEBULA_VERSION = '1.1.0';
  let settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = localStorage.getItem('nebula-settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (_) {}

  function saveSettings() {
    try { localStorage.setItem('nebula-settings', JSON.stringify(settings)); } catch (_) {}
    applySettings();
  }

  function applySettings() {
    document.body.classList.toggle('no-anim', !settings.animations);
    if (settings.particles) startParticles();
    else stopParticles();
  }

  const SEARCH_ENGINES = {
    google: 'https://www.google.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    bing: 'https://www.bing.com/search?q=',
    brave: 'https://search.brave.com/search?q='
  };

  let recentSites = [];
  try { recentSites = JSON.parse(localStorage.getItem('nebula-recent') || '[]'); } catch (_) { recentSites = []; }

  function addRecent(url, title) {
    recentSites = recentSites.filter(r => r.url !== url);
    recentSites.unshift({ url, title: title || url, ts: Date.now() });
    if (recentSites.length > 12) recentSites.length = 12;
    try { localStorage.setItem('nebula-recent', JSON.stringify(recentSites)); } catch (_) {}
    renderRecent();
  }

  function removeRecent(url) {
    recentSites = recentSites.filter(r => r.url !== url);
    try { localStorage.setItem('nebula-recent', JSON.stringify(recentSites)); } catch (_) {}
    renderRecent();
  }

  function renderRecent() {
    const section = document.getElementById('recentSection');
    const list = document.getElementById('recentList');
    if (!recentSites.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = recentSites.map(r =>
      '<div class="recent-item" data-url="' + escapeAttr(r.url) + '">' +
      '<span class="recent-url">' + escapeHtml(r.title || r.url) + '</span>' +
      '<span class="recent-remove" data-remove="' + escapeAttr(r.url) + '" title="Remove">×</span></div>'
    ).join('');
    list.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-remove]')) {
          e.stopPropagation();
          removeRecent(e.target.closest('[data-remove]').dataset.remove);
          return;
        }
        navigate(el.dataset.url);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  let tabs = [];
  let activeTabId = null;
  let tabIdCounter = 0;

  function createTab(url) {
    const id = ++tabIdCounter;
    const iframe = document.createElement('iframe');
    iframe.className = 'browser-frame';
    iframe.title = 'Tab ' + id;
    iframe.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write');
    document.getElementById('framesContainer').appendChild(iframe);

    const tab = { id, url: url || null, title: 'New Tab', iframe, frame: null, history: [], historyIndex: -1 };
    tabs.push(tab);
    renderTabs();
    switchTab(id);
    if (url) navigate(url, id);
    else showHome(true);
    return tab;
  }

  function closeTab(id) {
    if (tabs.length <= 1) {
      const t = tabs[0];
      t.url = null; t.title = 'New Tab'; t.history = []; t.historyIndex = -1;
      showHome(true); updateUrlBar(''); renderTabs();
      return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    tabs[idx].iframe.remove();
    tabs.splice(idx, 1);
    if (activeTabId === id) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      switchTab(next.id);
    }
    renderTabs();
  }

  function switchTab(id) {
    activeTabId = id;
    tabs.forEach(t => t.iframe.classList.toggle('active', t.id === id));
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    if (!tab.url) { showHome(true); hideError(); updateUrlBar(''); }
    else { showHome(false); updateUrlBar(tab.url); }
    renderTabs();
    updateNavButtons();
  }

  function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

  function renderTabs() {
    const bar = document.getElementById('tabBar');
    const newBtn = document.getElementById('newTabBtn');
    bar.querySelectorAll('.tab').forEach(el => el.remove());
    tabs.forEach(t => {
      const el = document.createElement('div');
      el.className = 'tab' + (t.id === activeTabId ? ' active' : '');
      el.innerHTML = '<div class="tab-favicon"></div><span class="tab-title">' +
        escapeHtml(t.title) + '</span><span class="tab-close" data-close="' + t.id + '">×</span>';
      el.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) { e.stopPropagation(); closeTab(t.id); return; }
        switchTab(t.id);
      });
      bar.insertBefore(el, newBtn);
    });
  }

  function isUrl(input) {
    const s = input.trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s)) return true;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s) && !s.includes(' ')) return true;
    return false;
  }

  function normalizeUrl(input) {
    let s = input.trim();
    if (!s) return null;
    if (isUrl(s)) {
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      return s;
    }
    const engine = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google;
    return engine + encodeURIComponent(s);
  }

  let scramjet = null;
  let scramjetReady = false;
  let scramjetError = null;

  // Public Wisp servers are unreliable. Prefer same-origin /w/ when Nebula is
  // run via `npm start` (local Wisp). This is how Lunar achieves site coverage.
  const WISP_FALLBACKS = [
    'wss://wisp.mercurywork.shop/',
    'wss://wisp.nebulaservices.org/',
    'wss://wisp.wispcraft.uk/'
  ];

  function getLocalWispUrl() {
    // When hosted on GitHub Pages there is no local Wisp.
    // When run via server/index.js, /w/ is available on this origin.
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/w/';
    }
    // Detect self-hosted Nebula (has /api/nebula) — async check fills this later
    if (window.__NEBULA_LOCAL_WISP__) return window.__NEBULA_LOCAL_WISP__;
    return null;
  }

  function getWispUrl() {
    if (settings.wisp === 'custom' && settings.customWisp) {
      return settings.customWisp.trim();
    }
    if (settings.wisp === 'local' || settings.wisp === 'auto') {
      return getLocalWispUrl() || WISP_FALLBACKS[0];
    }
    // Default: try local first if known, else configured / public
    const local = getLocalWispUrl();
    if (local && (!settings.wisp || settings.wisp === 'wss://wisp.mercurywork.shop/')) {
      // Prefer local when available unless user explicitly picked another public server
      if (!settings._userPickedPublicWisp) return local;
    }
    return settings.wisp || local || WISP_FALLBACKS[0];
  }

  async function detectLocalWisp() {
    try {
      const r = await fetch(new URL('/api/nebula', location.href).href, { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (j && j.wisp) {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const path = j.wispPath || '/w/';
        window.__NEBULA_LOCAL_WISP__ = proto + '//' + location.host + path;
        return window.__NEBULA_LOCAL_WISP__;
      }
    } catch (_) {}
    return null;
  }

  async function createTransport(kind, wispUrl) {
    kind = kind || settings.transport || 'epoxy';
    const optsEpoxy = { wisp: wispUrl };
    // libcurl uses websocket key in many builds
    const optsCurl = { websocket: wispUrl, wisp: wispUrl };

    if (kind === 'libcurl') {
      const LibcurlCtor =
        self.LibcurlTransport?.default ||
        self.LibcurlTransport?.CurlClient ||
        self.LibcurlTransport?.CurlTransport ||
        self.LibcurlTransport;
      if (!LibcurlCtor) throw new Error('Libcurl transport script not loaded.');
      const t = new LibcurlCtor(optsCurl);
      if (t.init) await t.init();
      return t;
    }

    const EpoxyCtor =
      self.EpoxyTransport?.default ||
      self.EpoxyTransport?.EpoxyClient ||
      self.EpoxyTransport;
    if (!EpoxyCtor) throw new Error('Epoxy transport script not loaded.');
    const t = new EpoxyCtor(optsEpoxy);
    if (t.init) await t.init();
    return t;
  }

  function isTlsError(e) {
    const msg = String(e && (e.message || e.stack || e));
    return /tls handshake|UnexpectedEof|Hyper client|Connect|ssl|EOF/i.test(msg);
  }

  async function createTransportWithFailover(kind) {
    const preferred = kind || settings.transport || 'epoxy';
    // On TLS failures Epoxy/Hyper often fails; Libcurl handles many sites better.
    const kinds = preferred === 'libcurl'
      ? ['libcurl', 'epoxy']
      : ['epoxy', 'libcurl'];

    const primary = getWispUrl();
    const local = getLocalWispUrl();
    const list = [];
    if (local) list.push(local);
    if (primary && !list.includes(primary)) list.push(primary);
    for (const w of WISP_FALLBACKS) {
      if (!list.includes(w)) list.push(w);
    }

    let lastErr = null;
    for (const k of kinds) {
      for (const wisp of list) {
        try {
          const t = await createTransport(k, wisp);
          console.log('[nebula] transport ready via', k, wisp);
          // Remember what worked so settings UI stays accurate
          settings.transport = k;
          if (wisp === local) settings.wisp = 'local';
          return { transport: t, wisp, kind: k };
        } catch (e) {
          console.warn('[nebula] transport failed', k, wisp, e);
          lastErr = e;
        }
      }
    }
    const hint = isTlsError(lastErr)
      ? ' TLS handshake failed. Run `npm start` for local Wisp, or try Libcurl + another Wisp in Settings.'
      : '';
    throw lastErr
      ? new Error(String(lastErr.message || lastErr) + hint)
      : new Error('All transports/Wisp endpoints failed.' + hint);
  }

  function setupUltravioletConfig() {
    // Path-aware UV config for GitHub Pages project sites
    const base = new URL('.', location.href).pathname; // e.g. /nebula-scramjet/
    if (typeof self.__uv$config !== 'object' || !self.__uv$config) {
      self.__uv$config = {};
    }
    const c = self.__uv$config;
    c.prefix = base + 'uv/service/';
    c.bare = base + 'bare/'; // unused when using bare-mux/wisp, kept for compatibility
    c.encodeUrl = c.encodeUrl || ((url) => {
      try { return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
      catch { return encodeURIComponent(url); }
    });
    c.decodeUrl = c.decodeUrl || ((url) => {
      try {
        url = url.replace(/-/g, '+').replace(/_/g, '/');
        while (url.length % 4) url += '=';
        return atob(url);
      } catch { return decodeURIComponent(url); }
    });
    // Prefer absolute paths for handler/bundle when loaded from CDN
    c.handler = c.handler || 'https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3.2.10/dist/uv.handler.js';
    c.bundle = c.bundle || 'https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3.2.10/dist/uv.bundle.js';
    c.client = c.client || 'https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3.2.10/dist/uv.client.js';
    c.sw = c.sw || 'https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3.2.10/dist/uv.sw.js';
    return c;
  }

  let uvReady = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function initUltraviolet() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Workers required for Ultraviolet.');
    }
    // Load UV only when needed — never block the main UI
    try {
      if (typeof Ultraviolet === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3.2.10/dist/uv.bundle.js');
      }
      setupUltravioletConfig();
      // Prefer XOR codec if available
      if (typeof Ultraviolet !== 'undefined' && Ultraviolet.codec?.xor) {
        self.__uv$config.encodeUrl = Ultraviolet.codec.xor.encode;
        self.__uv$config.decodeUrl = Ultraviolet.codec.xor.decode;
      }
      uvReady = true;
      return true;
    } catch (e) {
      uvReady = false;
      throw e;
    }
  }

  async function initScramjet() {
    const statusEl = document.getElementById('swStatus');
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Workers are not supported in this browser.');
      }
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('Service Workers require a secure context (HTTPS or localhost).');
      }

      statusEl.textContent = 'Registering service worker…';
      statusEl.className = 'sw-status visible';

      const swUrl = new URL('sw.js', location.href).href;
      const scopeUrl = new URL('.', location.href).href;
      await navigator.serviceWorker.register(swUrl, { scope: scopeUrl });
      await navigator.serviceWorker.ready;

      const serviceworker =
        navigator.serviceWorker.controller ??
        (await navigator.serviceWorker.ready).active;

      if (!serviceworker) {
        throw new Error('Service worker registered but no controller is available. Try refreshing.');
      }

      if (typeof $scramjetController === 'undefined' || typeof $scramjet === 'undefined') {
        throw new Error('Scramjet libraries failed to load. Check ./scramjet/ and ./controller/.');
      }

      const { Controller } = $scramjetController;
      const { defaultConfig } = $scramjet;

      if (!Controller || !defaultConfig) {
        throw new Error('Scramjet Controller or defaultConfig missing.');
      }

      statusEl.textContent = 'Connecting transport (' + (settings.transport || 'epoxy') + ')…';

      const { transport, wisp } = await createTransportWithFailover(settings.transport);
      statusEl.textContent = 'Transport OK (' + wisp + ')…';

      const basePath = new URL('.', location.href).pathname;
      const sjPrefix = basePath + '~/sj/';

      const cfg = Object.assign({}, defaultConfig, {
        scramjetPath: new URL('scramjet/scramjet.js', location.href).href,
        wasmPath: new URL('scramjet/scramjet.wasm', location.href).href,
        injectPath: new URL('controller/controller.inject.js', location.href).href
      });

      scramjet = new Controller({
        serviceworker,
        transport,
        scramjetConfig: cfg,
        config: { prefix: sjPrefix }
      });
      await scramjet.wait();
      scramjetReady = true;
      scramjetError = null;

      // Best-effort UV config for dual mode
      try { await initUltraviolet(); } catch (e) { console.warn('UV init', e); }

      statusEl.textContent = 'Ready (' + (settings.transport || 'epoxy') + ')';
      statusEl.className = 'sw-status visible ok';
      setTimeout(() => { statusEl.classList.remove('visible'); }, 2500);

      tabs.forEach(t => {
        if (!t.frame && t.iframe) {
          try { t.frame = scramjet.createFrame(t.iframe); } catch (e) { console.warn('createFrame', e); }
        }
      });
    } catch (e) {
      console.error('Scramjet init failed:', e);
      scramjetError = e;
      scramjetReady = false;
      const msg = String(e && (e.message || e));
      let hint = msg;
      if (/tls handshake|UnexpectedEof|Connect/i.test(msg)) {
        hint = msg + ' — Try Settings → Transport = Libcurl, or pick another Wisp server, then Reconnect.';
      }
      statusEl.textContent = 'Scramjet unavailable: ' + hint;
      statusEl.className = 'sw-status visible error';
    }
  }

  async function reconnectTransport() {
    const statusEl = document.getElementById('swStatus');
    if (statusEl) {
      statusEl.textContent = 'Applying settings (' + (settings.transport || 'epoxy') + ' / ' + (settings.backend || 'scramjet') + ')…';
      statusEl.className = 'sw-status visible';
    }
    scramjetReady = false;
    scramjet = null;
    // Drop existing frames' scramjet handles so they rebuild with new transport
    tabs.forEach(t => { t.frame = null; });
    try {
      await initScramjet();
      if (statusEl && scramjetReady) {
        statusEl.textContent = 'Settings applied — ' + (settings.transport || 'epoxy') + ' · ' + (settings.backend || 'scramjet');
        statusEl.className = 'sw-status visible ok';
        setTimeout(() => statusEl.classList.remove('visible'), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function getProxyVersionInfo() {
    let sj = 'unknown';
    try {
      if (typeof $scramjet !== 'undefined' && $scramjet.versionInfo?.version) {
        sj = $scramjet.versionInfo.version;
      } else if (typeof $scramjet !== 'undefined' && $scramjet.version) {
        sj = String($scramjet.version);
      }
    } catch (_) {}
    let ctrl = 'unknown';
    try {
      if (typeof $scramjetController !== 'undefined' && $scramjetController.version) {
        ctrl = String($scramjetController.version);
      }
    } catch (_) {}
    const wisp = settings.wisp === 'custom' ? (settings.customWisp || 'custom') : (settings.wisp || '—');
    return {
      nebula: NEBULA_VERSION,
      scramjet: sj,
      controller: ctrl,
      backend: settings.backend || 'scramjet',
      transport: settings.transport || 'epoxy',
      wisp: wisp,
      ready: !!scramjetReady
    };
  }

  function showVersionPopup() {
    const modal = document.getElementById('versionModal');
    const body = document.getElementById('versionBody');
    if (!modal || !body) {
      const v = getProxyVersionInfo();
      alert('Nebula ' + v.nebula + '\nScramjet ' + v.scramjet + '\nTransport: ' + v.transport + '\nBackend: ' + v.backend);
      return;
    }
    const v = getProxyVersionInfo();
    body.innerHTML =
      '<div class="ver-row"><span>Nebula</span><span class="ver-val">' + escapeHtml(v.nebula) + '</span></div>' +
      '<div class="ver-row"><span>Scramjet</span><span class="ver-val">' + escapeHtml(v.scramjet) + '</span></div>' +
      '<div class="ver-row"><span>Controller</span><span class="ver-val">' + escapeHtml(v.controller) + '</span></div>' +
      '<div class="ver-row"><span>Backend</span><span class="ver-val">' + escapeHtml(v.backend) + '</span></div>' +
      '<div class="ver-row"><span>Transport</span><span class="ver-val">' + escapeHtml(v.transport) + '</span></div>' +
      '<div class="ver-row"><span>Wisp</span><span class="ver-val">' + escapeHtml(v.wisp) + '</span></div>' +
      '<div class="ver-row"><span>Proxy status</span><span class="ver-val">' + (v.ready ? 'Ready' : 'Not ready') + '</span></div>';
    modal.classList.add('visible');
  }

  function hideVersionPopup() {
    document.getElementById('versionModal')?.classList.remove('visible');
  }

  function applyProxySettingChange(needsReconnect) {
    saveSettings();
    if (needsReconnect) {
      // Transport / Wisp require a full reconnect; backend only affects navigate()
      reconnectTransport();
    }
  }


  function showHome(show) {
    document.getElementById('homePage').classList.toggle('hidden', !show);
    const frames = document.getElementById('framesContainer');
    frames.style.display = show ? 'none' : 'block';
    frames.style.height = show ? '0' : '100%';
  }

  function showError(msg, tech) {
    const page = document.getElementById('errorPage');
    document.getElementById('errorMsg').textContent = msg || 'Unable to load this page.';
    document.getElementById('errorTech').textContent = tech || (scramjetError ? String(scramjetError.stack || scramjetError) : 'No additional details.');
    page.classList.add('visible');
    showHome(false);
  }

  function hideError() { document.getElementById('errorPage').classList.remove('visible'); }

  function setLoading(on) {
    document.getElementById('loadingBar').classList.toggle('active', on);
  }

  function updateUrlBar(url) { document.getElementById('urlBar').value = url || ''; }

  function updateNavButtons() {
    const tab = getActiveTab();
    document.getElementById('backBtn').disabled = !tab || !tab.url;
    document.getElementById('forwardBtn').disabled = true;
  }

  function navigateWithUltraviolet(tab, url) {
    setupUltravioletConfig();
    const cfg = self.__uv$config;
    const encoded = cfg.prefix + cfg.encodeUrl(url);
    // UV path-based navigation in the iframe (works when UV SW controls the scope).
    // On static GitHub Pages without a local uv SW, this may 404 — Scramjet is preferred.
    tab.iframe.src = new URL(encoded, location.href).href;
    tab.backend = 'ultraviolet';
  }

  async function navigateWithScramjet(tab, url) {
    if (!scramjetReady || !scramjet) {
      throw new Error('Scramjet is not ready. Open Settings → set Transport to Libcurl, Wisp to Local if possible, then Reconnect.');
    }
    if (!tab.frame) tab.frame = scramjet.createFrame(tab.iframe);
    try {
      tab.frame.go(url);
    } catch (e) {
      if (isTlsError(e) && settings.transport !== 'libcurl') {
        console.warn('[nebula] TLS on navigate — switching to Libcurl and retrying');
        settings.transport = 'libcurl';
        saveSettings();
        await reconnectTransport();
        if (!scramjetReady) throw e;
        tab.frame = scramjet.createFrame(tab.iframe);
        tab.frame.go(url);
      } else {
        throw e;
      }
    }
    tab.backend = 'scramjet';
  }

  async function navigate(input, tabId) {
    const tab = tabId ? tabs.find(t => t.id === tabId) : getActiveTab();
    if (!tab) return;

    const url = normalizeUrl(input);
    if (!url) return;

    hideError();
    showHome(false);
    updateUrlBar(url);
    setLoading(true);

    tab.url = url;
    try { tab.title = new URL(url).hostname; } catch { tab.title = url; }
    renderTabs();

    const backend = settings.backend || 'scramjet';

    try {
      if (backend === 'ultraviolet') {
        if (!uvReady) await initUltraviolet();
        navigateWithUltraviolet(tab, url);
      } else if (backend === 'auto') {
        if (scramjetReady) {
          try {
            await navigateWithScramjet(tab, url);
          } catch (e) {
            console.warn('Scramjet nav failed, trying UV', e);
            navigateWithUltraviolet(tab, url);
          }
        } else {
          navigateWithUltraviolet(tab, url);
        }
      } else {
        // scramjet
        if (!scramjetReady) {
          setLoading(false);
          if (scramjetError) {
            showError(
              'Scramjet could not start. Open Settings → try Libcurl transport or another Wisp server, then Reconnect.',
              String(scramjetError.stack || scramjetError.message || scramjetError)
            );
          } else {
            showError('Scramjet is still initializing. Please wait and retry.');
          }
          return;
        }
        await navigateWithScramjet(tab, url);
      }

      addRecent(url, tab.title);
      setTimeout(() => {
        setLoading(false);
        try {
          if (tab.iframe.contentDocument) {
            const t = tab.iframe.contentDocument.title;
            if (t) { tab.title = t; renderTabs(); }
          }
        } catch (_) {}
      }, 1500);
    } catch (e) {
      console.error(e);
      setLoading(false);
      const msg = String(e.stack || e.message || e);
      if (/tls handshake|UnexpectedEof|Hyper client/i.test(msg)) {
        showError(
          'TLS handshake failed (common on public Wisp + sites like TikTok). Fix: run `npm start` for local Wisp, or Settings → Transport: Libcurl, Wisp: Local, then Reconnect.',
          msg
        );
        // One automatic recovery attempt if still on epoxy
        if (settings.transport !== 'libcurl') {
          settings.transport = 'libcurl';
          saveSettings();
          reconnectTransport().then(() => {
            const statusEl = document.getElementById('swStatus');
            if (statusEl) {
              statusEl.textContent = 'Switched to Libcurl — retry the page';
              statusEl.className = 'sw-status visible ok';
            }
          });
        }
      } else {
        showError('Unable to load this page.', msg);
      }
    }
    updateNavButtons();
  }

  let particleAnim = null;
  function startParticles() {
    if (!settings.particles) return;
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];

    function resize() {
      w = canvas.width = canvas.parentElement.clientWidth;
      h = canvas.height = canvas.parentElement.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        a: Math.random() * 0.4 + 0.1
      });
    }

    function draw() {
      if (!settings.particles) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(168, 85, 247, ' + p.a + ')';
        ctx.fill();
      }
      particleAnim = requestAnimationFrame(draw);
    }
    if (particleAnim) cancelAnimationFrame(particleAnim);
    draw();
  }

  function stopParticles() {
    if (particleAnim) cancelAnimationFrame(particleAnim);
    particleAnim = null;
    const canvas = document.getElementById('particles');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn('[nebula] missing element #' + id);
  }

  on('newTabBtn', 'click', () => createTab());
  on('backBtn', 'click', () => {
    const tab = getActiveTab();
    if (tab?.frame?.back) tab.frame.back();
    else if (tab?.url) showHome(true);
  });
  on('forwardBtn', 'click', () => {
    const tab = getActiveTab();
    if (tab?.frame?.forward) tab.frame.forward();
  });
  on('reloadBtn', 'click', () => {
    const tab = getActiveTab();
    if (tab?.url) navigate(tab.url);
  });
  on('homeBtn', 'click', () => {
    const tab = getActiveTab();
    if (tab) {
      tab.url = null; tab.title = 'New Tab';
      showHome(true); hideError(); updateUrlBar(''); renderTabs();
    }
  });

  on('urlBar', 'keydown', e => {
    if (e.key === 'Enter') { navigate(e.target.value); e.target.blur(); }
  });
  on('homeSearch', 'keydown', e => {
    if (e.key === 'Enter') navigate(e.target.value);
  });

  on('quickAccess', 'click', e => {
    const tile = e.target.closest('[data-url]');
    if (tile) navigate(tile.dataset.url);
  });

  function syncProxySettingsUI() {
    const be = document.getElementById('settingBackend');
    const tr = document.getElementById('settingTransport');
    const wi = document.getElementById('settingWisp');
    const cu = document.getElementById('settingCustomWisp');
    const row = document.getElementById('customWispRow');
    if (be) be.value = settings.backend || 'scramjet';
    if (tr) tr.value = settings.transport || 'epoxy';
    if (wi) {
      const known = ['local', 'wss://wisp.mercurywork.shop/', 'wss://wisp.nebulaservices.org/', 'wss://wisp.wispcraft.uk/'];
      if (settings.wisp === 'custom' || (settings.wisp && !known.includes(settings.wisp))) {
        wi.value = 'custom';
        if (row) row.style.display = '';
        if (cu) cu.value = settings.customWisp || settings.wisp || '';
      } else {
        wi.value = settings.wisp || known[0];
        if (row) row.style.display = 'none';
      }
    }
  }

  on('settingsBtn', 'click', () => {
    document.getElementById('settingsOverlay').classList.add('visible');
    const se = document.getElementById('settingSearchEngine');
    if (se) se.value = settings.searchEngine;
    document.getElementById('settingAnim')?.classList.toggle('on', settings.animations);
    document.getElementById('settingParticles')?.classList.toggle('on', settings.particles);
    syncProxySettingsUI();
  });
  on('settingsClose', 'click', () => {
    document.getElementById('settingsOverlay').classList.remove('visible');
  });
  on('settingsOverlay', 'click', e => {
    if (e.target === document.getElementById('settingsOverlay')) {
      document.getElementById('settingsOverlay').classList.remove('visible');
    }
  });

  on('settingSearchEngine', 'change', e => {
    settings.searchEngine = e.target.value; saveSettings();
  });
  on('settingAnim', 'click', function () {
    settings.animations = !settings.animations;
    this.classList.toggle('on', settings.animations);
    saveSettings();
  });
  on('settingParticles', 'click', function () {
    settings.particles = !settings.particles;
    this.classList.toggle('on', settings.particles);
    saveSettings();
  });
  on('clearDataBtn', 'click', () => {
    recentSites = [];
    try { localStorage.removeItem('nebula-recent'); localStorage.removeItem('nebula-settings'); } catch (_) {}
    settings = { ...DEFAULT_SETTINGS };
    renderRecent(); applySettings();
    alert('Browsing data cleared.');
  });

  on('fullscreenBtn', 'click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  on('errorRetry', 'click', () => {
    const tab = getActiveTab();
    if (tab?.url) navigate(tab.url);
    else if (!scramjetReady) initScramjet().then(() => { if (tab?.url) navigate(tab.url); });
  });
  on('errorHome', 'click', () => {
    hideError(); document.getElementById('homeBtn')?.click();
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 't') { e.preventDefault(); createTab(); }
      else if (e.key === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
      else if (e.key === 'l') {
        e.preventDefault();
        document.getElementById('urlBar')?.focus();
        document.getElementById('urlBar')?.select();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const next = tabs[(idx + 1) % tabs.length];
        if (next) switchTab(next.id);
      }
    }
  });

  on('settingBackend', 'change', e => {
    settings.backend = e.target.value;
    saveSettings();
    // Backend is used on next navigation — no full reconnect required
    const statusEl = document.getElementById('swStatus');
    if (statusEl) {
      statusEl.textContent = 'Backend set to ' + settings.backend + ' (applies on next load)';
      statusEl.className = 'sw-status visible ok';
      setTimeout(() => statusEl.classList.remove('visible'), 2000);
    }
  });
  on('settingTransport', 'change', e => {
    settings.transport = e.target.value;
    applyProxySettingChange(true); // reconnect with new transport
  });
  on('settingWisp', 'change', e => {
    settings.wisp = e.target.value;
    settings._userPickedPublicWisp = e.target.value !== 'local' && e.target.value !== 'auto';
    const row = document.getElementById('customWispRow');
    if (row) row.style.display = e.target.value === 'custom' ? '' : 'none';
    if (e.target.value !== 'custom') {
      applyProxySettingChange(true);
    } else {
      saveSettings();
    }
  });
  on('settingCustomWisp', 'change', e => {
    settings.customWisp = e.target.value.trim();
    settings.wisp = 'custom';
    if (settings.customWisp) applyProxySettingChange(true);
    else saveSettings();
  });
  on('reconnectBtn', 'click', () => {
    reconnectTransport();
  });
  on('versionBtn', 'click', () => showVersionPopup());
  on('versionClose', 'click', () => hideVersionPopup());
  on('versionOk', 'click', () => hideVersionPopup());
  on('versionModal', 'click', e => {
    if (e.target === document.getElementById('versionModal')) hideVersionPopup();
  });

  // Boot UI first so clicks always work even if Scramjet fails
  try {
    applySettings();
    renderRecent();
    createTab();
  } catch (e) {
    console.error('[nebula] boot UI error', e);
  }
  (async () => {
    try {
      const local = await detectLocalWisp();
      if (local) {
        console.log('[nebula] local Wisp detected:', local);
        // Prefer local automatically for best site compatibility
        if (!settings._userPickedPublicWisp) {
          settings.wisp = 'local';
        }
      }
    } catch (_) {}
    await initScramjet().catch(e => console.error('[nebula] scramjet init', e));
  })();
})();
