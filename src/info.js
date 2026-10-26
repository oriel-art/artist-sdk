import { requireValue, object, copy } from './errors.js';
import { bindShortcuts } from './browser.js';
import { createPanel, element } from './panel.js';

/** Plain text and HTTP(S) links only. No HTML or Markdown interpretation. */
function validateInfo(info) {
  requireValue(object(info), 'Info must be an object');
  const string = (value, max = 20000) => { requireValue(typeof value === 'string' && value.length <= max, 'Invalid info text'); return value; };
  const list = (value, parse) => {
    requireValue(Array.isArray(value) && value.length <= 50, 'Info lists must contain at most 50 items');
    return value.map(item => { requireValue(object(item), 'Invalid info item'); return parse(item); });
  };
  const title = string(info.title, 300); requireValue(title.trim().length > 0, 'Info title is required');
  return { title, artist: string(info.artist ?? '', 300), description: string(info.description ?? ''),
    sections: list(info.sections ?? [], s => ({ heading: string(s.heading, 300), text: string(s.text) })),
    controls: list(info.controls ?? [], c => ({ key: string(c.key, 100), description: string(c.description, 1000) })),
    links: list(info.links ?? [], link => {
      const url = new URL(string(link.url, 4000));
      requireValue(['http:', 'https:'].includes(url.protocol), 'Info links must use HTTP(S)');
      return { label: string(link.label, 300), url: url.href };
    }) };
}

/** Optional viewer UI. Omit shortcutTarget when the artwork already handles i. */
export function createInfoPanel({ info, artwork, shortcutTarget, mount } = {}) {
  let content = validateInfo(info), disposed = false;
  const panel = createPanel({ mount, title: content.title, eyebrow: 'About the artwork' });
  const { doc, body } = panel;
  const state = element(doc, 'section');
  const updateState = () => {
    if (!artwork) return;
    state.replaceChildren(element(doc, 'h2', 'This instance'), element(doc, 'p', `Seed / ${artwork.seed}`, { class: 'meta' }));
    const traits = element(doc, 'dl');
    for (const [key, value] of Object.entries(artwork.getState().traits)) traits.append(element(doc, 'dt', key), element(doc, 'dd', String(value)));
    state.append(traits);
  };
  const render = () => {
    panel.label.textContent = content.title;
    body.replaceChildren();
    const intro = element(doc, 'section');
    if (content.artist) intro.append(element(doc, 'p', content.artist, { class: 'byline' }));
    if (content.description) intro.append(element(doc, 'p', content.description));
    body.append(intro);
    for (const s of content.sections) {
      const section = element(doc, 'section'); section.append(element(doc, 'h2', s.heading), element(doc, 'p', s.text)); body.append(section);
    }
    if (content.controls.length) {
      const section = element(doc, 'section'), controls = element(doc, 'dl');
      for (const c of content.controls) controls.append(element(doc, 'dt', c.key), element(doc, 'dd', c.description));
      section.append(element(doc, 'h2', 'Controls'), controls); body.append(section);
    }
    if (content.links.length) {
      const section = element(doc, 'section'), links = element(doc, 'ul');
      for (const link of content.links) {
        const item = element(doc, 'li'); item.append(element(doc, 'a', link.label, { href: link.url, target: '_blank', rel: 'noopener noreferrer' })); links.append(item);
      }
      section.append(element(doc, 'h2', 'More'), links); body.append(section);
    }
    if (artwork) { updateState(); body.append(state); }
  };
  render();
  const open = () => { requireValue(!disposed, 'Panel is disposed', 'DISPOSED'); updateState(); panel.open(); };
  const toggle = () => panel.dialog.open ? panel.close() : open();
  const unbind = shortcutTarget ? bindShortcuts(shortcutTarget, { i: toggle }) : () => {};
  panel.dialog.addEventListener('keydown', event => {
    if (shortcutTarget && !event.defaultPrevented && !event.repeat && !event.isComposing
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'i') {
      event.preventDefault(); event.stopPropagation(); panel.close();
    }
  });
  const unsubscribe = artwork?.subscribe(event => { if (event.type === 'state.changed' && panel.dialog.open) updateState(); }) ?? (() => {});
  return { element: panel.host, open, close: panel.close, toggle,
    getInfo: () => copy(content),
    setInfo(next) {
      requireValue(!disposed, 'Panel is disposed', 'DISPOSED');
      const refocus = panel.dialog.open && body.contains(panel.host.shadowRoot.activeElement);
      content = validateInfo(next); render();
      if (refocus) panel.dialog.querySelector('button').focus();
    },
    dispose() { if (disposed) return; disposed = true; unbind(); unsubscribe(); panel.dispose(); }
  };
}
