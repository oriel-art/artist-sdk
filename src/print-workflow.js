import { createCapabilities } from './capabilities.js';
import { data, fields, positive, text } from './description-data.js';
import { identifier, object, requireValue, synchronous } from './errors.js';

export const PRINT_JOB_VERSION = 'oriel-print-job/1.0';
const MAX_JOB_BYTES = 131072;
const activeInspections = new WeakMap();
const checkNames = ['grain', 'lineWeight', 'colour'];

function specificationData(input) {
  const value = data(input, 8192);
  fields(value, ['paper', 'printer', 'colourProfile', 'renderingIntent', 'grain', 'lineWeight', 'notes'], 'print specification');
  for (const name of ['paper', 'printer', 'colourProfile', 'grain', 'lineWeight']) text(value[name], name);
  requireValue(['perceptual', 'relative-colorimetric', 'absolute-colorimetric', 'saturation'].includes(value.renderingIntent), 'Invalid rendering intent');
  if (value.notes !== undefined) text(value.notes, 'print notes');
  return value;
}

function captureData(input, artwork, capabilities) {
  const value = data(input, 65536);
  fields(value, ['recipe', 'frame', 'uniforms'], 'print capture');
  requireValue(object(value.recipe) && value.recipe.artworkId === artwork.id
    && value.recipe.artworkVersion === artwork.version, 'Captured recipe must identify this artwork and version');
  requireValue(object(value.frame), 'Captured frame must be an object');
  positive(value.frame.aspectRatio, 'captured frame aspect ratio');
  if (value.uniforms !== undefined) requireValue(object(value.uniforms), 'Captured uniforms must be an object');
  for (const source of ['technical', 'artist']) {
    const ratios = capabilities[source]?.rendering?.aspectRatios;
    requireValue(!ratios || ratios.includes(value.frame.aspectRatio), `Captured frame violates ${source} aspect ratios`, 'ASPECT_RATIO');
  }
  return value;
}

function checksData(input) {
  const value = data(input, 8192);
  fields(value, checkNames, 'print checks');
  for (const name of checkNames) {
    fields(value[name], ['passed', 'notes'], `${name} check`);
    requireValue(typeof value[name].passed === 'boolean', `${name} must explicitly report passed`);
    if (value[name].notes !== undefined) text(value[name].notes, `${name} notes`);
  }
  return value;
}

async function inspectJob(inspect, job, signal) {
  // Share capacity across jobs AND workflow instances using the same inspector.
  requireValue((activeInspections.get(inspect) ?? 0) < 4, 'Too many active print inspections', 'BUSY');
  activeInspections.set(inspect, (activeInspections.get(inspect) ?? 0) + 1);
  try {
    return checksData(await inspect(data(job, MAX_JOB_BYTES), { signal }));
  } finally {
    // A caller timing out does not stop an inspector or free its resource slot.
    const remaining = activeInspections.get(inspect) - 1;
    if (remaining) activeInspections.set(inspect, remaining);
    else activeInspections.delete(inspect);
  }
}

/** Capture first, then screen one isolated print job. Never renders or approves a proof implicitly. */
export function createPrintWorkflow({ artwork, capabilities, capture, inspect }) {
  requireValue(artwork && typeof artwork === 'object', 'An artwork is required');
  const identity = data({ id: artwork.id, version: artwork.version }, 1024);
  identifier(identity.id); text(identity.version, 'artwork version', 100);
  requireValue(typeof capture === 'function', 'A synchronous capture callback is required');
  requireValue(inspect === undefined || typeof inspect === 'function', 'Inspector must be a function');
  const policy = createCapabilities(capabilities);
  const declared = policy.getCapabilities();

  return Object.freeze({
    getCapabilities: policy.getCapabilities,
    captureJob({ id, request, specification }) {
      identifier(id);
      // Validate data and policy before any artist code or large snapshot copies.
      const output = data(request, 8192);
      const preflight = policy.validateRequest(output);
      requireValue(!preflight.issues.some(issue => issue.code === 'INVALID_REQUEST'), 'Invalid print request', 'INVALID_REQUEST');
      requireValue(output.print !== undefined, 'Print dimensions, units and DPI are required');
      requireValue(preflight.status !== 'unsupported', 'Print request violates declared capabilities', 'UNSUPPORTED');
      const specificationSnapshot = specificationData(specification);
      // Must finish before returning, so later live edits cannot race async capture.
      const captured = captureData(synchronous(capture(artwork, {
        request: data(output, 8192), specification: data(specificationSnapshot, 8192)
      }), 'Print capture'), identity, declared);
      const narrowed = data(declared);
      for (const source of ['technical', 'artist']) {
        narrowed[source] ??= {};
        narrowed[source].rendering ??= {};
        narrowed[source].rendering.aspectRatios = [captured.frame.aspectRatio];
      }
      // Technical acceptance alone can never stand in for print-quality checks.
      narrowed.evaluation = 'required';
      const boundPolicy = createCapabilities(narrowed);
      requireValue(boundPolicy.validateRequest(output).status !== 'unsupported', 'Output does not match the captured frame', 'ASPECT_RATIO');
      const job = data({ schemaVersion: PRINT_JOB_VERSION, id, artwork: identity,
        capabilities: declared, request: output, specification: specificationSnapshot, capture: captured }, MAX_JOB_BYTES);
      const getJob = () => data(job, MAX_JOB_BYTES);
      return Object.freeze({
        getJob,
        validate: () => boundPolicy.validateRequest(output),
        async screen(options) {
          // Per-call evidence prevents concurrent screens from mixing results.
          let checks;
          const evaluator = inspect && (async (_, { signal }) => {
            checks = await inspectJob(inspect, job, signal);
            const failed = checkNames.filter(name => !checks[name].passed);
            return { supported: failed.length === 0,
              reasons: failed.map(name => `${name}: not passed for this saved frame and print specification`) };
          });
          const provider = createCapabilities(narrowed, { evaluate: evaluator });
          const screening = provider.evaluateRequest
            ? await provider.evaluateRequest(output, options) : provider.validateRequest(output);
          return { job: getJob(), screening, ...(checks ? { checks: data(checks, 8192) } : {}), printApproval: 'not-granted' };
        }
      });
    }
  });
}
