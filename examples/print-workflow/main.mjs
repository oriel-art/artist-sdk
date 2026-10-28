import { createArtwork } from '../../src/index.js';
import { createPrintWorkflow } from '../../src/capabilities.js';

// Workflow fixtures only: NOT approved Kepler print specifications or quality measurements.
const ratio = 1512 / 803;
const artwork = createArtwork({ id: 'print-pilot', version: '1', seed: 'saved-composition', mode: 'studio',
  parameters: { grain: { type: 'number', min: 0, max: 1, default: 0.5 } } });
const frame = { elapsedSeconds: 12.5, cadence: 1, aspectRatio: ratio };
const capabilities = { schemaVersion: '1.0', technical: {
  rendering: { width: { min: 64, max: 8192 }, height: { min: 64, max: 8192 },
    maxPixels: 16777216, formats: ['image/png'], aspectRatios: [ratio] },
  print: { width: { min: 1, max: 24 }, height: { min: 1, max: 24 }, dpi: { min: 72, max: 600 } }
}, artist: { rendering: { aspectRatios: [ratio] } } };

// Reuse this function across jobs/workflows so the inspector shares one budget.
async function inspectSavedFrame(job, { signal }) {
  if (signal.aborted) throw new Error('Inspection cancelled');
  // Replace with isolated rendering of job.capture at job.request dimensions,
  // then artist-owned checks against job.specification. No actual render here.
  return {
    grain: { status: 'not-assessed', notes: 'Fixture: grain comparison has not been performed.' },
    lineWeight: { status: 'not-assessed', notes: 'Fixture: line-weight inspection has not been performed.' },
    colour: { status: 'not-assessed', notes: 'Fixture: colour comparison has not been performed.' }
  };
}

const workflow = createPrintWorkflow({ artwork, capabilities,
  capture: art => ({ recipe: art.getRecipe(), frame,
    uniforms: { u_grain: art.parameters.grain, u_time: frame.elapsedSeconds } }),
  inspect: inspectSavedFrame });
const job = workflow.captureJob({ id: 'print-candidate-1',
  request: { width: 2048, height: 1088, format: 'image/png',
    print: { width: 8, height: 4.25, unit: 'in', dpi: 256 } },
  specification: {
    paper: 'Illustrative paper candidate — select with printer',
    printer: 'Illustrative printer candidate — select with printer',
    colourProfile: 'Illustrative profile identifier — select with printer',
    renderingIntent: 'relative-colorimetric',
    grain: 'Compare against the artist-defined grain reference at physical size',
    lineWeight: 'Compare continuity and visibility against the artist-defined reference',
    media: { finish: 'matte', settings: { candidateOnly: true } },
    extensions: { 'art.oriel.print-pilot.v1': { unresolved: ['printer', 'stock', 'iccProfile', 'criteria'] } },
    notes: 'Fixture only; replace these criteria with the artist-defined settings.'
  } });

const pending = job.screen();
artwork.setParameters({ grain: 0.9 });
frame.elapsedSeconds = 99;
const report = await pending;
console.log(JSON.stringify(report, null, 2));
// In a browser, download this JSON alongside the exported image. Reopen through
// the artist's loader using report.job.capture.recipe/frame/uniforms together.
// Use report.screening and report.checks to see the results for this saved job.
