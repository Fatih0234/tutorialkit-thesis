import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { VitePlugin } from '../types.js';

const require = createRequire(import.meta.url);
const ASSETS = ['pyodide-lock.json', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip'] as const;
const URL_PREFIX = '/_tutorialkit/pyodide/';

function assetPath(name: (typeof ASSETS)[number]): string {
  const reactPackage = require.resolve('@tutorialkit/react/package.json');
  return join(dirname(reactPackage), 'dist', 'runtimes', 'python', 'pyodide', name);
}

let isBuild = false;

export const pythonRuntimeAssets: VitePlugin = {
  name: 'tutorialkit-python-runtime-assets',
  configResolved(config) {
    isBuild = config.command === 'build';
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const name = request.url?.startsWith(URL_PREFIX) ? request.url.slice(URL_PREFIX.length) : '';

      if (!ASSETS.includes(name as (typeof ASSETS)[number])) {
        return next();
      }

      const contentType = name.endsWith('.wasm')
        ? 'application/wasm'
        : name.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : name.endsWith('.json')
            ? 'application/json; charset=utf-8'
            : 'application/zip';

      response.setHeader('Content-Type', contentType);
      response.end(readFileSync(assetPath(name as (typeof ASSETS)[number])));
    });
  },
  buildStart() {
    if (!isBuild) {
      return;
    }

    for (const name of ASSETS) {
      this.emitFile({ type: 'asset', fileName: `_tutorialkit/pyodide/${name}`, source: readFileSync(assetPath(name)) });
    }
  },
};
