# Nebula — Futuristic Scramjet Browser

A completely redesigned purple-themed Scramjet web browser inspired by [Cherri](https://github.com/x8rr/cherri).

**Not a color swap.** Full browser UI with tabs, home page, settings, loading states, and real Scramjet integration.

## Features

- Dark purple / neon aesthetic with glassmorphism
- Real browser chrome: back, forward, reload, home, URL bar, settings, fullscreen
- Tab system (Ctrl+T / Ctrl+W / Ctrl+Tab / Ctrl+L)
- Search or URL navigation with configurable search engines
- Home page with quick links + recent sites (localStorage)
- Settings panel (search engine, animations, particles, clear data)
- Loading progress bar and error page with technical details
- Responsive (desktop, tablet, mobile)
- Relative asset paths for GitHub Pages, jsDelivr, Cloudflare Pages, Netlify, Vercel, custom domains

## Scramjet

Uses the official Mercury Workshop Scramjet v2 architecture (controller + service worker + Epoxy transport) based on [x8rr/scramjet-templates](https://github.com/x8rr/scramjet-templates).

- Service worker registered with a deployment-aware scope
- Paths resolved relative to the current page (no hard-coded `/assets/...`)
- Graceful failure UI if the SW cannot control the page

### jsDelivr / CDN note

Service workers must be same-origin and control a scope under that origin. When you open:

`https://cdn.jsdelivr.net/gh/USER/REPO@main/index.html`

the origin is `cdn.jsdelivr.net`. Registration may succeed, but caching, MIME types for `.wasm` / SW scripts, and path rewriting can prevent full proxy functionality.

**This project detects the environment and surfaces a clear error instead of pretending the proxy works.**

For reliable Scramjet:

1. Prefer GitHub Pages, Cloudflare Pages, Netlify, or Vercel (same origin as your static files)
2. Or self-host with any static server over HTTPS / localhost

UI, CSS, JS, and assets still load correctly from jsDelivr; only the proxy layer may be restricted by browser/CDN rules.

## Run locally

```sh
# any static server
python3 -m http.server 3000
# or
npx serve .
# or
bunx serve .
```

Open `http://localhost:3000`. Service workers require a secure context (HTTPS or localhost).

## Deploy

Copy the entire folder (including `scramjet/`, `controller/`, `sw.js`, `assets/`) to your static host. No build step.

### Structure

```
index.html
sw.js
assets/
  styles.css
  app.js
controller/          # Scramjet controller (vendored)
scramjet/
  scramjet.js
  scramjet.wasm
```

## Attribution

- [Mercury Workshop / Scramjet](https://github.com/MercuryWorkshop/scramjet)
- [x8rr/scramjet-templates](https://github.com/x8rr/scramjet-templates)
- Inspired by [Cherri](https://github.com/x8rr/cherri)

This proxy does **not** provide anonymity. Use responsibly.

## License

AGPL-3.0 (consistent with Scramjet templates / Cherri lineage where applicable). Scramjet itself follows its upstream license.
