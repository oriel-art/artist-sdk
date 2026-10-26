import { requireValue, copy } from './errors.js';
import { validateParameters } from './parameters.js';
import { testParameters, parameterCases } from './testing.js';
import { downloadBlob } from './browser.js';
import { createPanel, element } from './panel.js';

/** Studio-only tools. Explicitly import them; they never mount with the core SDK. */
export function createParameterPanel({ artwork, onChange = () => {}, check, mount } = {}) {
  requireValue(artwork?.mode === 'studio', 'Parameter tools are available only in studio mode', 'FORBIDDEN');
  requireValue(typeof onChange === 'function' && (check === undefined || typeof check === 'function'), 'Invalid parameter panel callback');
  const definitions = artwork.manifest().parameters, initial = { ...artwork.parameters };
  const cases = parameterCases(definitions, { seed: artwork.seed, values: initial });
  const panel = createPanel({ mount, title: 'Parameter lab', eyebrow: 'Artist tools / studio only', modal: false });
  const { doc, body } = panel;
  const node = (tag, text, attrs) => element(doc, tag, text, attrs);
  let disposed = false, busy = false, dirty = false, draftBase, lastReport = null;
  const controls = new Map();
  const form = node('form'), fields = node('div', undefined, { class: 'fields' });
  const notice = node('p', '', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = message => { notice.textContent = message; };
  form.append(node('h2', 'Try a variation'), node('p', 'Edit values, then apply them to the running artwork. The seed stays unchanged.', { class: 'hint' }), fields);
  for (const [id, d] of Object.entries(definitions)) {
    const fieldId = `parameter-${controls.size}`;
    const label = node('label', d.label ?? id, { for: fieldId }), input = node(d.type === 'choice' ? 'select' : 'input', undefined, { 'data-parameter': id, id: fieldId });
    if (d.type === 'choice') d.choices.forEach((value, index) => {
      const ambiguous = d.choices.some(other => other !== value && String(other) === String(value));
      input.append(node('option', ambiguous ? `${value} (${typeof value})` : String(value), { value: String(index) }));
    });
    else if (d.type === 'boolean') input.type = 'checkbox';
    else { input.type = 'number'; input.min = d.min; input.max = d.max; input.step = d.type === 'integer' ? '1' : 'any'; input.required = true; }
    const field = node('div'); field.append(label, input); fields.append(field); controls.set(id, input);
    if (d.type === 'number' || d.type === 'integer') field.append(node('span', `Range: ${d.min} to ${d.max}`, { class: 'hint' }));
    input.addEventListener('input', () => { dirty = true; });
    input.addEventListener('change', () => { dirty = true; });
  }
  const refresh = () => {
    draftBase = { ...artwork.parameters }; dirty = false;
    for (const [id, input] of controls) {
      const d = definitions[id], value = draftBase[id];
      if (d.type === 'boolean') input.checked = value;
      else input.value = d.type === 'choice' ? String(d.choices.indexOf(value)) : String(value);
    }
  };
  const read = () => Object.fromEntries([...controls].map(([id, input]) => {
    const d = definitions[id];
    return [id, d.type === 'boolean' ? input.checked : d.type === 'choice' ? d.choices[Number(input.value)] : input.valueAsNumber];
  }));
  const apply = node('button', 'Apply values', { type: 'submit', class: 'primary' });
  const reload = node('button', 'Reload current values', { type: 'button' });
  const reset = node('button', 'Restore starting values', { type: 'button' });
  const actions = node('div', undefined, { class: 'actions' }); actions.append(apply, reload, reset); form.append(actions);
  const commit = async values => {
    if (busy || disposed) return;
    busy = true;
    for (const control of [...controls.values(), apply, reload, reset]) control.disabled = true;
    let applied = false;
    try {
      const state = artwork.setParameters(values); applied = true; refresh();
      await onChange(state);
      if (!disposed) say('Values applied. The artwork seed is unchanged.');
    } catch (error) { if (!disposed) say(`${applied ? 'Values applied, but redraw failed' : 'Could not apply values'}: ${error.message}`); }
    finally { busy = false; for (const control of [...controls.values(), apply, reload, reset]) control.disabled = false; }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (JSON.stringify(draftBase) !== JSON.stringify(artwork.parameters)) { say('Parameters changed outside this panel. Reload current values before applying.'); return; }
    try { const values = validateParameters(definitions, read()); void commit(values); } catch (error) { say(error.message); }
  });
  reload.onclick = () => { refresh(); say('Current artwork values loaded.'); };
  reset.onclick = () => { void commit(initial); };
  const caseLabel = node('label', 'Boundary case', { for: 'boundary-case' }), caseSelect = node('select', undefined, { id: 'boundary-case' });
  cases.forEach((c, i) => caseSelect.append(node('option', c.name, { value: String(i) })));
  const load = node('button', 'Load case into fields', { type: 'button' });
  load.onclick = () => {
    if (busy) return;
    refresh(); const values = cases[Number(caseSelect.value)].values;
    for (const [id, input] of controls) {
      const d = definitions[id];
      if (d.type === 'boolean') input.checked = values[id];
      else input.value = d.type === 'choice' ? String(d.choices.indexOf(values[id])) : String(values[id]);
    }
    dirty = true; say('Boundary case loaded. Apply values to preview it.');
  };
  form.append(caseLabel, caseSelect, node('div', undefined, { class: 'actions' })); form.lastChild.append(load);
  form.append(node('p', 'Cases vary one parameter at a time from the starting values; they do not test every combination.', { class: 'hint' }), notice);
  const live = node('section'); live.append(form); body.append(live);

  const batch = node('section'), batchForm = node('form'), batchFields = node('div', undefined, { class: 'fields' });
  batch.append(node('h2', 'Check a run of seeds'), node('p', 'Sampling uses schema defaults and distributions. It does not render or change the live artwork.', { class: 'hint' }));
  const prefixLabel = node('label', 'Seed prefix'), prefix = node('input', undefined, { type: 'text', value: 'parameter-test', required: '', maxlength: '4000' });
  const countLabel = node('label', 'Sample count'), count = node('input', undefined, { type: 'number', value: '100', min: '1', max: '1000', step: '1', required: '' });
  prefixLabel.append(prefix); countLabel.append(count); batchFields.append(prefixLabel, countLabel);
  const run = node('button', 'Run parameter checks', { type: 'submit', class: 'primary' });
  const save = node('button', 'Save report', { type: 'button', disabled: '' });
  const batchActions = node('div', undefined, { class: 'actions' }); batchActions.append(run, save);
  const results = node('div'), batchStatus = node('p', '', { class: 'status', role: 'status', 'aria-live': 'polite' });
  batchForm.append(batchFields, batchActions); batch.append(batchForm, batchStatus, results); body.append(batch);
  batchForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      requireValue(count.valueAsNumber <= 1000, 'The panel supports up to 1000 samples');
      const report = testParameters(definitions, { prefix: prefix.value, count: count.valueAsNumber, check });
      report.artwork = { id: artwork.id, version: artwork.version };
      lastReport = report; save.disabled = false;
      batchStatus.textContent = `${report.count} seeds sampled. ${report.checked ? `${report.failures.length} failed artist checks.` : 'No artist checks registered.'}`;
      results.replaceChildren();
      const wrap = node('div', undefined, { class: 'table-wrap' }), table = node('table'), head = node('thead'), row = node('tr');
      row.append(node('th', 'Parameter'), node('th', 'Observed values')); head.append(row); table.append(head);
      const tbody = node('tbody');
      for (const [id, summary] of Object.entries(report.summary)) {
        const row = node('tr');
        const text = summary.counts ? summary.counts.map(c => `${JSON.stringify(c.value)}: ${c.count}`).join(' · ')
          : `${summary.min.toPrecision(4)} – ${summary.max.toPrecision(4)} / mean ${summary.mean.toPrecision(4)}`;
        row.append(node('td', definitions[id].label ?? id), node('td', text)); tbody.append(row);
      }
      table.append(tbody); wrap.append(table); results.append(wrap);
      const details = node('details'); details.append(node('summary', 'Inspect seeds and failures'), node('pre', JSON.stringify({ failures: report.failures.slice(0, 10), samples: report.samples.slice(0, 10) }, null, 2)));
      results.append(details, node('p', 'Preview shows up to 10 failures and samples. Save the report for all values and histogram bins. Counts describe this sample, not guaranteed edition rarity.', { class: 'hint' }));
    } catch (error) { batchStatus.textContent = error.message; }
  });
  save.onclick = () => { if (lastReport) downloadBlob(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }), `${artwork.id}-parameter-report.json`); };
  const unsubscribe = artwork.subscribe(event => {
    if (event.type !== 'state.changed') return;
    if (!dirty) refresh();
    else if (JSON.stringify(draftBase) !== JSON.stringify(artwork.parameters)) say('Parameters changed outside this panel. Reload current values before applying.');
  });
  refresh();
  return { element: panel.host, open: panel.open, close: panel.close,
    getReport: () => lastReport ? copy(lastReport) : null,
    dispose() { if (disposed) return; disposed = true; unsubscribe(); panel.dispose(); }
  };
}
