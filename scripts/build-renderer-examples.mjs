import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({ entryPoints: [`${root}/examples/renderers/main.js`], outfile: `${root}/examples/renderers/bundle.js`,
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline' });
