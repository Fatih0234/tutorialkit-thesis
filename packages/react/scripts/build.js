import { copyFileSync, rmSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path, { extname } from 'node:path';
import chokidar from 'chokidar';
import { execa } from 'execa';

const isWatch = process.argv.includes('--watch');

await buildJS();
await copyCSS();
await copyPyodideAssets();

async function buildJS() {
  const args = ['-b', 'tsconfig.build.json', isWatch && '--watch', '--preserveWatchOutput'].filter((s) => !!s);
  const promise = execa('tsc', args, { preferLocal: true, stdio: 'inherit' });

  if (!isWatch) {
    await promise;
  }
}

async function copyPyodideAssets() {
  rmSync('./dist/runtimes/python/pyodide', { recursive: true, force: true });
  await cp('./node_modules/pyodide', './dist/runtimes/python/pyodide', {
    recursive: true,
    dereference: true,
    filter: (filename) =>
      ['pyodide', 'pyodide-lock.json', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip'].some((name) =>
        filename.endsWith(name),
      ),
  });
}

async function copyCSS() {
  const src = './src';
  const dist = './dist';

  await cp(src, dist, {
    recursive: true,
    filter: (filename) => {
      const extension = extname(filename);
      const isDirectory = extension === '';

      return isDirectory || extension === '.css';
    },
  });

  if (isWatch) {
    chokidar.watch(src).on('all', (event, filePath, stats) => {
      if (stats?.isDirectory() !== true && filePath.endsWith('.css')) {
        const target = path.join(dist, path.relative(src, filePath));

        if (event === 'unlink') {
          rmSync(target);
        } else {
          copyFileSync(filePath, target);
        }
      }
    });
  }
}
