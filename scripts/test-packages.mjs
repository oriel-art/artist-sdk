import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Real tarball installs catch missing files and accidental monorepo dependencies.
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'oriel-package-test-'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8',
  env: { ...process.env, npm_config_cache: join(directory, 'cache') } });
try {
  const dependencies = {};
  for (const path of ['.', 'packages/capabilities', 'packages/metadata']) {
    const output = run('npm', ['pack', '--json', '--pack-destination', directory], join(root, path));
    // npm lifecycle output precedes the pack JSON on some npm versions.
    const [info] = JSON.parse(output.slice(output.indexOf('[\n')));
    dependencies[info.name] = `file:${join(directory, info.filename)}`;
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }));
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  await writeFile(join(directory, 'consumer.mjs'), `
    import assert from 'node:assert/strict';
    import { createCapabilities, createPrintWorkflow } from '@oriel-art/capabilities';
    import { createMetadata } from '@oriel-art/metadata';
    import { createArtwork } from '@oriel-art/artist-sdk';
    import { createDiscovery, registerDiscovery } from '@oriel-art/artist-sdk/discovery';
    const capabilities = createCapabilities({ schemaVersion: '1.0', technical: { rendering: {
      width: { min: 1, max: 100 }, height: { min: 1, max: 100 }, maxPixels: 10000, formats: ['image/png']
    } } });
    assert.equal(capabilities.validateRequest({ width: 10, height: 10, format: 'image/png' }).status, 'supported');
    const metadata = createMetadata({ schemaVersion: '1.0', project: { id: 'test', title: 'Test', creators: [{ name: 'Artist' }] } });
    const artwork = createArtwork({ id: 'test', version: '1', seed: 'seed' });
    registerDiscovery(artwork, createDiscovery({ schemaVersion: 'oriel-artwork/1.0', artwork: { id: 'test', version: '1' },
      metadata: metadata.getMetadata(), capabilities: capabilities.getCapabilities() }));
    assert.equal((await artwork.query('metadata')).project.title, 'Test');
    const printPolicy = capabilities.getCapabilities();
    printPolicy.technical.print = { width: { min: 1, max: 1 }, height: { min: 1, max: 1 }, dpi: { min: 100, max: 100 } };
    const workflow = createPrintWorkflow({ artwork, capabilities: printPolicy,
      capture: art => ({ recipe: art.getRecipe(), frame: { aspectRatio: 1 } }) });
    const job = workflow.captureJob(JSON.stringify({ id: 'fixture', request: { width: 100, height: 100, format: 'image/png',
      print: { width: 1, height: 1, unit: 'in', dpi: 100 } }, specification: {
        paper: 'Fixture', printer: 'Fixture', colourProfile: 'Fixture', renderingIntent: 'perceptual', grain: 'Fixture', lineWeight: 'Fixture'
      } }));
    const report = await job.screen();
    assert.equal(report.screening.status, 'requires-evaluation');
    assert.deepEqual(Object.keys(report).sort(), ['job', 'screening']);
  `);
  run(process.execPath, ['consumer.mjs'], directory);
  await writeFile(join(directory, 'consumer.ts'), `
    import { createCapabilities, createPrintWorkflow, type PrintCapture, type Capabilities } from '@oriel-art/capabilities';
    import { createMetadata, type Metadata } from '@oriel-art/metadata';
    import { createDiscovery, type DiscoveryManifest } from '@oriel-art/artist-sdk/discovery';
    declare const capabilities: Capabilities;
    declare const metadata: Metadata;
    declare const manifest: DiscoveryManifest;
    createCapabilities(capabilities).validateRequest({ width: 10, height: 10, format: 'image/png' });
    createMetadata(metadata).getProvenanceReferences();
    createDiscovery(manifest).getDiscovery();
    declare const captured: PrintCapture;
    createPrintWorkflow({ artwork: { id: 'test', version: '1' }, capabilities, capture: () => captured });
  `);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--target', 'ES2022',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts'], directory);
  console.log('All three tarballs install offline, load independently, and resolve TypeScript declarations.');
} finally { await rm(directory, { recursive: true, force: true }); }
