import { ArtworkError, requireValue } from './errors.js';
import { data, fields, text, positive, list, range } from './description-data.js';

export { createPrintWorkflow, PRINT_JOB_VERSION } from './print-workflow.js';

export const CAPABILITIES_VERSION = '1.0';
const renderingFields = ['width', 'height', 'maxPixels', 'aspectRatios', 'aspectRatioRounding', 'formats'];
const printFields = ['width', 'height', 'dpi', 'tiling'];
function limits(value, kind, required = false) {
  fields(value, kind === 'rendering' ? renderingFields : printFields, kind);
  for (const key of ['width', 'height', ...(kind === 'print' ? ['dpi'] : [])]) {
    if (required || value[key] !== undefined) range(value[key], key, kind === 'rendering');
  }
  if (value.maxPixels !== undefined) positive(value.maxPixels, 'maxPixels', true);
  if (value.aspectRatios !== undefined) list(value.aspectRatios, 'aspectRatios', v => positive(v, 'aspect ratio'));
  if (value.aspectRatioRounding !== undefined) {
    requireValue(['nearest', 'strict'].includes(value.aspectRatioRounding), 'Invalid aspect-ratio rounding policy');
    requireValue(value.aspectRatios !== undefined, 'Aspect-ratio rounding requires aspectRatios in the same constraint');
  }
  if (value.formats !== undefined) list(value.formats, 'formats', v => {
    text(v, 'format', 100); requireValue(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(v), 'Formats must be MIME types');
  });
  if (value.tiling !== undefined) requireValue(typeof value.tiling === 'boolean', 'Invalid tiling support');
  if (required && kind === 'rendering') requireValue(value.formats !== undefined && value.maxPixels !== undefined, 'Rendering formats and maxPixels are required');
}
export function getCapabilities(description) {
  const value = data(description);
  fields(value, ['schemaVersion', 'technical', 'artist', 'evaluation'], 'capabilities');
  requireValue(value.schemaVersion === CAPABILITIES_VERSION, 'Unsupported capabilities schema version');
  fields(value.technical, ['rendering', 'print', 'interaction', 'animation', 'state'], 'technical');
  limits(value.technical.rendering, 'rendering', true);
  if (value.technical.print !== undefined) limits(value.technical.print, 'print', true);
  for (const section of ['interaction', 'animation', 'state']) {
    const keys = { interaction: ['pointer', 'keyboard', 'touch'], animation: ['supported', 'seek', 'pause'], state: ['save', 'restore', 'deterministic'] }[section];
    if (value.technical[section] !== undefined) {
      fields(value.technical[section], keys, section);
      for (const v of Object.values(value.technical[section])) requireValue(typeof v === 'boolean', `Invalid ${section} support`);
      if (section === 'animation' && (value.technical.animation.pause || value.technical.animation.seek)) {
        requireValue(value.technical.animation.supported === true, 'Pause and seek require animation support');
      }
    }
  }
  if (value.artist !== undefined) {
    fields(value.artist, ['rendering', 'print', 'notes'], 'artist');
    for (const kind of ['rendering', 'print']) if (value.artist[kind] !== undefined) limits(value.artist[kind], kind);
    if (value.artist.notes !== undefined) text(value.artist.notes, 'artist notes', 10000);
  }
  if (value.evaluation !== undefined) requireValue(['optional', 'required'].includes(value.evaluation), 'Invalid evaluation policy');
  return value;
}

