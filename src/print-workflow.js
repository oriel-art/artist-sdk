import { createCapabilities } from './capabilities.js';
import { data, fields, list, parseJSONData, positive, text } from './description-data.js';
import { ArtworkError, identifier, object, requireValue, synchronous } from './errors.js';

export const PRINT_JOB_VERSION = 'oriel-print-job/1.0';
const MAX_JOB_BYTES = 131072;
const MAX_INPUT_BYTES = 20480;
const activeInspections = new WeakMap();
const checkNames = ['grain', 'lineWeight', 'colour'];

function nonnegative(value, label) {
  requireValue(Number.isFinite(value) && value >= 0, `Invalid ${label}`);
}

function rejectWithIssues(code, message, issues) {
  const error = new ArtworkError(code, message);
  error.issues = data(issues);
  throw error;
}

function specificationData(input) {
  const value = data(input, 8192);
  fields(value, ['paper', 'printer', 'colourProfile', 'renderingIntent', 'grain', 'lineWeight', 'notes',
    'media', 'iccProfile', 'blackPointCompensation', 'borders', 'colourCriteria', 'extensions'], 'print specification');
  for (const name of ['paper', 'printer', 'colourProfile', 'grain', 'lineWeight']) text(value[name], name);
  requireValue(['perceptual', 'relative-colorimetric', 'absolute-colorimetric', 'saturation'].includes(value.renderingIntent), 'Invalid rendering intent');
  if (value.notes !== undefined) text(value.notes, 'print notes');
  if (value.media !== undefined) {
    fields(value.media, ['manufacturer', 'stock', 'finish', 'weightGsm', 'inkSet', 'settings'], 'media');
    for (const key of ['manufacturer', 'stock', 'finish', 'inkSet']) if (value.media[key] !== undefined) text(value.media[key], `media ${key}`);
    if (value.media.weightGsm !== undefined) positive(value.media.weightGsm, 'media weight');
    if (value.media.settings !== undefined) requireValue(object(value.media.settings), 'Media settings must be a JSON object');
  }
  if (value.iccProfile !== undefined) {
    fields(value.iccProfile, ['name', 'sha256'], 'ICC profile');
    text(value.iccProfile.name, 'ICC profile name');
    requireValue(typeof value.iccProfile.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.iccProfile.sha256), 'ICC profile sha256 must be 64 lowercase hex characters');
  }
  if (value.blackPointCompensation !== undefined) requireValue(typeof value.blackPointCompensation === 'boolean', 'Invalid black-point compensation');
  if (value.borders !== undefined) {
    fields(value.borders, ['unit', 'top', 'right', 'bottom', 'left'], 'borders');
    requireValue(['in', 'cm', 'mm'].includes(value.borders.unit), 'Invalid border unit');
    for (const side of ['top', 'right', 'bottom', 'left']) nonnegative(value.borders[side], `border ${side}`);
  }
  if (value.colourCriteria !== undefined) list(value.colourCriteria, 'colour criteria', criterion => {
    fields(criterion, ['metric', 'maximum', 'unit', 'method'], 'colour criterion');
    for (const key of ['metric', 'unit', 'method']) text(criterion[key], `colour criterion ${key}`);
    nonnegative(criterion.maximum, 'colour criterion maximum');
  });
  if (value.extensions !== undefined) requireValue(object(value.extensions), 'Print extensions must be a JSON object');
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
    if (ratios && !ratios.includes(value.frame.aspectRatio)) rejectWithIssues('ASPECT_RATIO', `Captured frame violates ${source} aspect ratios`,
      [{ source, code: 'ASPECT_RATIO', path: 'capture.frame.aspectRatio', message: `Captured frame ratio is not declared by ${source}` }]);
  }
  return value;
}

function checksData(input) {
  const value = data(input, 8192);
  fields(value, checkNames, 'print checks');
  for (const name of checkNames) {
    fields(value[name], ['passed', 'status', 'notes'], `${name} check`);
    const hasPassed = Object.hasOwn(value[name], 'passed'), hasStatus = Object.hasOwn(value[name], 'status');
    requireValue(hasPassed !== hasStatus, `${name} must report either status or legacy passed`);
    if (hasPassed) requireValue(typeof value[name].passed === 'boolean', `${name} must explicitly report passed`);
    else requireValue(['passed', 'failed', 'not-assessed'].includes(value[name].status), `Invalid ${name} status`);
    if (value[name].notes !== undefined) text(value[name].notes, `${name} notes`);
  }
  return value;
}

const checkStatus = check => check.status ?? (check.passed ? 'passed' : 'failed');

function screeningResult(checks) {
  const issues = checkNames.filter(name => checkStatus(checks[name]) !== 'passed').map(name => ({
    source: 'runtime', code: checkStatus(checks[name]) === 'not-assessed' ? 'NOT_ASSESSED' : 'EVALUATION_REJECTED',
    path: `checks.${name}`, message: `${name}: ${checkStatus(checks[name])} for this saved frame and print specification`
  }));
  return { status: checkNames.some(name => checkStatus(checks[name]) === 'failed') ? 'unsupported'
    : issues.length ? 'requires-evaluation' : 'supported', issues };
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

/** Capture first, then screen one isolated print job against artist-defined checks. */
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
    captureJob(input) {
      // External inputs use bounded raw JSON; object callers own their ingress limits.
      if (typeof input === 'string') {
        input = parseJSONData(input, MAX_INPUT_BYTES);
        fields(input, ['id', 'request', 'specification'], 'print job input');
      }
      const { id, request, specification } = input;
      identifier(id);
      // Validate data and policy before any artist code or large snapshot copies.
      const output = data(request, 8192);
      const preflight = policy.validateRequest(output);
      if (preflight.issues.some(issue => issue.code === 'INVALID_REQUEST')) rejectWithIssues('INVALID_REQUEST', 'Invalid print request', preflight.issues);
      if (output.print === undefined) rejectWithIssues('INVALID_INPUT', 'Print dimensions, units and DPI are required',
        [{ source: 'request', code: 'INVALID_REQUEST', path: 'print', message: 'Print dimensions, units and DPI are required' }]);
      if (preflight.status === 'unsupported') rejectWithIssues('UNSUPPORTED', 'Print request violates declared capabilities', preflight.issues);
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
      // Keep declared-limit validation distinct from the inspector's checks.
      narrowed.evaluation = 'required';
      const boundPolicy = createCapabilities(narrowed);
      const frameValidation = boundPolicy.validateRequest(output);
      if (frameValidation.status === 'unsupported') rejectWithIssues('ASPECT_RATIO', 'Output does not match the captured frame', frameValidation.issues);
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
            const result = screeningResult(checks);
            return { supported: result.status === 'supported', reasons: result.issues.map(issue => issue.message) };
          });
          const provider = createCapabilities(narrowed, { evaluate: evaluator });
          let screening = provider.evaluateRequest
            ? await provider.evaluateRequest(output, options) : provider.validateRequest(output);
          // Aggregate only after the core evaluator has enforced its deadline and cancellation.
          if (checks) screening = screeningResult(checks);
          return { job: getJob(), screening, ...(checks ? { checks: data(checks, 8192) } : {}) };
        }
      });
    }
  });
}
