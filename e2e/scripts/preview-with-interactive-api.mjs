import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  createInteractivePersistenceMiddleware,
  handleInteractiveAiRequest,
} from '../../packages/astro/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);

  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
}

const distDirectory = path.resolve(__dirname, '..', getArg('--dir', 'dist'));
const port = Number(getArg('--port', process.env.PORT ?? '4329'));
const apiMiddleware = createInteractivePersistenceMiddleware();

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
]);

function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

async function resolveStaticFile(urlPathname) {
  const decodedPathname = decodeURIComponent(urlPathname);
  const safePathname = decodedPathname.replace(/^\/+/, '');
  const candidatePath = path.resolve(distDirectory, safePathname);

  if (!candidatePath.startsWith(distDirectory)) {
    return undefined;
  }

  const candidates = [candidatePath, path.join(candidatePath, 'index.html')];

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate);

      if (fileStat.isFile()) {
        return { filePath: candidate, size: fileStat.size };
      }
    } catch {
      // Try next candidate.
    }
  }

  return undefined;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname.startsWith('/api/interactive/ai')) {
    void handleInteractiveAiRequest(req, res, () => apiMiddleware(req, res, () => sendNotFound(res)));
    return;
  }

  if (url.pathname.startsWith('/api/interactive')) {
    apiMiddleware(req, res, () => sendNotFound(res));
    return;
  }

  void (async () => {
    const file = await resolveStaticFile(url.pathname === '/' ? '/index.html' : url.pathname);

    if (!file) {
      sendNotFound(res);
      return;
    }

    const extension = path.extname(file.filePath).toLowerCase();

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypes.get(extension) ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    createReadStream(file.filePath).pipe(res);
  })().catch((error) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(error instanceof Error ? error.message : 'Preview server error');
  });
});

server.listen(port, () => {
  console.log(`Interactive preview server listening on http://localhost:${port}/`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