function requestData(request) {
  const r = data(request, 8192);
  fields(r, ['width', 'height', 'format', 'print', 'interaction', 'animation', 'state'], 'request');
  positive(r.width, 'width', true); positive(r.height, 'height', true); text(r.format, 'format', 100);
  if (r.print !== undefined) {
    fields(r.print, ['width', 'height', 'unit', 'dpi', 'tiled'], 'print request');
    positive(r.print.width, 'print width'); positive(r.print.height, 'print height'); positive(r.print.dpi, 'DPI');
    requireValue(['in', 'cm', 'mm'].includes(r.print.unit), 'Invalid print unit');
    if (r.print.tiled !== undefined) requireValue(typeof r.print.tiled === 'boolean', 'Invalid tiled request');
  }
  for (const section of ['interaction', 'animation', 'state']) if (r[section] !== undefined) {
    const keys = { interaction: ['pointer', 'keyboard', 'touch'], animation: ['supported', 'seek', 'pause'], state: ['save', 'restore', 'deterministic'] }[section];
    fields(r[section], keys, section);
    for (const v of Object.values(r[section])) requireValue(typeof v === 'boolean', `Invalid ${section} request`);
  }
  return r;
}

function prepareRequest(caps, request) {
  let r;
  try { r = requestData(request); }
  catch (error) { return { result: { status: 'unsupported', issues: [{ source: 'request', code: 'INVALID_REQUEST', path: '', message: error.message }] } }; }
  return { request: r, result: checkRequest(caps, r) };
}

function matchesAspectRatio(width, height, ratio, rounding = 'nearest') {
  if (rounding === 'strict') return Math.abs(width / height - ratio) <= 1e-6 * ratio;
  // Either dimension may be the artist's fixed export dimension. The other must
  // be exactly its nearest integer, with positive half-pixel ties rounded up.
  return height === Math.round(width / ratio) || width === Math.round(height * ratio);
}

// Only called with private, validated snapshots. Never expose this fast path.
function checkRequest(caps, r) {
  const issues = [];
  const issue = (source, code, path, message) => issues.push({ source, code, path, message });
  const checkRange = (limit, v, source, path) => {
    if (limit && (v < limit.min || v > limit.max)) issue(source, 'OUT_OF_RANGE', path, `Expected ${limit.min}–${limit.max}`);
  };
  for (const source of ['technical', 'artist']) {
    const limits = caps[source];
    if (!limits) continue;
    const render = limits.rendering;
    if (render) {
      checkRange(render.width, r.width, source, 'width'); checkRange(render.height, r.height, source, 'height');
      if (render.maxPixels !== undefined && r.width > render.maxPixels / r.height) issue(source, 'PIXEL_LIMIT', 'width', 'Total pixel limit exceeded');
      if (render.formats && !render.formats.includes(r.format)) issue(source, 'FORMAT', 'format', 'Export format is not allowed');
      if (render.aspectRatios && !render.aspectRatios.some(ratio => matchesAspectRatio(r.width, r.height, ratio, render.aspectRatioRounding))) issue(source, 'ASPECT_RATIO', 'width', 'Aspect ratio is not allowed');
    }
    if (r.print && limits.print) {
      const scale = { in: 1, cm: 2.54, mm: 25.4 }[r.print.unit];
      checkRange(limits.print.width, r.print.width / scale, source, 'print.width');
      checkRange(limits.print.height, r.print.height / scale, source, 'print.height');
      checkRange(limits.print.dpi, r.print.dpi, source, 'print.dpi');
      if (r.print.tiled && limits.print.tiling !== true && (source === 'technical' || limits.print.tiling === false)) issue(source, 'TILING', 'print.tiled', 'Tiling is not allowed');
    }
  }
  if (r.print) {
    if (!caps.technical.print) issue('technical', 'UNDECLARED', 'print', 'Print support is not declared');
    const scale = { in: 1, cm: 2.54, mm: 25.4 }[r.print.unit];
    for (const axis of ['width', 'height']) {
      const pixels = Math.round(r.print[axis] / scale * r.print.dpi);
      if (!Number.isSafeInteger(pixels) || pixels !== r[axis]) issue('request', 'PRINT_RESOLUTION', `print.${axis}`, 'Physical size and DPI must round to the requested pixels');
    }
  }
  for (const section of ['interaction', 'animation', 'state']) {
    for (const [key, needed] of Object.entries(r[section] ?? {})) if (needed && caps.technical[section]?.[key] !== true) issue('technical', 'UNDECLARED', `${section}.${key}`, 'Requested feature is unavailable or undeclared');
  }
  return { status: issues.length ? 'unsupported' : caps.evaluation === 'required' ? 'requires-evaluation' : 'supported', issues };
}

