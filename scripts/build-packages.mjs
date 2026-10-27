import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const name of ['capabilities', 'metadata']) {
  const out = `${root}/packages/${name}/dist`;
  await mkdir(out, { recursive: true });
  await build({ entryPoints: [`${root}/src/${name}.js`], outfile: `${out}/index.js`,
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022' });
  await copyFile(`${root}/src/${name}.d.ts`, `${out}/index.d.ts`);
  await copyFile(`${root}/docs/capabilities-and-metadata.md`, `${out}/guide.md`);
}
