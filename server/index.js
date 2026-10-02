/**
 * Nebula production server
 * - Serves static browser UI
 * - Hosts a local Wisp endpoint at /w/ (required for reliable site support)
 *
 * Same architecture pattern as Lunar v2: public static hosts cannot run Wisp;
 * self-hosting with this server is what makes most sites work.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

logging.set_level(logging.ERROR);
Object.assign(wisp.options, {
  dns_method: 'resolve',
  dns_servers: ['1.1.1.1', '1.0.0.1', '8.8.8.8'],
  dns_result_order: 'ipv4first',
  wisp_version: 2,
  wisp_motd: 'nebula-wisp',
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveStatic(req, res) {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    // prevent path traversal
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const st = await stat(filePath);
    if (!st.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': urlPath.includes('scramjet') || urlPath.includes('controller')
        ? 'public, max-age=3600'
        : 'no-cache',
      // Helpful for Scramjet / SharedArrayBuffer style features on some sites
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = createServer((req, res) => {
  // Health / meta
  if (req.url === '/api/nebula' || req.url?.startsWith('/api/nebula?')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Nebula',
      version: '1.1.0',
      wisp: true,
      wispPath: '/w/',
    }));
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/w/' || req.url?.startsWith('/w/')) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Nebula listening on http://localhost:${PORT}`);
  console.log(`Local Wisp at ws://localhost:${PORT}/w/ (wss when behind HTTPS)`);
  console.log('Open that URL in your browser for full proxy support.');
});
