# Nebula — Scramjet Browser

Futuristic purple Scramjet browser inspired by Cherri, with real browser UI.

## Why only some sites work on GitHub Pages

**Scramjet needs a Wisp server** to fetch remote sites. Public Wisp endpoints are rate-limited and often fail (TLS errors, broken pages).

[Lunar v2](https://github.com/lunar-proxy/lunar-v2) works on more sites because it runs a **Node server with local Wisp**. Nebula now supports the same pattern.

| Host | Local Wisp | Site compatibility |
|------|------------|--------------------|
| `npm start` (this repo) | Yes (`/w/`) | Best |
| Render / Railway / VPS | Yes | Best |
| GitHub Pages / jsDelivr | No | Limited (public Wisp only) |

## Recommended: run with local Wisp

```bash
npm install
npm start
```

Open **http://localhost:8080**

Settings → Wisp should show **Local (recommended)**. That connects to `ws://localhost:8080/w/` on your machine — same approach Lunar uses.

## GitHub Pages (limited)

Static hosting cannot run Wisp. Expect:
- Some sites work (simple HTML)
- Many sites fail (TLS handshake, broken JS apps)

For real use, deploy the Node server (Render, Railway, a VPS, etc.).

## Features

- Purple glassmorphism browser UI
- Tabs, URL bar, history, settings
- Scramjet proxy with Epoxy / Libcurl transport
- Optional Ultraviolet backend
- Version popup
- Settings that reconfigure the proxy

## Credits

- [Scramjet](https://github.com/MercuryWorkshop/scramjet) — Mercury Workshop
- [Lunar v2](https://github.com/lunar-proxy/lunar-v2) — reference for server + Wisp architecture
- [Cherri](https://github.com/x8rr/cherri) / [scramjet-templates](https://github.com/x8rr/scramjet-templates)
