import { requireValue, copy, synchronous, object } from './errors.js';
import { generatorIdentity, validateParameters } from './parameters.js';
import { testParameters, parameterCases, parseSeedLines } from './testing.js';
import { downloadBlob } from './browser.js';
import { createPanel, element } from './panel.js';
import { valueLabel, swatchNode } from './parameter-display.js';
import { createReportView } from './parameter-report.js';
import { studioStyles } from './parameter-styles.js';

/** Optional studio UI. Replay is delegated to the artist, who owns the renderer. */
export function createParameterPanel({ artwork, onChange = () => {}, check, mount, resolver,
  onPreviewCase, captureContext, seeds, seedSource, placement, contextLabels = {}, livePreview = false, livePreviewDelay = 120 } = {}) {
  requireValue(artwork?.mode === 'studio', 'Parameter tools are available only in studio mode', 'FORBIDDEN');
  for (const callback of [onChange, check, onPreviewCase, captureContext]) requireValue(callback === undefined || typeof callback === 'function', 'Invalid parameter panel callback');
  requireValue(typeof livePreview === 'boolean' && Number.isFinite(livePreviewDelay) && livePreviewDelay >= 0 && livePreviewDelay <= 5000, 'Invalid live preview options');
  requireValue(object(contextLabels) && Object.values(contextLabels).every(label => typeof label === 'string' && label.length > 0 && label.length <= 200), 'Context labels must be nonempty strings of at most 200 characters');
  contextLabels = copy(contextLabels);
  const manifest = artwork.manifest(), definitions = manifest.parameters, initial = { ...artwork.parameters };
  const generator = generatorIdentity(resolver);
  requireValue(JSON.stringify(generator) === JSON.stringify(manifest.generator), 'Panel resolver must match the artwork generator');
  if (seeds !== undefined) requireValue(Array.isArray(seeds) && seeds.every(seed => typeof seed === 'string' && !/[\r\n]/.test(seed)), 'Panel seeds must be single-line strings; use testParameters for other seeds');
  const cases = parameterCases(definitions, { seed: artwork.seed, values: initial });
  const panel = createPanel({ mount, title: 'Parameter lab', eyebrow: 'Artist tools / studio only', modal: false, placement });
  const { doc, body } = panel;
  const node = (tag, text, attrs) => element(doc, tag, text, attrs);
  panel.dialog.classList.add('studio-panel');
  panel.host.shadowRoot.append(node('style', studioStyles));
  let disposed = false, busy = false, dirty = false, rendering = false, applying = false, conflict = false, renderFailed = false;
  let draftBase, lastReport = null, reportSummary = null, timer = null, pending = false;
  const controls = new Map(), extras = new Map();
  const form = node('form'), fields = node('div', undefined, { class: 'fields' });
  const notice = node('p', '', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = message => { notice.textContent = message; };
  form.append(node('h2', 'Try a variation'), node('p', 'Edit values, then apply them to the running artwork. The seed stays unchanged.', { class: 'hint' }), fields);
  for (const [id, d] of Object.entries(definitions)) {
    const fieldId = `parameter-${controls.size}`, title = d.label ?? id;
    const label = node('label', title, { for: fieldId }), input = node(d.type === 'choice' ? 'select' : 'input', undefined, { 'data-parameter': id, id: fieldId });
    const field = node('div'); field.append(label, input); fields.append(field); controls.set(id, input);
    if (d.type === 'choice') {
      field.className = 'field-wide';
      const choiceLabel = index => valueLabel(d, d.choices[index]);
      const selected = node('p', '', { class: 'selected-choice' });
      let search;
      if (d.choices.length > 12 || d.ui?.search) {
        search = node('input', undefined, { type: 'search', class: 'choice-search', 'aria-label': `Search ${title}`, placeholder: 'Search choices…' });
        field.insertBefore(search, input); input.hidden = true; input.tabIndex = -1;
      }
      const swatches = node('div', undefined, { class: search ? 'choice-list' : 'swatches', role: 'group', 'aria-label': `${title} choices` });
      const renderChoices = () => {
        const current = input.value || '0', term = search?.value.toLocaleLowerCase() ?? '';
        input.replaceChildren(); swatches.replaceChildren();
        d.choices.forEach((value, index) => {
          const text = choiceLabel(index), matches = String(text).toLocaleLowerCase().includes(term);
          if (!matches && String(index) !== current) return;
          input.append(node('option', text, { value: String(index), title: text }));
          const colors = d.ui?.swatches?.[index];
          if ((!matches && String(index) !== current) || (!search && (!Array.isArray(colors) || !colors.length))) return;
          const button = node('button', undefined, { type: 'button', title: text, 'data-choice': index, 'aria-label': `Choose ${text}`, 'aria-pressed': String(String(index) === current) });
          if (search) button.append(node('span', text, { class: 'choice-name' }));
          const chips = swatchNode(node, d, value); if (chips) button.append(chips);
          button.onclick = () => { input.value = String(index); renderChoices(); edited(); swatches.querySelector(`[data-choice="${index}"]`)?.focus(); }; swatches.append(button);
        });
        input.value = current; selected.textContent = `Selected: ${choiceLabel(Number(current))}`;
      };
      search?.addEventListener('input', event => { event.stopPropagation(); renderChoices(); });
      input.addEventListener('change', renderChoices);
      field.append(selected, swatches); extras.set(id, renderChoices); renderChoices();
    } else if (d.type === 'boolean') input.type = 'checkbox';
    else {
      input.type = 'number'; input.min = d.min; input.max = d.max; input.step = d.type === 'integer' ? '1' : 'any'; input.required = true;
      const step = d.ui?.step ?? (d.type === 'integer' ? 1 : (d.max - d.min) / 1000 || 1);
      requireValue(Number.isFinite(step) && step > 0 && (d.type !== 'integer' || Number.isSafeInteger(step)), 'Invalid slider step');
      const slider = node('input', undefined, { type: 'range', min: d.min, max: d.max, step, 'aria-label': `${title} slider` });
      const sync = () => { if (Number.isFinite(input.valueAsNumber)) slider.value = input.value; };
      input.addEventListener('input', sync);
      slider.addEventListener('input', () => { input.value = slider.value; edited(); });
      field.append(slider, node('span', `Range: ${d.min} to ${d.max}`, { class: 'hint' })); extras.set(id, sync);
    }
    input.addEventListener('input', () => edited()); input.addEventListener('change', () => edited());
  }
  const fill = values => {
    for (const [id, input] of controls) {
      const d = definitions[id];
      if (d.type === 'boolean') input.checked = values[id];
      else {
        // Restore a filtered choice before setting its exact primitive value.
        if (d.type === 'choice' && ![...input.options].some(o => o.value === String(d.choices.indexOf(values[id]))))
          input.append(node('option', String(values[id]), { value: String(d.choices.indexOf(values[id])) }));
        input.value = d.type === 'choice' ? String(d.choices.indexOf(values[id])) : String(values[id]);
      }
      extras.get(id)?.();
    }
  };
  const read = () => Object.fromEntries([...controls].map(([id, input]) => {
    const d = definitions[id];
    return [id, d.type === 'boolean' ? input.checked : d.type === 'choice' ? d.choices[Number(input.value)] : input.valueAsNumber];
  }));
  const same = (a, b) => Object.keys(definitions).every(id => a[id] === b[id]);
  const footer = node('footer', undefined, { class: 'editor-footer', 'aria-label': 'Parameter editing' });
  const editState = node('p', '', { class: 'editor-state', role: 'status', 'aria-live': 'polite' });
  const apply = node('button', 'Apply values', { type: 'button', class: 'primary' });
  const reload = node('button', 'Reload current values', { type: 'button' });
  const reset = node('button', 'Restore starting values', { type: 'button' });
  const liveLabel = node('label', 'Live preview', { class: 'check-label' });
  const liveToggle = node('input', undefined, { type: 'checkbox' }); liveToggle.checked = livePreview; liveLabel.prepend(liveToggle);
  const actions = node('div', undefined, { class: 'actions' }); actions.append(apply, reset, reload);
  footer.append(editState, actions, liveLabel, notice); panel.dialog.append(footer);
  const updateEditor = () => {
    dirty = !same(read(), draftBase);
    editState.textContent = conflict ? 'External changes — reload required' : rendering
      ? dirty ? 'Rendering · Unapplied changes waiting' : 'Rendering current values…'
      : dirty ? 'Unapplied changes' : renderFailed ? 'Values applied · Redraw failed' : 'All changes applied';
    apply.disabled = reload.disabled = reset.disabled = busy || rendering;
    liveToggle.disabled = busy;
  };
  const cancelPending = () => { clearTimeout(timer); timer = null; pending = false; };
  const refresh = () => { cancelPending(); draftBase = { ...artwork.parameters }; conflict = false; renderFailed = false; fill(draftBase); updateEditor(); };
  const stopLive = message => { cancelPending(); liveToggle.checked = false; if (!disposed) { say(message); updateEditor(); } };
  const schedule = () => {
    clearTimeout(timer); timer = null;
    if (!liveToggle.checked || disposed || busy || conflict || !panel.dialog.open) return;
    pending = true;
    if (!rendering) timer = setTimeout(flushLive, livePreviewDelay);
  };
  const edited = () => { updateEditor(); if (!dirty) cancelPending(); else schedule(); };
  const restoreFocus = focused => {
    if (!disposed && panel.dialog.open && focused?.isConnected
      && (doc.activeElement === doc.body || doc.activeElement === panel.host && !panel.host.shadowRoot.activeElement)) focused.focus();
  };
  const commit = async values => {
    if (busy || rendering || disposed) return;
    rendering = true; const focused = panel.host.shadowRoot.activeElement; updateEditor();
    let applied = false;
    try {
      applying = true;
      const state = artwork.setParameters(values); applied = true; applying = false;
      draftBase = { ...state.parameters }; renderFailed = false; updateEditor();
      await onChange(state);
      if (!disposed && !conflict) say('Values applied. The artwork seed is unchanged.');
    } catch (error) {
      renderFailed = applied;
      stopLive(`${applied ? 'Values applied, but redraw failed' : 'Could not apply values'}: ${error.message}. Live preview is off.`);
    } finally {
      applying = false; rendering = false;
      if (!disposed) { updateEditor(); restoreFocus(focused); if (pending) schedule(); }
    }
  };
  const prepare = () => {
    if (!same(draftBase, artwork.parameters)) {
      conflict = true; stopLive('Parameters changed outside this panel. Reload current values before applying.'); return null;
    }
    try { return validateParameters(definitions, read()); }
    catch (error) { say(error.message); updateEditor(); return null; }
  };
  async function flushLive() {
    timer = null;
    if (!panel.dialog.open) { cancelPending(); return; }
    if (!pending || disposed || busy || rendering || !liveToggle.checked) return;
    pending = false;
    const values = prepare();
    if (values && !same(values, draftBase)) await commit(values);
  }
  const applyDraft = () => { if (busy || rendering || disposed) return; cancelPending(); const values = prepare(); if (values) void commit(values); };
  form.addEventListener('submit', event => { event.preventDefault(); applyDraft(); }); apply.onclick = applyDraft;
  liveToggle.onchange = () => {
    if (liveToggle.checked) { say('Live preview applies valid edits to the artwork.'); if (dirty) schedule(); }
    else { cancelPending(); say(rendering ? 'Finishing the current render. Further edits require Apply.' : 'Live preview is off. Use Apply values to update the artwork.'); }
  };
  reload.onclick = () => { if (!busy && !rendering) { refresh(); say('Current artwork values loaded.'); } };
  reset.onclick = () => {
    if (busy || rendering) return;
    cancelPending(); draftBase = { ...artwork.parameters }; conflict = false; fill(initial); updateEditor(); void commit(initial);
  };
  const withBusy = async task => {
    if (busy || disposed) return;
    if (rendering) { say('Wait for the current render to finish before opening a case.'); return; }
    cancelPending(); busy = true;
    const focused = panel.host.shadowRoot.activeElement;
    body.inert = footer.inert = true; updateEditor();
    try { await task(); }
    finally { busy = false; body.inert = footer.inert = false; if (!disposed) { updateEditor(); restoreFocus(focused); } }
  };
  panel.dialog.addEventListener('close', cancelPending);
  const caseLabel = node('label', 'Boundary case', { for: 'boundary-case' }), caseSelect = node('select', undefined, { id: 'boundary-case' });
  const groups = new Map();
  cases.forEach((c, i) => {
    if (c.parameter === null) caseSelect.append(node('option', c.name, { value: String(i) }));
    else {
      if (!groups.has(c.parameter)) { const group = node('optgroup', undefined, { label: c.label }); groups.set(c.parameter, group); caseSelect.append(group); }
      groups.get(c.parameter).append(node('option', c.name, { value: String(i) }));
    }
  });
  const load = node('button', 'Load case into fields', { type: 'button' });
  load.onclick = () => { if (busy || rendering) return; refresh(); fill(cases[Number(caseSelect.value)].values); updateEditor(); say('Boundary case loaded. Apply values to preview it.'); };
  form.append(caseLabel, caseSelect, node('div', undefined, { class: 'actions' })); form.lastChild.append(load);
  form.append(node('p', 'Cases vary one parameter at a time from the starting values; they do not test every combination.', { class: 'hint' }));
  const live = node('section'); live.append(form); body.append(live);

  const batch = node('section'), batchForm = node('form'), batchFields = node('div', undefined, { class: 'fields' });
  batch.append(node('h2', 'Check a run of seeds'), node('p', generator.kind === 'artist'
    ? `Artist resolver: ${generator.id} / ${generator.version}. Uses the artist generator; current editor overrides and unapplied edits are excluded.`
    : 'SDK exploration: schema defaults and distributions. Current editor overrides and unapplied edits are excluded.', { class: 'hint' }));
  const prefixLabel = node('label', 'Seed prefix'), prefix = node('input', undefined, { type: 'text', value: 'parameter-test', required: '', maxlength: '4000' });
  const countLabel = node('label', 'Sample count'), count = node('input', undefined, { type: 'number', value: '100', min: '1', max: '1000', step: '1', required: '' });
  prefixLabel.append(prefix); countLabel.append(count); batchFields.append(prefixLabel, countLabel);
  const explicit = node('textarea', undefined, { rows: '3', 'aria-label': 'Exact seeds', placeholder: 'Optional: one exact seed per line' });
  explicit.value = seeds?.join('\n') ?? '';
  const sourceInput = node('input', undefined, { type: 'text', value: seedSource ?? '', 'aria-label': 'Seed source', placeholder: 'e.g. Verse preview sample', maxlength: '1000' });
  const exactLabel = node('label', 'Exact seeds (optional)'), sourceLabel = node('label', 'Seed source');
  exactLabel.append(explicit); sourceLabel.append(sourceInput);
  const seedStatus = node('p', '', { class: 'seed-status', id: 'seed-status', role: 'status' });
  explicit.setAttribute('aria-describedby', 'seed-status');
  const cleanSeeds = node('button', 'Remove empty lines', { type: 'button' });
  const seedLines = () => explicit.value.split(/\r\n|\r|\n/);
  const checkSeeds = () => {
    prefix.disabled = count.disabled = explicit.value !== '';
    cleanSeeds.disabled = explicit.value === '' || !seedLines().some(line => line === '');
    try {
      const list = explicit.value === '' ? undefined : parseSeedLines(explicit.value);
      requireValue(list === undefined || list.length <= 1000, `The panel supports up to 1000 seeds; received ${list?.length}.`);
      explicit.removeAttribute('aria-invalid');
      seedStatus.textContent = list ? `${list.length} exact seeds. Spaces and duplicates are preserved.` : 'No exact seeds entered; the run will use the prefix and sample count.';
      return list;
    } catch (error) { explicit.setAttribute('aria-invalid', 'true'); seedStatus.textContent = error.message; throw error; }
  };
  explicit.addEventListener('input', () => { try { checkSeeds(); } catch { /* The field already shows the line-specific error. */ } });
  cleanSeeds.onclick = () => {
    const before = seedLines(), kept = before.filter(line => line !== '');
    explicit.value = kept.join('\n');
    try { checkSeeds(); } catch { /* Preserve other errors for review. */ }
    seedStatus.textContent = `Removed ${before.length - kept.length} empty lines. ${seedStatus.textContent}`;
    explicit.focus();
  };
  try { checkSeeds(); } catch { /* Initial pasted lists can be corrected in the editor. */ }
  const run = node('button', 'Run parameter checks', { type: 'submit', class: 'primary' });
  const save = node('button', 'Save report', { type: 'button', disabled: '' });
  const batchActions = node('div', undefined, { class: 'actions' }); batchActions.append(run, save);
  const results = node('div'), batchStatus = node('p', '', { class: 'status', role: 'status', 'aria-live': 'polite', 'aria-label': 'Report action status' });
  batchForm.append(batchFields, node('p', 'Supply exact seeds to test your edition inputs. Lines are preserved without trimming; blank lines are invalid.', { class: 'hint' }), exactLabel, seedStatus, cleanSeeds, sourceLabel, batchActions);
  batch.append(batchForm, batchStatus, results); body.append(batch);
  batchForm.addEventListener('submit', event => {
    event.preventDefault(); if (busy || disposed) return;
    if (rendering) { batchStatus.textContent = 'Wait for the current render to finish before capturing comparison context.'; return; }
    cancelPending();
    try {
      const exact = checkSeeds();
      requireValue(exact || count.valueAsNumber <= 1000, 'The panel supports up to 1000 samples');
      const baseline = captureContext ? artwork.getRecipe({ context: synchronous(captureContext(), 'Context capture') }) : artwork.getRecipe();
      const report = testParameters(definitions, { seeds: exact, seedSource: sourceInput.value, prefix: prefix.value,
        count: count.valueAsNumber, check, resolver, artwork: { id: artwork.id, version: artwork.version } });
      if (baseline.context) report.context = baseline.context;
      const view = createReportView({ node, report, contextLabels, onPreviewCase, runAction: withBusy,
        message: message => { if (!disposed) batchStatus.textContent = message; } });
      reportSummary?.remove(); reportSummary = view.summary; panel.dialog.insertBefore(reportSummary, body);
      results.replaceChildren(view.content); lastReport = report; save.disabled = false;
      batchStatus.textContent = 'Report ready. Review counts and cases below.';
    } catch (error) { batchStatus.textContent = error.message; }
  });
  save.onclick = () => {
    if (!lastReport) return;
    downloadBlob(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }), `${artwork.id}-parameter-report.json`);
    batchStatus.textContent = 'Report download started.';
  };
  const unsubscribe = artwork.subscribe(event => {
    if (disposed || applying || event.type !== 'state.changed') return;
    if (same(draftBase, artwork.parameters)) return;
    if (!dirty && !rendering) refresh();
    else { conflict = true; stopLive('Parameters changed outside this panel. Reload current values before applying.'); }
  });
  refresh();
  return { element: panel.host, open: panel.open, close() { cancelPending(); panel.close(); }, setPlacement: panel.setPlacement,
    getReport: () => lastReport ? copy(lastReport) : null,
    dispose() { if (disposed) return; cancelPending(); disposed = true; unsubscribe(); panel.dialog.removeEventListener('close', cancelPending); panel.dispose(); }
  };
}
