import { requireValue } from './errors.js';

export function readInputs(url = globalThis.location?.href) {
  const parsed = new URL(url);
  if (parsed.searchParams.has('recipe')) {
    const encoded = parsed.searchParams.get('recipe');
    requireValue(encoded.length <= 20000 && !parsed.searchParams.has('seed') && !parsed.searchParams.has('params'), 'Recipe URL is too large or mixes recipe and legacy inputs');
    let recipe;
    try { recipe = JSON.parse(encoded); } catch { requireValue(false, 'URL recipe must be valid JSON'); }
    requireValue(recipe && typeof recipe === 'object' && !Array.isArray(recipe)
      && typeof recipe.seed === 'string' && recipe.seed.length > 0 && recipe.seed.length <= 4096
      && recipe.parameters && typeof recipe.parameters === 'object' && !Array.isArray(recipe.parameters), 'Invalid URL recipe');
    return { seed: recipe.seed, values: recipe.parameters, recipe };
  }
  const seed = parsed.searchParams.get('seed');
  requireValue(seed === null || seed.length > 0 && seed.length <= 4096, 'Invalid URL seed');
  const encoded = parsed.searchParams.get('params');
  requireValue(encoded === null || encoded.length <= 16384, 'URL parameters are too large');
  let values = {};
  if (encoded !== null) {
    try { values = JSON.parse(encoded); } catch { requireValue(false, 'URL params must be valid JSON'); }
    requireValue(values !== null && typeof values === 'object' && !Array.isArray(values), 'URL params must be an object');
  }
  return { seed, values };
}

export function shareURL(url, recipe) {
  const parsed = new URL(url);
  if (recipe.format) {
    parsed.searchParams.delete('seed'); parsed.searchParams.delete('params');
    parsed.searchParams.set('recipe', JSON.stringify(recipe));
  } else {
    parsed.searchParams.delete('recipe');
    parsed.searchParams.set('seed', recipe.seed);
    parsed.searchParams.set('params', JSON.stringify(recipe.parameters));
  }
  requireValue(parsed.href.length <= 20000, 'Use a recipe file for larger inputs');
  return parsed.href;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Scoped to a focusable artwork element; does not capture document-wide keys. */
export function bindShortcuts(target, actions, onError = console.error) {
  const handler = event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.composedPath().some(node => node?.matches?.('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])'))) return;
    const key = (event.shiftKey ? 'shift+' : '') + event.key.toLowerCase();
    if (!Object.hasOwn(actions, key)) return;
    event.preventDefault();
    Promise.resolve().then(actions[key]).catch(onError);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
