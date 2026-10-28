import { ArtworkError, object, requireValue, synchronous } from './errors.js';
import { data, fields } from './description-data.js';

const MAX_SNAPSHOT_BYTES = 65536;

function size(width, height, maxPixels, maxDimension) {
  requireValue(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    'Dimensions must be positive integers');
  requireValue(width <= maxDimension && height <= maxDimension && width <= maxPixels / height,
    'Output exceeds the configured dimension or pixel budget', 'EXPORT_LIMIT');
}

function gpuSize(gl, width, height) {
  requireValue(gl && !gl.isContextLost(), 'Graphics context is unavailable or lost', 'CONTEXT_LOST');
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  requireValue(width <= Math.min(limit, viewport[0]) && height <= Math.min(limit, viewport[1]),
    'Output exceeds graphics device limits', 'EXPORT_LIMIT');
}

function bufferSize(canvas, width, height, gl) {
  requireValue(canvas.width === width && canvas.height === height
    && (!gl || gl.drawingBufferWidth === width && gl.drawingBufferHeight === height),
  'Requested drawing buffer could not be allocated at pixel density 1', 'ALLOCATION_FAILED');
  if (gl) requireValue(!gl.isContextLost(), 'Graphics context was lost', 'CONTEXT_LOST');
}

function release(target) {
  if (!target) return;
  try { target.dispose(); }
  finally { (target.element ?? target.canvas)?.remove(); }
}

/** Owned preview target plus isolated exports. Callbacks must render from the supplied snapshot. */
export function createRenderSession({ createTarget, container, document = globalThis.document,
  maxPixels = 16777216, maxDimension = 8192 }) {
  requireValue(typeof createTarget === 'function' && document?.createElement, 'A target factory and browser document are required');
  requireValue(container === undefined || container?.ownerDocument === document && typeof container.append === 'function', 'Invalid preview container');
  requireValue(Number.isSafeInteger(maxPixels) && maxPixels > 0 && Number.isSafeInteger(maxDimension) && maxDimension > 0, 'Invalid renderer limits');
  let live, last, rendering = false, exporting = false, disposed = false;
  const check = signal => {
    requireValue(!disposed, 'Renderer is disposed', 'DISPOSED');
    requireValue(!signal?.aborted, 'Rendering cancelled', 'CANCELLED');
  };
  const snapshot = input => {
    const value = data(input, MAX_SNAPSHOT_BYTES);
    fields(value, ['width', 'height', 'state'], 'render snapshot');
    size(value.width, value.height, maxPixels, maxDimension);
    requireValue(object(value.state), 'Snapshot state must be a JSON object');
    return value;
  };
  const make = async (purpose, signal, { width, height }) => {
    const target = await createTarget({ document, purpose, signal, width, height });
    // A mistaken custom factory must not draw into or dispose the live canvas.
    requireValue(!live || target?.canvas !== live.canvas, 'Target factory reused the preview canvas', 'INVALID_TARGET');
    try {
      requireValue(target?.canvas?.toBlob && typeof target.draw === 'function' && typeof target.dispose === 'function', 'Invalid render target');
      check(signal);
      return target;
    } catch (error) {
      if (typeof target?.dispose === 'function') release(target);
      throw error;
    }
  };
  return Object.freeze({
    get canvas() { return live?.canvas ?? null; },
    getSnapshot: () => last ? data(last, MAX_SNAPSHOT_BYTES) : null,
    async render({ width, height, state = {}, signal } = {}) {
      check(signal);
      requireValue(!rendering, 'A preview render is already running', 'BUSY');
      // Capture before the first await. Later caller edits cannot change this frame.
      const frame = snapshot({ width, height, state });
      rendering = true;
      try {
        if (!live) {
          live = await make('preview', signal, frame);
          check(signal);
          container?.append(live.element ?? live.canvas);
        }
        check(signal);
        await live.draw(data(frame, MAX_SNAPSHOT_BYTES), { signal });
        check(signal);
        bufferSize(live.canvas, frame.width, frame.height);
        last = frame;
        return data(frame, MAX_SNAPSHOT_BYTES);
      } catch (error) {
        const failed = live; live = undefined;
        release(failed);
        throw error;
      } finally {
        rendering = false;
        if (disposed) { const target = live; live = undefined; release(target); }
      }
    },
    async exportPNG({ snapshot: saved = last, width = saved?.width, height = saved?.height, signal } = {}) {
      check(signal);
      requireValue(!exporting, 'An export is already running', 'BUSY');
      requireValue(saved, 'Render first or supply a saved snapshot', 'NOT_READY');
      // Validate the saved record as well as the requested output before allocating.
      const captured = snapshot(saved);
      const frame = snapshot({ ...captured, width, height });
      exporting = true;
      let target;
      try {
        target = await make('export', signal, frame);
        check(signal);
        await target.draw(data(frame, MAX_SNAPSHOT_BYTES), { signal });
        check(signal);
        bufferSize(target.canvas, width, height);
        const blob = await new Promise((resolve, reject) => target.canvas.toBlob(result => {
          if (result?.type === 'image/png') resolve(result);
          else reject(new ArtworkError('ENCODE_FAILED', 'PNG encoding failed'));
        }, 'image/png'));
        check(signal);
        // An asynchronous encoder must not hide a lost graphics context.
        target.check?.();
        return blob;
      } finally {
        try { release(target); } finally { exporting = false; }
      }
    },
    dispose() {
      disposed = true;
      if (!rendering) { const target = live; live = undefined; release(target); }
      // In-flight work retains its target and slot until it settles.
    }
  });
}

