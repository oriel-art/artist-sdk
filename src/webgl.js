import { createRandom } from './random.js';
import { ArtworkError, requireValue } from './errors.js';

const vertexSource = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  requireValue(shader, 'Could not allocate a shader', 'ALLOCATION_FAILED');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new ArtworkError('SHADER_COMPILE', `${log}\n${source.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n')}`);
  }
  return shader;
}

function createTarget(canvas, fragment, preserve = false) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false,
    antialias: false, preserveDrawingBuffer: preserve });
  requireValue(gl, 'WebGL 1 is unavailable', 'WEBGL_UNAVAILABLE');
  let vertex, pixel, program, buffer;
  const dispose = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (pixel) gl.deleteShader(pixel);
  };
  try {
    vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    pixel = compile(gl, gl.FRAGMENT_SHADER, fragment);
    program = gl.createProgram();
    requireValue(program, 'Could not allocate a program', 'ALLOCATION_FAILED');
    gl.attachShader(program, vertex);
    gl.attachShader(program, pixel);
    gl.linkProgram(program);
    requireValue(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program), 'SHADER_LINK');
    buffer = gl.createBuffer();
    requireValue(buffer, 'Could not allocate geometry', 'ALLOCATION_FAILED');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    const uniforms = [];
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const info = gl.getActiveUniform(program, i);
      requireValue(info.size === 1 && !info.name.includes('['), 'Uniform arrays are not supported by the pilot runner', 'UNSUPPORTED');
      const arity = new Map([[gl.FLOAT, 1], [gl.FLOAT_VEC2, 2], [gl.FLOAT_VEC3, 3], [gl.FLOAT_VEC4, 4], [gl.INT, 1], [gl.BOOL, 1]]).get(info.type);
      requireValue(arity, `Unsupported uniform type: ${info.name}; use the core SDK with your own renderer for textures/matrices`, 'UNSUPPORTED');
      uniforms.push({ ...info, arity, location: gl.getUniformLocation(program, info.name), name: info.name, type: info.type });
    }
    return { gl, dispose, draw(width, height, values) {
      requireValue(!gl.isContextLost(), 'WebGL context was lost', 'CONTEXT_LOST');
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      requireValue(gl.drawingBufferWidth === width && gl.drawingBufferHeight === height, 'Requested drawing buffer could not be allocated', 'ALLOCATION_FAILED');
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const uniform of uniforms) {
        const v = values[uniform.name];
        if (uniform.type === gl.BOOL) {
          requireValue(typeof v === 'boolean', `Boolean uniform required: ${uniform.name}`);
          gl.uniform1i(uniform.location, v ? 1 : 0);
        } else if (uniform.type === gl.INT) {
          requireValue(Number.isInteger(v) && v >= -2147483648 && v <= 2147483647, `Integer uniform required: ${uniform.name}`);
          gl.uniform1i(uniform.location, v);
        } else if (uniform.arity === 1) {
          requireValue(Number.isFinite(v), `Finite uniform required: ${uniform.name}`);
          gl.uniform1f(uniform.location, v);
        } else {
          requireValue((Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === uniform.arity
            && [...v].every(Number.isFinite), `Invalid vector uniform: ${uniform.name}`);
          gl[`uniform${uniform.arity}fv`](uniform.location, v);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requireValue(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), 'WebGL draw failed', 'RENDER_FAILED');
    } };
  } catch (error) { dispose(); throw error; }
}

export function checkExportSize(gl, width, height, maxPixels = 16_777_216) {
  requireValue(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0, 'Dimensions must be positive integers');
  requireValue(Number.isSafeInteger(maxPixels) && maxPixels > 0, 'Invalid pixel budget');
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  requireValue(width <= Math.min(limit, viewport[0]) && height <= Math.min(limit, viewport[1])
    && width * height <= maxPixels, 'Output exceeds device limits or the configured pixel budget; choose smaller dimensions', 'EXPORT_LIMIT');
  return { width, height, estimatedBytes: width * height * 16 };
}

