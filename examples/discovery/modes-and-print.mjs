import { pathToFileURL } from 'node:url';
import { createArtwork, fromRecipe } from '../../src/index.js';
import { createCapabilities } from '../../src/capabilities.js';
import { createDiscovery, registerDiscovery } from '../../src/discovery.js';

// Synthetic workflow fixtures inspired by reported integration needs. These are
// NOT Kepler's Dream source, artist-approved print limits, or print-quality tests.
export const EXAMPLE_ASPECT_RATIO = 1512 / 803;
const frameContract = {
  id: 'example-composition-frame', version: '1',
  validate: frame => Object.keys(frame).sort().join(',') === 'aspectRatio,cadence,elapsedSeconds'
    && Number.isFinite(frame.elapsedSeconds) && frame.elapsedSeconds >= 0
    && Number.isFinite(frame.cadence) && frame.cadence > 0
    && Number.isFinite(frame.aspectRatio) && frame.aspectRatio > 0
};
const artworkOptions = {
  id: 'mode-and-print-example', version: '1', seed: 'example-seed',
  parameters: { grain: { type: 'number', min: 0, max: 1, default: 0.5 } },
  context: frameContract
};

export function rendererCapabilities(aspectRatio = EXAMPLE_ASPECT_RATIO) {
  return { schemaVersion: '1.0', technical: {
    rendering: { width: { min: 64, max: 8192 }, height: { min: 64, max: 8192 },
      maxPixels: 16777216, formats: ['image/png'], aspectRatios: [aspectRatio], aspectRatioRounding: 'nearest' },
    // Illustrative units/ranges only. Replace after artist/printer review.
    print: { width: { min: 1, max: 24 }, height: { min: 1, max: 24 }, dpi: { min: 72, max: 600 }, tiling: false },
    interaction: { pointer: true }, animation: { supported: true, pause: true, seek: true },
    state: { save: true, restore: true } // State replay, no pixel-identity claim.
  }, artist: {
    rendering: { aspectRatios: [aspectRatio], aspectRatioRounding: 'nearest' },
    notes: 'Example fixtures only. State replay requires the saved seed, parameters, time, cadence and aspect ratio. Print quality needs separate review.'
  }, evaluation: 'required' };
}

function modeCapabilities(mode, aspectRatio) {
  const capabilities = rendererCapabilities(aspectRatio);
  if (mode === 'collector') {
    capabilities.technical.animation.seek = false;
    capabilities.technical.state.restore = false;
    delete capabilities.technical.print;
  }
  return capabilities;
}

export function createModeExample(mode = 'studio') {
  if (!['studio', 'collector'].includes(mode)) throw new Error('Unknown example mode');
  const artwork = createArtwork({ ...artworkOptions, mode: mode === 'studio' ? 'studio' : 'published' });
  const discovery = createDiscovery({ schemaVersion: 'oriel-artwork/1.0',
    artwork: { id: artwork.id, version: artwork.version },
    capabilities: modeCapabilities(mode, EXAMPLE_ASPECT_RATIO) });
  // No commands are registered, even in studio. Local controls and remote
  // bridge operations are separate surfaces; discovery does not grant access.
  const unregister = registerDiscovery(artwork, discovery);
  return { artwork, discovery, unregister };
}

export function createSavedPrintJob(artwork, { frame, request, inspect }) {
  if (artwork.mode !== 'studio') throw new Error('Printing is unavailable in this example mode');
  if (typeof inspect !== 'function') throw new Error('An artist-owned inspection callback is required');
  // Bind evaluation to one saved composition, frame and output specification.
  // Later live parameter/playback changes cannot change what this job describes.
  const job = { recipe: artwork.getRecipe({ context: frame }), request: structuredClone(request) };
  const capabilities = modeCapabilities('studio', job.recipe.context.data.aspectRatio);
  const provider = createCapabilities(capabilities, { evaluate: async (output, { signal }) => {
    const checks = await inspect({ recipe: structuredClone(job.recipe), request: output, signal });
    const names = ['grain', 'lineWeight', 'colour'];
    if (!checks || names.some(name => typeof checks[name] !== 'boolean')) throw new Error('Inspection must explicitly report grain, lineWeight and colour checks');
    const failed = names.filter(name => !checks[name]);
    return { supported: failed.length === 0, reasons: failed.map(name => `${name}: not passed for this saved frame and output`) };
  } });
  return {
    getJob: () => structuredClone(job),
    getCapabilities: provider.getCapabilities,
    validate: () => provider.validateRequest(job.request),
    async screen(options) {
      return { job: structuredClone(job), screening: await provider.evaluateRequest(job.request, options),
        printApproval: 'not-granted' };
    }
  };
}

export async function runExample() {
  const studio = createModeExample('studio'), collector = createModeExample('collector');
  const frame = { elapsedSeconds: 12.5, cadence: 1, aspectRatio: EXAMPLE_ASPECT_RATIO };
  const request = { width: 2048, height: 1088, format: 'image/png',
    print: { width: 8, height: 4.25, unit: 'in', dpi: 256 } };
  // This fixture only demonstrates the callback contract. A production callback
  // must restore/render the supplied recipe in an isolated worker/renderer,
  // inspect the output at the requested physical size, and honor signal.
  const job = createSavedPrintJob(studio.artwork, { frame, request, inspect: async () => ({
    grain: true, lineWeight: true, colour: false // No colour proof in this fixture.
  }) });
  const saved = job.getJob();
  const restored = fromRecipe(saved.recipe, artworkOptions);
  console.log('Saved composition and frame:', restored.getRecipe());
  console.log('Local studio supports seeking:', studio.discovery.getCapabilities().technical.animation.seek);
  console.log('Collector supports seeking:', collector.discovery.getCapabilities().technical.animation.seek);
  console.log('Viewer-accessible commands:', studio.artwork.manifest().commands);
  console.log('Rounded print preflight:', job.validate());
  console.log('Saved-frame screening (not print approval):', await job.screen());
  studio.unregister(); collector.unregister();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runExample();
