import { ArtworkError, requireValue, object } from './errors.js';

export const BRIDGE_PROTOCOL = 'artist-bridge/0.1';
const MAX_MESSAGE = 65536;
const encoder = new TextEncoder();
function validOrigin(origin) {
  requireValue(typeof origin === 'string' && /^https?:\/\//.test(origin) && new URL(origin).origin === origin, 'An exact HTTP(S) origin is required');
  return origin;
}
function sizeOK(value) {
  try { return encoder.encode(JSON.stringify(value)).length <= MAX_MESSAGE; } catch { return false; }
}

/** Exposes only artist-registered handlers to an allowlisted parent iframe host. */
export function exposeArtwork(artwork, { allowedOrigins }) {
  const allowed = new Set(allowedOrigins.map(validOrigin));
  requireValue(sizeOK({ protocol: BRIDGE_PROTOCOL, session: 'x'.repeat(100), kind: 'ready', manifest: artwork.manifest() }),
    'Manifest exceeds the bridge message limit', 'LIMIT');
  let disconnect = () => {};
  const listen = event => {
    const data = event.data;
    if (event.source !== window.parent || !allowed.has(event.origin) || !object(data)
      || data.protocol !== BRIDGE_PROTOCOL || data.kind !== 'connect'
      || typeof data.session !== 'string' || data.session.length > 100 || event.ports.length !== 1) return;
    disconnect();
    const port = event.ports[0];
    const session = data.session;
    const subscriptions = new Set();
    const responses = new Map();
    let active = true, highest = 0, queued = 0, sequence = 0;
    let queue = Promise.resolve();
    const send = message => {
      if (!active) return;
      const envelope = { ...message, protocol: BRIDGE_PROTOCOL, session };
      if (!sizeOK(envelope)) return;
      port.postMessage(envelope);
    };
    const unsubscribe = artwork.subscribe(event => {
      if (subscriptions.has(event.type) && sizeOK(event)) send({ kind: 'event', sequence: ++sequence, event });
    });
    disconnect = () => { active = false; unsubscribe(); port.close(); };
    port.onmessage = ({ data: request }) => {
      if (!active || !object(request) || request.protocol !== BRIDGE_PROTOCOL || request.session !== session) return;
      if (request.kind === 'close') { disconnect(); return; }
      const { id, kind, name, input = {} } = request;
      if (!Number.isSafeInteger(id) || id < 1) return;
      if (responses.has(id)) { responses.get(id).then(send); return; }
      const fail = (code, message) => send({ kind: 'response', id, error: { code, message } });
      if (id <= highest) { fail('STALE_REQUEST', 'Request is outside the replay window'); return; }
      highest = id;
      if (!sizeOK(request) || queued >= 32) { fail('LIMIT', 'Request exceeds bridge limits'); return; }
      queued++;
      const task = queue.then(async () => {
        if (!active) return { kind: 'response', id, error: { code: 'DISCONNECTED', message: 'Session closed' } };
        try {
          let result;
          if (kind === 'query') result = await artwork.query(name, input);
          else if (kind === 'command') result = await artwork.command(name, input);
          else if (kind === 'subscribe' || kind === 'unsubscribe') {
            requireValue(typeof name === 'string' && artwork.manifest().events.includes(name), 'Unknown event name');
            if (kind === 'subscribe') { requireValue(subscriptions.size < 64 || subscriptions.has(name), 'Too many subscriptions'); subscriptions.add(name); }
            else subscriptions.delete(name);
            result = null;
          } else throw new ArtworkError('UNSUPPORTED', 'Unknown request kind');
          const response = { kind: 'response', id, revision: artwork.revision, result: result ?? null };
          requireValue(sizeOK({ ...response, protocol: BRIDGE_PROTOCOL, session }), 'Response is not serializable or is too large', 'LIMIT');
          // JSON wire values only, even though MessagePort can clone richer objects.
          return JSON.parse(JSON.stringify(response));
        } catch (error) { return { kind: 'response', id, error: { code: error.code ?? 'HANDLER_FAILED', message: String(error.message).slice(0, 2000) } }; }
        finally { queued--; }
      });
      responses.set(id, task);
      queue = task.then(() => {
        while (responses.size > 128) responses.delete(responses.keys().next().value);
      });
      task.then(send);
    };
    port.start();
    send({ kind: 'ready', manifest: artwork.manifest() });
  };
  window.addEventListener('message', listen);
  return () => { window.removeEventListener('message', listen); disconnect(); };
}

/** Connect after the iframe load event; no wildcard or opaque origins in this pilot. */
export function connectArtwork(iframe, { origin, timeout = 5000 }) {
  validOrigin(origin);
  requireValue(iframe?.contentWindow, 'An iframe is required');
  requireValue(Number.isFinite(timeout) && timeout > 0, 'Invalid timeout');
  const channel = new MessageChannel();
  const port = channel.port1;
  const session = crypto.randomUUID();
  const pending = new Map();
  const handlers = new Map();
  let nextId = 0, closed = false, ready = false;
  let resolveConnect, rejectConnect, handshakeTimer;
  const connected = new Promise((resolve, reject) => { resolveConnect = resolve; rejectConnect = reject; });
  const close = (reason = new ArtworkError('DISCONNECTED', 'Artwork connection closed')) => {
    if (closed) return;
    closed = true;
    clearTimeout(handshakeTimer);
    port.postMessage({ protocol: BRIDGE_PROTOCOL, session, kind: 'close' });
    port.close();
    iframe.removeEventListener('load', reload);
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(reason); }
    pending.clear(); handlers.clear();
    if (!ready) rejectConnect(reason);
  };
  const reload = () => close(new ArtworkError('RELOADED', 'Artwork iframe reloaded; reconnect after load'));
  iframe.addEventListener('load', reload);
  const request = (kind, name, input = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new ArtworkError('DISCONNECTED', 'Artwork connection closed')); return; }
    const id = ++nextId;
    const message = { protocol: BRIDGE_PROTOCOL, session, id, kind, name, input };
    if (!sizeOK(message)) { reject(new ArtworkError('LIMIT', 'Request is too large or not serializable')); return; }
    if (pending.size >= 32) { reject(new ArtworkError('LIMIT', 'Too many outstanding requests')); return; }
    const timer = setTimeout(() => { pending.delete(id); reject(new ArtworkError('TIMEOUT', 'Request timed out; a command may still have completed. Query state before retrying.')); }, timeout);
    pending.set(id, { resolve, reject, timer });
    port.postMessage(JSON.parse(JSON.stringify(message)));
  });
  const api = {
    manifest: null,
    query: (name, input) => request('query', name, input),
    command: (name, input) => request('command', name, input),
    async subscribe(name, handler) {
      requireValue(typeof handler === 'function', 'An event handler is required');
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(handler);
      try { await request('subscribe', name); }
      catch (error) { handlers.get(name)?.delete(handler); throw error; }
      return async () => {
        const set = handlers.get(name);
        set?.delete(handler);
        if (set && set.size === 0) { handlers.delete(name); if (!closed) await request('unsubscribe', name); }
      };
    },
    close: () => close()
  };
  port.onmessage = ({ data }) => {
    if (!object(data) || data.protocol !== BRIDGE_PROTOCOL || data.session !== session || !sizeOK(data)) return;
    if (data.kind === 'ready' && !ready) {
      ready = true; clearTimeout(handshakeTimer); api.manifest = data.manifest; resolveConnect(api);
    } else if (data.kind === 'response') {
      const operation = pending.get(data.id);
      if (!operation) return;
      pending.delete(data.id); clearTimeout(operation.timer);
      if (data.error) operation.reject(new ArtworkError(data.error.code, data.error.message));
      else operation.resolve({ result: data.result, revision: data.revision });
    } else if (data.kind === 'event') {
      for (const handler of handlers.get(data.event?.type) ?? []) {
        try { handler(data.event); } catch (error) { console.error('Bridge event listener failed', error); }
      }
    }
  };
  port.start();
  handshakeTimer = setTimeout(() => close(new ArtworkError('TIMEOUT', 'Artwork did not accept the connection')), timeout);
  iframe.contentWindow.postMessage({ protocol: BRIDGE_PROTOCOL, session, kind: 'connect' }, origin, [channel.port2]);
  return connected;
}
