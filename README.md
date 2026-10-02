# Nebula — Futuristic Scramjet Browser

A completely redesigned purple-themed Scramjet web browser inspired by [Cherri](https://github.com/x8rr/cherri).

**Not a color swap.** Full browser UI with tabs, home page, settings, loading states, and real Scramjet integration.

**Repo:** https://github.com/mathissofun137/nebula-scramjet

## Quick start

```sh
git clone https://github.com/mathissofun137/nebula-scramjet.git
cd nebula-scramjet

# Download Scramjet runtime + remaining controller files (required once)
bash scripts/fetch-scramjet.sh

# Optional: if assets/app.js is missing, copy from a local build or ask the maintainer
# Serve locally (HTTPS or localhost required for service workers)
python3 -m http.server 3000
# open http://localhost:3000
```

## Features

- Dark purple / neon aesthetic with glassmorphism
- Real browser chrome: back, forward, reload, home, URL bar, settings, fullscreen
- Tab system (Ctrl+T / Ctrl+W / Ctrl+Tab / Ctrl+L)
- Search or URL navigation with configurable search engines
- Home page with quick links + recent sites (localStorage)
- Settings panel (search engine, animations, particles, clear data)
- Loading progress bar and error page with technical details
- Responsive (desktop, tablet, mobile)
- Relative asset paths for GitHub Pages, jsDelivr, Cloudflare Pages, Netlify, Vercel

## Scramjet

Uses Mercury Workshop Scramjet v2 (controller + service worker + Epoxy) based on [x8rr/scramjet-templates](https://github.com/x8rr/scramjet-templates).

### jsDelivr note

Opening via `cdn.jsdelivr.net` may block full proxy behavior (service worker / MIME / scope). Prefer GitHub Pages or self-host. The UI still loads; Scramjet failures show a clear error page.

## Deploy

1. Run `bash scripts/fetch-scramjet.sh` so `scramjet/` and full `controller/` exist.
2. Ensure `assets/app.js` is present (browser logic).
3. Deploy the folder to any static host.

## Attribution

- [Mercury Workshop / Scramjet](https://github.com/MercuryWorkshop/scramjet)
- [x8rr/scramjet-templates](https://github.com/x8rr/scramjet-templates)
- Inspired by [Cherri](https://github.com/x8rr/cherri)

This proxy does **not** provide anonymity. Use responsibly.

## License

AGPL-3.0 where applicable; Scramjet follows its upstream license.