/** Optional single-pass GLSL ES 1.00 runner. Owns its canvas/context. No textures or feedback. */
export function createShaderRenderer({ canvas, artwork, fragment, uniforms = () => ({}), maxPixels = 16_777_216, onError = console.error }) {
  requireValue(canvas?.getContext && typeof fragment === 'string', 'A canvas and fragment shader are required');
  let target = createTarget(canvas, fragment);
  let disposed = false;
  let last = null;
  let busy = false;
  const alive = () => requireValue(!disposed, 'Renderer is disposed', 'DISPOSED');
  const values = snapshot => {
    const seeded = createRandom(artwork.seed, 'shader-seed');
    return { ...uniforms({ parameters: snapshot.parameters, time: snapshot.time,
      random: name => createRandom(artwork.seed, name) }),
      u_resolution: [snapshot.width, snapshot.height], u_time: snapshot.time,
      u_seed: [seeded.next(), seeded.next(), seeded.next(), seeded.next()] };
  };
  const lost = event => {
    event.preventDefault();
    onError(new ArtworkError('CONTEXT_LOST', 'The graphics context was lost; waiting for restoration'));
  };
  const restored = () => {
    if (disposed) return;
    try { target.dispose(); target = createTarget(canvas, fragment); if (last) target.draw(last.width, last.height, last.uniformValues); }
    catch (error) { onError(error); }
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    render({ width = canvas.width, height = canvas.height, time = 0 } = {}) {
      alive();
      requireValue(Number.isFinite(time) && time >= 0, 'Time must be finite nonnegative seconds');
      checkExportSize(target.gl, width, height, maxPixels);
      const snapshot = { width, height, time, revision: artwork.revision, parameters: Object.freeze({ ...artwork.parameters }) };
      snapshot.uniformValues = Object.fromEntries(Object.entries(values(snapshot)).map(([key, value]) =>
        [key, Array.isArray(value) || ArrayBuffer.isView(value) ? [...value] : value]));
      target.draw(width, height, snapshot.uniformValues);
      last = snapshot;
      return { width, height, time, revision: snapshot.revision };
    },
    async exportPNG({ width = last?.width, height = last?.height, signal } = {}) {
      alive();
      requireValue(last, 'Render an image before exporting', 'NOT_READY');
      requireValue(!busy, 'An export is already running', 'BUSY');
      requireValue(!signal?.aborted, 'Export cancelled', 'CANCELLED');
      requireValue(!target.gl.isContextLost(), 'WebGL context was lost', 'CONTEXT_LOST');
      checkExportSize(target.gl, width, height, maxPixels);
      const snapshot = { ...last, width, height };
      busy = true;
      let output;
      try {
        const surface = canvas.ownerDocument.createElement('canvas');
        surface.width = width; surface.height = height;
        output = createTarget(surface, fragment, true);
        checkExportSize(output.gl, width, height, maxPixels);
        output.draw(width, height, { ...snapshot.uniformValues, u_resolution: [width, height] });
        const blob = await new Promise((resolve, reject) => surface.toBlob(result => {
          if (result) resolve(result); else reject(new ArtworkError('ENCODE_FAILED', 'PNG encoding failed'));
        }, 'image/png'));
        requireValue(!signal?.aborted && !disposed, 'Export cancelled', 'CANCELLED');
        requireValue(!output.gl.isContextLost(), 'Export context was lost', 'CONTEXT_LOST');
        return blob;
      } finally {
        output?.dispose();
        output?.gl.getExtension('WEBGL_lose_context')?.loseContext();
        busy = false;
      }
    },
    getSnapshot() {
      return last ? { width: last.width, height: last.height, time: last.time,
        revision: last.revision, parameters: { ...last.parameters } } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      target.dispose();
    }
  };
}