/** Native Canvas 2D, explicit backing-pixel dimensions, artist-owned synchronous drawing. */
export function createCanvasRenderer({ draw, ...options }) {
  requireValue(typeof draw === 'function', 'A draw callback is required');
  return createRenderSession({ ...options, createTarget: ({ document }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    requireValue(context, 'Canvas 2D is unavailable', 'CANVAS_UNAVAILABLE');
    return { canvas, draw(frame) {
      if (canvas.width !== frame.width) canvas.width = frame.width;
      if (canvas.height !== frame.height) canvas.height = frame.height;
      context.save();
      try {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, frame.width, frame.height);
        context.beginPath();
        synchronous(draw(context, frame), 'Canvas draw');
      } finally { context.restore(); }
    }, dispose() { canvas.width = canvas.height = 1; } };
  } });
}

/** p5 instance mode, P2D or WEBGL. Library and random/noise seeding stay artist-owned. */
export function createP5Renderer({ p5, draw, setup, mode = '2d', webglVersion = 2, ...options }) {
  requireValue(typeof p5 === 'function' && typeof draw === 'function', 'A p5 constructor and draw callback are required');
  requireValue(setup === undefined || typeof setup === 'function', 'Invalid p5 setup callback');
  requireValue(['2d', 'webgl'].includes(mode) && [1, 2].includes(webglVersion), 'Invalid p5 renderer mode');
  return createRenderSession({ ...options, createTarget: async ({ document, width, height }) => {
    requireValue(document.readyState === 'complete', 'Start p5 rendering after the window load event', 'NOT_READY');
    const host = document.createElement('div');
    let instance, surface, gl, pending;
    try {
      await new Promise((resolve, reject) => {
        instance = new p5(p => {
          p.setup = () => {
            try {
              p.pixelDensity(1);
              if (mode === 'webgl') p.setAttributes({ version: webglVersion, preserveDrawingBuffer: true, antialias: false });
              surface = p.createCanvas(1, 1, mode === 'webgl' ? p.WEBGL : p.P2D).elt;
              if (mode === 'webgl') {
                gl = p.drawingContext;
                requireValue(p.webglVersion === (webglVersion === 2 ? p.WEBGL2 : p.WEBGL), 'Requested p5 WebGL version is unavailable', 'WEBGL_UNAVAILABLE');
                gpuSize(gl, width, height);
              }
              // Bootstrap only to inspect device limits; artist setup sees the requested size.
              p.resizeCanvas(width, height, true);
              bufferSize(surface, width, height, gl);
              if (setup) synchronous(setup(p), 'p5 setup');
              p.noLoop();
              resolve();
            } catch (error) { p.noLoop(); reject(error); }
          };
          p.draw = () => {
            if (!pending) return;
            p.push();
            try { synchronous(draw(p, pending), 'p5 draw'); } finally { p.pop(); }
          };
        }, host);
      });
      return { canvas: surface, element: host, draw(frame) {
        if (gl) gpuSize(gl, frame.width, frame.height);
        if (surface.width !== frame.width || surface.height !== frame.height) pResize(frame);
        pending = frame;
        try { instance.redraw(); } finally { pending = undefined; }
        bufferSize(surface, frame.width, frame.height, gl);
      }, check() { if (gl) gpuSize(gl, surface.width, surface.height); }, dispose: cleanup };
    } catch (error) { cleanup(); throw error; }
    function pResize(frame) { instance.resizeCanvas(frame.width, frame.height, true); }
    function cleanup() {
      try { instance?.remove(); }
      finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); host.remove(); }
    }
  } });
}

/** Three.js scene factory: creates fresh scene/camera/resources for preview and each export. */
export function createThreeRenderer({ THREE, createScene, ...options }) {
  requireValue(typeof THREE?.WebGLRenderer === 'function' && typeof createScene === 'function', 'Three.js and a scene factory are required');
  return createRenderSession({ ...options, createTarget: async ({ document, purpose, signal }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
    let content;
    const gl = renderer.getContext();
    const cleanup = () => {
      try { content?.dispose?.(); }
      finally { try { renderer.dispose(); } finally { renderer.forceContextLoss(); } }
    };
    try {
      renderer.setPixelRatio(1);
      renderer.debug.onShaderError = () => { throw new ArtworkError('SHADER_COMPILE', 'Three.js shader compilation failed'); };
      content = await createScene({ renderer, purpose, signal });
      requireValue(content?.scene?.isScene && content?.camera?.isCamera && typeof content.update === 'function'
        && typeof content.dispose === 'function', 'Scene factory must return scene, camera, update and dispose');
      return { canvas, draw(frame) {
        gpuSize(gl, frame.width, frame.height);
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          renderer.setSize(frame.width, frame.height, false);
        }
        synchronous(content.update(frame), 'Three.js update');
        renderer.render(content.scene, content.camera);
        bufferSize(canvas, frame.width, frame.height, gl);
      }, check() { gpuSize(gl, canvas.width, canvas.height); }, dispose: cleanup };
    } catch (error) { cleanup(); throw error; }
  } });
}
