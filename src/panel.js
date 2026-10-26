import { requireValue } from './errors.js';

// Shared, optional UI. Nothing is mounted or styled on module import.
export function element(document, tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createPanel({ mount = document.body, title, eyebrow, wide = false, modal = true, placement = {} }) {
  const doc = mount.ownerDocument;
  const host = element(doc, 'div', undefined, { 'data-artist-sdk-panel': '' });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element(doc, 'style', `
    :host { --panel-paper:var(--artist-sdk-paper,#f2eee4); --panel-ink:var(--artist-sdk-ink,#292b25); --panel-accent:var(--artist-sdk-accent,#8b4025); }
    * { box-sizing:border-box; }
    dialog { color:var(--panel-ink); background:var(--panel-paper); border:1px solid #c8c0b0; padding:0; width:min(${wide ? '850' : '600'}px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; font:13px/1.65 var(--artist-sdk-font,Verdana,sans-serif); box-shadow:0 24px 90px #0005; }
    dialog::backdrop { background:#15201bd1; }
    dialog[data-floating] { position:fixed; inset:var(--panel-top) var(--panel-edge) auto auto; margin:0; width:min(var(--panel-width),calc(100vw - 2 * var(--panel-edge))); max-height:calc(100dvh - var(--panel-top) - var(--panel-bottom)); z-index:1000; }
    dialog[data-dock=left] { left:var(--panel-edge); right:auto; }
    dialog[data-dock=inline] { position:relative; inset:auto; width:100%; max-width:var(--panel-width); z-index:auto; box-shadow:none; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:28px 32px 22px; border-bottom:1px solid #c8c0b0; position:sticky; top:0; z-index:1; background:var(--panel-paper); }
    header p { margin:0 0 10px; color:var(--panel-accent); font:10px/1.5 monospace; letter-spacing:1.5px; text-transform:uppercase; }
    h1 { font:normal 38px/1.1 Georgia,serif; margin:0; overflow-wrap:anywhere; }
    h2 { font:normal 24px/1.2 Georgia,serif; margin:0 0 14px; }
    .body { padding:26px 32px 32px; } p { margin:0 0 16px; white-space:pre-wrap; overflow-wrap:anywhere; }
    section + section { border-top:1px solid #c8c0b0; margin-top:24px; padding-top:24px; }
    button,input,select,textarea { color:inherit; background:transparent; border:1px solid #b9b1a0; border-radius:0; font:inherit; padding:9px 11px; min-height:42px; max-width:100%; }
    textarea { width:100%; resize:vertical; font:11px/1.6 monospace; }
    button { cursor:pointer; } button:hover { background:#e3dccd; } button:disabled { opacity:.5; cursor:default; }
    .primary { background:var(--panel-ink); color:var(--panel-paper); } .primary:hover { background:#454a3f; }
    :focus-visible { outline:2px solid var(--panel-accent); outline-offset:3px; }
    a { color:var(--panel-accent); text-underline-offset:3px; } a:hover { text-decoration:none; }
    ul { padding-left:20px; } li { margin:8px 0; } dl { display:grid; grid-template-columns:minmax(60px,auto) 1fr; gap:8px 20px; }
    dt { font:12px/1.8 monospace; } dd { margin:0; overflow-wrap:anywhere; } .byline { color:var(--panel-accent); }
    .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 22px; }
    .field-wide { grid-column:1 / -1; min-width:0; } input[type=range] { width:100%; padding:0; border:0; accent-color:var(--panel-accent); }
    .selected-choice { font:11px/1.6 monospace; margin:8px 0; } .choice-search { width:100%; margin:6px 0; }
    .swatches { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; } .swatches button { padding:5px; display:flex; gap:2px; min-width:42px; }
    .color-chips { display:flex; gap:2px; } .color-chip { display:inline-block; width:12px; height:24px; border:1px solid #0003; }
    .swatches [aria-pressed=true],.choice-list [aria-pressed=true] { border:2px solid var(--panel-accent); }
    .choice-list { display:grid; gap:6px; max-height:220px; overflow:auto; padding:3px; margin:0 -3px; }
    .choice-list button { width:100%; text-align:left; display:grid; gap:8px; white-space:normal; overflow-wrap:anywhere; }
    [hidden] { display:none !important; }
    .case-row { border-top:1px solid #c8c0b0; padding:14px 0; } .case-row .actions { margin:8px 0 0; } .case-row p { margin-bottom:6px; }
    .case-status { color:var(--panel-accent); font:10px/1.5 monospace; text-transform:uppercase; letter-spacing:1px; }
    label { display:block; font:11px/1.5 monospace; } label input:not([type=checkbox]),.fields > div > input:not([type=checkbox]),.fields > div > select,form > select { display:block; width:100%; margin-top:6px; font:13px/1.5 Verdana,sans-serif; }
    input[type=checkbox] { min-height:0; width:20px; height:20px; display:block; margin:10px 0; accent-color:var(--panel-accent); }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0; } .hint { color:#656155; font-size:11px; }
    .status { color:var(--panel-accent); min-height:22px; margin-top:16px; }
    .table-wrap { overflow-x:auto; } table { border-collapse:collapse; width:100%; margin:16px 0; font-size:12px; }
    th,td { text-align:left; vertical-align:top; padding:10px 12px 10px 0; border-bottom:1px solid #c8c0b0; overflow-wrap:anywhere; }
    th { font:10px/1.5 monospace; text-transform:uppercase; letter-spacing:1px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; background:#e6dfd0; padding:16px; max-height:220px; overflow:auto; font:11px/1.6 monospace; }
    summary { cursor:pointer; } kbd { font:12px monospace; } .meta { font:11px/1.6 monospace; }
    @media(max-width:540px) { header { padding:22px 20px; } .body { padding:22px 20px; } h1 { font-size:32px; } .fields { grid-template-columns:1fr; } }
  `);
  const dialog = element(doc, 'dialog', undefined, { 'aria-labelledby': 'panel-title' });
  if (!modal) dialog.setAttribute('data-floating', '');
  const setPlacement = (next = {}) => {
    requireValue(next && typeof next === 'object' && !Array.isArray(next), 'Invalid panel placement');
    const config = { dock: 'right', top: 16, bottom: 16, edge: 16, width: 420, ...next };
    requireValue(Object.keys(config).every(key => ['dock', 'top', 'bottom', 'edge', 'width'].includes(key))
      && ['left', 'right', 'inline'].includes(config.dock), 'Invalid panel docking');
    for (const key of ['top', 'bottom', 'edge', 'width']) requireValue(Number.isFinite(config[key]) && config[key] >= 0 && config[key] <= 10000, 'Panel offsets and width must be nonnegative pixels');
    requireValue(config.width >= 240, 'Panel width must be at least 240 pixels');
    dialog.dataset.dock = config.dock;
    for (const key of ['top', 'bottom', 'edge']) dialog.style.setProperty(`--panel-${key}`, `min(${config[key]}px,25${key === 'edge' ? 'vw' : 'dvh'})`);
    dialog.style.setProperty('--panel-width', `${config.width}px`);
  };
  if (!modal) setPlacement(placement);
  requireValue(typeof dialog.showModal === 'function', 'This UI requires native HTML dialog support', 'UNSUPPORTED');
  const header = element(doc, 'header'), heading = element(doc, 'div');
  const label = element(doc, 'h1', title, { id: 'panel-title' });
  heading.append(element(doc, 'p', eyebrow), label);
  const closeButton = element(doc, 'button', 'Close', { type: 'button', autofocus: '' });
  header.append(heading, closeButton);
  const body = element(doc, 'div', undefined, { class: 'body' });
  dialog.append(header, body); shadow.append(style, dialog); mount.append(host);
  let disposed = false, previous;
  const restore = () => { if (!dialog.open && previous?.isConnected) previous.focus(); };
  const close = () => { if (dialog.open) dialog.close(); restore(); };
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', restore);
  dialog.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    if (!modal && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!modal || event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1), active = shadow.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (active === last || active === dialog)) { event.preventDefault(); first?.focus(); }
  });
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close();
  });
  return { host, dialog, body, label, doc, setPlacement,
    open() {
      requireValue(!disposed, 'Panel is disposed', 'DISPOSED');
      if (dialog.open) return;
      previous = doc.activeElement;
      while (previous?.shadowRoot?.activeElement) previous = previous.shadowRoot.activeElement;
      if (modal) dialog.showModal(); else dialog.show();
      closeButton.focus();
    }, close,
    dispose() { if (disposed) return; close(); disposed = true; dialog.removeEventListener('close', restore); host.remove(); }
  };
}
