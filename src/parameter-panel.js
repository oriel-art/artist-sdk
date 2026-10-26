import { requireValue, copy, synchronous } from './errors.js';
import { generatorIdentity, validateParameters } from './parameters.js';
import { testParameters, parameterCases, recipeForCase } from './testing.js';
import { downloadBlob } from './browser.js';
import { createPanel, element } from './panel.js';

/** Optional studio UI. Replay is delegated to the artist, who owns the renderer. */
export function createParameterPanel({ artwork, onChange = () => {}, check, mount, resolver,
  onPreviewCase, captureContext, seeds, seedSource, placement } = {}) {
  requireValue(artwork?.mode === 'studio', 'Parameter tools are available only in studio mode', 'FORBIDDEN');
  for (const callback of [onChange, check, onPreviewCase, captureContext]) requireValue(callback === undefined || typeof callback === 'function', 'Invalid parameter panel callback');
  const manifest = artwork.manifest(), definitions = manifest.parameters, initial = { ...artwork.parameters };
  const generator = generatorIdentity(resolver);
  requireValue(JSON.stringify(generator) === JSON.stringify(manifest.generator), 'Panel resolver must match the artwork generator');
  if (seeds !== undefined) requireValue(Array.isArray(seeds) && seeds.every(seed => typeof seed === 'string' && !/[\r\n]/.test(seed)), 'Panel seeds must be single-line strings; use testParameters for other seeds');
  const cases = parameterCases(definitions, { seed: artwork.seed, values: initial });
  const panel = createPanel({ mount, title: 'Parameter lab', eyebrow: 'Artist tools / studio only', modal: false, placement });
  const { doc, body } = panel;
  const node = (tag, text, attrs) => element(doc, tag, text, attrs);
  let disposed = false, busy = false, dirty = false, draftBase, lastReport = null;
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
      const choiceLabel = index => {
        const value = d.choices[index], text = d.ui?.choiceLabels?.[index] ?? String(value);
        return d.choices.some(other => other !== value && String(other) === String(value)) ? `${text} (${typeof value})` : text;
      };
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
          const chips = node('span', undefined, { class: 'color-chips', 'aria-hidden': 'true' });
          for (const color of colors ?? []) {
            requireValue(typeof color === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color), 'Swatches require #RGB or #RRGGBB colors');
            const chip = node('span', undefined, { class: 'color-chip' }); chip.style.backgroundColor = color; chips.append(chip);
          }
          if (chips.childNodes.length) button.append(chips);
          button.onclick = () => { input.value = String(index); dirty = true; renderChoices(); swatches.querySelector(`[data-choice="${index}"]`)?.focus(); }; swatches.append(button);
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
      slider.addEventListener('input', () => { input.value = slider.value; dirty = true; });
      field.append(slider, node('span', `Range: ${d.min} to ${d.max}`, { class: 'hint' })); extras.set(id, sync);
    }
    input.addEventListener('input', () => { dirty = true; }); input.addEventListener('change', () => { dirty = true; });
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
  const refresh = () => { draftBase = { ...artwork.parameters }; dirty = false; fill(draftBase); };
  const read = () => Object.fromEntries([...controls].map(([id, input]) => {
    const d = definitions[id];
    return [id, d.type === 'boolean' ? input.checked : d.type === 'choice' ? d.choices[Number(input.value)] : input.valueAsNumber];
  }));
  const apply = node('button', 'Apply values', { type: 'submit', class: 'primary' });
  const reload = node('button', 'Reload current values', { type: 'button' });
  const reset = node('button', 'Restore starting values', { type: 'button' });
  const actions = node('div', undefined, { class: 'actions' }); actions.append(apply, reload, reset); form.append(actions);
  const withBusy = async task => {
    if (busy || disposed) return;
    busy = true;
    body.inert = true;
    const enabled = [...body.querySelectorAll('input, button, select, textarea')].filter(control => !control.disabled);
    enabled.forEach(control => { control.disabled = true; });
    try { await task(); }
    finally { busy = false; body.inert = false; if (!disposed) enabled.forEach(control => { control.disabled = false; }); }
  };
  const commit = values => withBusy(async () => {
    let applied = false;
    try {
      const state = artwork.setParameters(values); applied = true; refresh();
      await onChange(state);
      if (!disposed) say('Values applied. The artwork seed is unchanged.');
    } catch (error) { if (!disposed) say(`${applied ? 'Values applied, but redraw failed' : 'Could not apply values'}: ${error.message}`); }
  });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    if (JSON.stringify(draftBase) !== JSON.stringify(artwork.parameters)) { say('Parameters changed outside this panel. Reload current values before applying.'); return; }
    try { const values = validateParameters(definitions, read()); void commit(values); } catch (error) { say(error.message); }
  });
  reload.onclick = () => { if (!busy) { refresh(); say('Current artwork values loaded.'); } };
  reset.onclick = () => { void commit(initial); };
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
  load.onclick = () => { if (busy) return; refresh(); fill(cases[Number(caseSelect.value)].values); dirty = true; say('Boundary case loaded. Apply values to preview it.'); };
  form.append(caseLabel, caseSelect, node('div', undefined, { class: 'actions' })); form.lastChild.append(load);
  form.append(node('p', 'Cases vary one parameter at a time from the starting values; they do not test every combination.', { class: 'hint' }), notice);
  const live = node('section'); live.append(form); body.append(live);

  const batch = node('section'), batchForm = node('form'), batchFields = node('div', undefined, { class: 'fields' });
  batch.append(node('h2', 'Check a run of seeds'), node('p', generator.kind === 'artist'
    ? `Artist resolver: ${generator.id} / ${generator.version}. Counts describe this seed set, not guaranteed edition rarity.`
    : 'SDK exploration: schema defaults and distributions. Counts do not describe an existing artist generator.', { class: 'hint' }));
  const prefixLabel = node('label', 'Seed prefix'), prefix = node('input', undefined, { type: 'text', value: 'parameter-test', required: '', maxlength: '4000' });
  const countLabel = node('label', 'Sample count'), count = node('input', undefined, { type: 'number', value: '100', min: '1', max: '1000', step: '1', required: '' });
  prefixLabel.append(prefix); countLabel.append(count); batchFields.append(prefixLabel, countLabel);
  const explicit = node('textarea', undefined, { rows: '3', 'aria-label': 'Exact seeds', placeholder: 'Optional: one exact seed per line' });
  explicit.value = seeds?.join('\n') ?? '';
  const sourceInput = node('input', undefined, { type: 'text', value: seedSource ?? '', 'aria-label': 'Seed source', placeholder: 'e.g. Verse preview sample', maxlength: '1000' });
  const exactLabel = node('label', 'Exact seeds (optional)'), sourceLabel = node('label', 'Seed source');
  exactLabel.append(explicit); sourceLabel.append(sourceInput);
  const toggleSeeds = () => { prefix.disabled = count.disabled = explicit.value !== ''; };
  explicit.addEventListener('input', toggleSeeds); toggleSeeds();
  const run = node('button', 'Run parameter checks', { type: 'submit', class: 'primary' });
  const save = node('button', 'Save report', { type: 'button', disabled: '' });
  const batchActions = node('div', undefined, { class: 'actions' }); batchActions.append(run, save);
  const results = node('div'), batchStatus = node('p', '', { class: 'status', role: 'status', 'aria-live': 'polite' });
  batchForm.append(batchFields, node('p', 'Supply exact seeds to test your edition inputs. Lines are preserved without trimming; blank lines are invalid.', { class: 'hint' }), exactLabel, sourceLabel, batchActions);
  batch.append(batchForm, batchStatus, results); body.append(batch);
  batchForm.addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    try {
      const exact = explicit.value === '' ? undefined : explicit.value.split(/\r?\n/);
      requireValue(exact ? exact.length <= 1000 : count.valueAsNumber <= 1000, 'The panel supports up to 1000 samples');
      const baseline = captureContext ? artwork.getRecipe({ context: synchronous(captureContext(), 'Context capture') }) : artwork.getRecipe();
      const report = testParameters(definitions, { seeds: exact, seedSource: sourceInput.value, prefix: prefix.value,
        count: count.valueAsNumber, check, resolver, artwork: { id: artwork.id, version: artwork.version } });
      if (baseline.context) report.context = baseline.context;
      lastReport = report; save.disabled = false;
      batchStatus.textContent = `${report.count} seeds sampled. ${report.counts.warning} warnings; ${report.counts.failure} failed artist checks; ${report.counts.error} execution errors.${report.checked ? '' : ' No artist checks registered.'}`;
      results.replaceChildren();
      const wrap = node('div', undefined, { class: 'table-wrap' }), table = node('table'), head = node('thead'), row = node('tr');
      row.append(node('th', 'Parameter'), node('th', 'Observed values')); head.append(row); table.append(head);
      const tbody = node('tbody');
      for (const [id, summary] of Object.entries(report.summary)) {
        const row = node('tr');
        const text = summary.counts ? summary.counts.map(c => `${JSON.stringify(c.value)}: ${c.count}`).join(' · ')
          : summary.min === null ? 'No resolved values' : `${summary.min.toPrecision(4)} – ${summary.max.toPrecision(4)} / mean ${summary.mean.toPrecision(4)}`;
        row.append(node('td', definitions[id].label ?? id), node('td', text)); tbody.append(row);
      }
      table.append(tbody); wrap.append(table); results.append(wrap);
      results.append(node('h2', 'Review cases'));
      const filter = node('select', undefined, { 'aria-label': 'Filter cases' });
      for (const [value, text] of [['all', 'All cases'], ['flagged', 'Warnings, failures & errors'], ['warning', 'Warnings'], ['failure', 'Failures'], ['error', 'Execution errors']]) filter.append(node('option', text, { value }));
      filter.value = report.warnings.length || report.failures.length || report.errors.length ? 'flagged' : 'all';
      const rows = node('div'), pagination = node('div', undefined, { class: 'actions' }), previous = node('button', 'Previous cases', { type: 'button' }), next = node('button', 'Next cases', { type: 'button' });
      const pageStatus = node('p', '', { class: 'hint' }); let page = 0;
      pagination.append(previous, next);
      const renderRows = () => {
        const indexed = report.samples.map((sample, index) => ({ sample, index })).filter(({ sample }) => filter.value === 'all'
          || (filter.value === 'flagged' ? sample.issues.length > 0 : sample.issues.some(issue => issue.severity === filter.value)));
        const visible = indexed.slice(page * 10, page * 10 + 10); rows.replaceChildren();
        for (const { sample, index } of visible) {
          const row = node('article', undefined, { class: 'case-row', 'data-case-index': index });
          row.append(node('p', `Case ${index + 1} / ${sample.status}`, { class: 'case-status' }), node('p', sample.seed, { class: 'meta' }));
          for (const issue of sample.issues) row.append(node('p', `${issue.severity}: ${issue.message}`));
          const values = node('details'); values.append(node('summary', 'Recorded values'), node('pre', JSON.stringify(sample.values, null, 2))); row.append(values);
          const actions = node('div', undefined, { class: 'actions' }), preview = node('button', 'Preview case', { type: 'button' }), download = node('button', 'Save recipe', { type: 'button' });
          preview.disabled = !onPreviewCase || sample.values === null; download.disabled = sample.values === null;
          if (!onPreviewCase) preview.title = 'Connect onPreviewCase to the artwork restoration workflow';
          preview.onclick = () => { void withBusy(async () => {
            try {
              const recipe = recipeForCase(report, index);
              await onPreviewCase(recipe, { index, sample: copy(sample) });
              if (!disposed) batchStatus.textContent = `Case ${index + 1} opened. Review the restored composition in the artwork.`;
            } catch (error) { if (!disposed) batchStatus.textContent = `Could not preview case: ${error.message}`; }
          }); };
          download.onclick = () => {
            try { downloadBlob(new Blob([JSON.stringify(recipeForCase(report, index), null, 2)], { type: 'application/json' }), `${artwork.id}-case-${index + 1}.json`); }
            catch (error) { batchStatus.textContent = error.message; }
          };
          actions.append(preview, download); row.append(actions); rows.append(row);
        }
        previous.disabled = page === 0; next.disabled = (page + 1) * 10 >= indexed.length;
        pageStatus.textContent = indexed.length ? `Cases ${page * 10 + 1}–${page * 10 + visible.length} of ${indexed.length} matching this filter.` : 'No matching cases.';
      };
      filter.onchange = () => { page = 0; renderRows(); }; previous.onclick = () => { page--; renderRows(); }; next.onclick = () => { page++; renderRows(); };
      results.append(filter, rows, pageStatus, pagination, node('p', 'Preview uses the recorded seed, values, and optional context. Saved recipes include the artwork and generator version. Save the report for all cases and diagnostics.', { class: 'hint' })); renderRows();
    } catch (error) { batchStatus.textContent = error.message; }
  });
  save.onclick = () => { if (lastReport) downloadBlob(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }), `${artwork.id}-parameter-report.json`); };
  const unsubscribe = artwork.subscribe(event => {
    if (event.type !== 'state.changed') return;
    if (!dirty) refresh();
    else if (JSON.stringify(draftBase) !== JSON.stringify(artwork.parameters)) say('Parameters changed outside this panel. Reload current values before applying.');
  });
  refresh();
  return { element: panel.host, open: panel.open, close: panel.close, setPlacement: panel.setPlacement,
    getReport: () => lastReport ? copy(lastReport) : null,
    dispose() { if (disposed) return; disposed = true; unsubscribe(); panel.dispose(); }
  };
}
