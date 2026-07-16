/* eslint-disable @typescript-eslint/naming-convention */
declare const __PYODIDE_BASE_URL__: string;
declare const __PYODIDE_WORKER_URL__: string;

// https://github.com/micromatch/picomatch?tab=readme-ov-file#api
declare module 'picomatch/posix' {
  export { default } from 'picomatch';
}
