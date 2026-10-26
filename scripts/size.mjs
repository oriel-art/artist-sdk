import { build, version } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const entries = {
  'randomness': "export { createRandom } from './src/random.js'",
  'parameters + recipes': "export { createArtwork, fromRecipe } from './src/index.js'",
  'browser helpers': "export * from './src/browser.js'",
  'bridge, both sides': "export * from './src/bridge.js'",
  'shader runner': "export * from './src/webgl.js'",
  'core + render + bridge': "export * from './src/index.js'; export * from './src/webgl.js'; export * from './src/bridge.js'",
  'info popup': "export * from './src/info.js'",
  'parameter testing': "export * from './src/testing.js'",
  'parameter panel': "export * from './src/parameter-panel.js'"
};
console.log(`esbuild ${version}; browser ESM, ES2022, minified, bundled with dependencies; gzip level 9`);
for (const [name, contents] of Object.entries(entries)) {
  const result = await build({ stdin: { contents, resolveDir: root }, bundle: true, minify: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false });
  const bytes = result.outputFiles[0].contents;
  console.log(`${name.padEnd(24)} ${String(bytes.length).padStart(6)} bytes  ${String(gzipSync(bytes, { level: 9 }).length).padStart(6)} gzip bytes`);
}
console.log('Alternatives, not additive. Artwork, shaders, assets, and example UI are excluded. No runtime dependencies.');