/** No rendering, network access, or artist code is executed. */
export function validateRequest(description, request) {
  return prepareRequest(getCapabilities(description), request).result;
}

// Shared by standalone calls and providers using the same evaluator function.
// Timed-out hooks retain their slot until the underlying work actually settles.
const activeEvaluations = new WeakMap();
const MAX_EVALUATIONS = 4;

async function evaluateSnapshot(caps, request, evaluator, { signal, timeout = 5000 } = {}) {
  const prepared = prepareRequest(caps, request);
  if (prepared.result.status === 'unsupported' || evaluator === undefined) return prepared.result;
  requireValue(typeof evaluator === 'function', 'Evaluator must be a function');
  requireValue(Number.isFinite(timeout) && timeout > 0 && timeout <= 60000, 'Invalid evaluation timeout');
  if (signal?.aborted) throw new ArtworkError('CANCELLED', 'Evaluation cancelled');
  requireValue((activeEvaluations.get(evaluator) ?? 0) < MAX_EVALUATIONS, 'Too many active evaluations', 'BUSY');
  activeEvaluations.set(evaluator, (activeEvaluations.get(evaluator) ?? 0) + 1);
  const release = () => {
    const remaining = activeEvaluations.get(evaluator) - 1;
    if (remaining) activeEvaluations.set(evaluator, remaining);
    else activeEvaluations.delete(evaluator);
  };
  const controller = new AbortController();
  const deadline = performance.now() + timeout;
  let timer, abort, task, stoppedError;
  const stop = (code, message) => {
    stoppedError ??= new ArtworkError(code, message);
    controller.abort();
    return stoppedError;
  };
  const checkDeadline = () => {
    if (stoppedError) throw stoppedError;
    if (signal?.aborted) throw stop('CANCELLED', 'Evaluation cancelled');
    if (performance.now() >= deadline) throw stop('TIMEOUT', 'Evaluation timed out');
  };
  try {
    const stopped = new Promise((_, reject) => {
      abort = () => reject(stop('CANCELLED', 'Evaluation cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(stop('TIMEOUT', 'Evaluation timed out')), timeout);
    });
    task = Promise.resolve().then(() => {
      checkDeadline();
      const context = { capabilities: data(caps), signal: controller.signal };
      checkDeadline();
      return evaluator(prepared.request, context);
    }).finally(release);
    const raw = await Promise.race([stopped, task]);
    // Timers cannot preempt synchronous hooks or a saturated microtask queue.
    checkDeadline();
    const decision = data(raw, 8192);
    fields(decision, ['supported', 'reasons'], 'evaluation');
    requireValue(typeof decision.supported === 'boolean', 'Evaluation must declare supported');
    if (decision.reasons !== undefined) list(decision.reasons, 'evaluation reasons', reason => text(reason, 'reason'), true);
    checkDeadline();
    return { status: decision.supported ? 'supported' : 'unsupported', issues: decision.supported ? [] : (decision.reasons?.length ? decision.reasons : ['Runtime evaluation rejected the request']).map(message => ({ source: 'runtime', code: 'EVALUATION_REJECTED', path: '', message })) };
  } catch (error) {
    checkDeadline();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (!task) release();
  }
}

/** Explicit runtime evaluation can narrow, but cannot override, static constraints. */
export async function evaluateRequest(description, request, evaluator, options) {
  return evaluateSnapshot(getCapabilities(description), request, evaluator, options);
}

export function createCapabilities(description, { evaluate } = {}) {
  const caps = getCapabilities(description);
  requireValue(evaluate === undefined || typeof evaluate === 'function', 'Evaluator must be a function');
  return Object.freeze({ getCapabilities: () => data(caps), validateRequest: request => prepareRequest(caps, request).result,
    ...(evaluate ? { evaluateRequest: (request, options) => evaluateSnapshot(caps, request, evaluate, options) } : {}) });
}
