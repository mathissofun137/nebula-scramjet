(function () {
  'use strict';

  const DEFAULT_SETTINGS = { searchEngine: 'google', animations: true, particles: true };
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
    return String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
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
      const reg = await navigator.serviceWorker.register(swUrl, { scope: scopeUrl });
      await navigator.serviceWorker.ready;

      const serviceworker =
        navigator.serviceWorker.controller ??
        (await navigator.serviceWorker.ready).active;

      if (!serviceworker) {
        throw new Error('Service worker registered but no controller is available. Try refreshing.');
      }

      if (location.hostname.includes('jsdelivr.net')) {
        console.warn('Running on jsDelivr. Service Worker may be limited by CDN caching, MIME types, or path rules.');
      }

      if (typeof $scramjetController === 'undefined' || typeof $scramjet === 'undefined') {
        throw new Error('Scramjet libraries failed to load. Check that ./scramjet/ and ./controller/ are accessible from this origin.');
      }

      const { Controller } = $scramjetController;
      const { defaultConfig } = $scramjet;
      const EpoxyTransport = self.EpoxyTransport?.default || self.EpoxyTransport;

      if (!Controller || !defaultConfig) {
        throw new Error('Scramjet Controller or defaultConfig missing.');
      }

      statusEl.textContent = 'Connecting transport…';

      const transport = new EpoxyTransport({ wisp: 'wss://wisp.mercurywork.shop/' });
      await transport.init();

      // Base path for GitHub Pages project sites, subfolders, etc.
      // e.g. https://user.github.io/nebula-scramjet/ → "/nebula-scramjet/"
      const basePath = new URL('.', location.href).pathname;
      // Scramjet proxy prefix MUST stay under the SW scope (same base path).
      // Default "/~/sj/" would hit github.io/~/sj/ and 404 on project Pages.
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
        // Override default prefix "/~/sj/" so it lives under the deployment base path
        config: { prefix: sjPrefix }
      });
      await scramjet.wait();
      scramjetReady = true;
      scramjetError = null;

      statusEl.textContent = 'Ready';
      statusEl.className = 'sw-status visible ok';
      setTimeout(() => { statusEl.classList.remove('visible'); }, 2000);

      tabs.forEach(t => {
        if (!t.frame && t.iframe) {
          try { t.frame = scramjet.createFrame(t.iframe); } catch (e) { console.warn('createFrame', e); }
        }
      });
    } catch (e) {
      console.error('Scramjet init failed:', e);
      scramjetError = e;
      scramjetReady = false;
      statusEl.textContent = 'Scramjet unavailable: ' + (e.message || e);
      statusEl.className = 'sw-status visible error';
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

    if (!scramjetReady) {
      setLoading(false);
      if (scramjetError) {
        showError('Scramjet could not start in this environment.', String(scramjetError.stack || scramjetError.message || scramjetError));
      } else {
        showError('Scramjet is still initializing. Please wait a moment and retry.');
      }
      return;
    }

    try {
      if (!tab.frame) tab.frame = scramjet.createFrame(tab.iframe);
      tab.frame.go(url);
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
      showError('Unable to load this page.', String(e.stack || e.message || e));
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

  document.getElementById('newTabBtn').addEventListener('click', () => createTab());
  document.getElementById('backBtn').addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.frame?.back) tab.frame.back();
    else if (tab?.url) showHome(true);
  });
  document.getElementById('forwardBtn').addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.frame?.forward) tab.frame.forward();
  });
  document.getElementById('reloadBtn').addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.url) navigate(tab.url);
  });
  document.getElementById('homeBtn').addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab) {
      tab.url = null; tab.title = 'New Tab';
      showHome(true); hideError(); updateUrlBar(''); renderTabs();
    }
  });

  document.getElementById('urlBar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { navigate(e.target.value); e.target.blur(); }
  });
  document.getElementById('homeSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') navigate(e.target.value);
  });

  document.getElementById('quickAccess').addEventListener('click', e => {
    const tile = e.target.closest('[data-url]');
    if (tile) navigate(tile.dataset.url);
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.add('visible');
    document.getElementById('settingSearchEngine').value = settings.searchEngine;
    document.getElementById('settingAnim').classList.toggle('on', settings.animations);
    document.getElementById('settingParticles').classList.toggle('on', settings.particles);
  });
  document.getElementById('settingsClose').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.remove('visible');
  });
  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsOverlay')) {
      document.getElementById('settingsOverlay').classList.remove('visible');
    }
  });

  document.getElementById('settingSearchEngine').addEventListener('change', e => {
    settings.searchEngine = e.target.value; saveSettings();
  });
  document.getElementById('settingAnim').addEventListener('click', function () {
    settings.animations = !settings.animations;
    this.classList.toggle('on', settings.animations);
    saveSettings();
  });
  document.getElementById('settingParticles').addEventListener('click', function () {
    settings.particles = !settings.particles;
    this.classList.toggle('on', settings.particles);
    saveSettings();
  });
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    recentSites = [];
    try { localStorage.removeItem('nebula-recent'); localStorage.removeItem('nebula-settings'); } catch (_) {}
    settings = { ...DEFAULT_SETTINGS };
    renderRecent(); applySettings();
    alert('Browsing data cleared.');
  });

  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.getElementById('errorRetry').addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.url) navigate(tab.url);
    else if (!scramjetReady) initScramjet().then(() => { if (tab?.url) navigate(tab.url); });
  });
  document.getElementById('errorHome').addEventListener('click', () => {
    hideError(); document.getElementById('homeBtn').click();
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 't') { e.preventDefault(); createTab(); }
      else if (e.key === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
      else if (e.key === 'l') {
        e.preventDefault();
        document.getElementById('urlBar').focus();
        document.getElementById('urlBar').select();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const next = tabs[(idx + 1) % tabs.length];
        if (next) switchTab(next.id);
      }
    }
  });

  applySettings();
  renderRecent();
  createTab();
  initScramjet();
})();
