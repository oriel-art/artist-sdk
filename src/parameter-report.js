import { copy } from './errors.js';
import { recipeForCase } from './testing.js';
import { downloadBlob } from './browser.js';
import { valueLabel, swatchNode } from './parameter-display.js';

const readableKey = key => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
const contextValue = value => typeof value === 'object' ? JSON.stringify(value) : String(value);

/** Presentation only: sorting/filtering never edits the recorded report or recipes. */
export function createReportView({ node, report, contextLabels, onPreviewCase, runAction, message }) {
  const { definitions } = report;
  const summary = node('aside', undefined, { class: 'report-summary', 'aria-label': 'Report summary' });
  summary.append(node('p', `${report.count} seeds sampled · ${report.resolved} resolved`, { class: 'report-total' }),
    node('p', `${report.counts.warning} warnings; ${report.counts.failure} failed artist checks; ${report.counts.error} execution errors.`, { class: 'report-diagnostics' }),
    node('p', report.checked ? `${report.counts.pass} passed artist checks · ${report.counts.unchecked} unchecked.` : 'No artist checks registered; resolved cases are unchecked.', { class: 'hint' }));
  const generator = report.generator;
  summary.append(node('p', `${generator.kind === 'artist' ? 'Artist resolver' : 'SDK exploration'}: ${generator.id} / ${generator.version}. Editor overrides excluded.`, { class: 'hint' }));
  const comparison = report.context ? Object.entries(report.context.data).map(([key, value]) => `${Object.hasOwn(contextLabels, key) ? contextLabels[key] : readableKey(key)}: ${contextValue(value)}`).join(' · ') : 'No comparison context captured';
  const metadata = node('details'); metadata.append(node('summary', `Recorded comparison — ${comparison}`));
  const source = report.source.kind === 'explicit' ? `Exact seeds${report.source.label ? ` — ${report.source.label}` : ''}` : `Generated prefix — ${report.source.prefix}`;
  metadata.append(node('p', `Seed source: ${source}`, { class: 'hint' }));
  if (report.context) metadata.append(node('p', `Context schema: ${report.context.id} / ${report.context.version}. Values are from this report, not current playback.`, { class: 'hint' }));
  summary.append(metadata);

  const content = node('div', undefined, { class: 'report-content' });
  content.append(node('h2', 'Observed parameters'), node('p', `Percentages use ${report.resolved} resolved cases, including flagged cases. Resolution errors are excluded. Counts describe this sample, not edition rarity.`, { class: 'hint' }));
  for (const [id, stats] of Object.entries(report.summary)) {
    const definition = definitions[id], label = definition.label ?? id;
    const section = node('section', undefined, { class: 'distribution', 'data-parameter': id });
    section.append(node('h3', label));
    if (!stats.counts) {
      section.append(node('p', stats.min === null ? 'No resolved values.' : `Minimum ${stats.min.toPrecision(4)} · Maximum ${stats.max.toPrecision(4)} · Mean ${stats.mean.toPrecision(4)}`, { class: 'numeric-summary' }));
      content.append(section); continue;
    }
    const hideLabel = node('label', 'Hide zero counts', { class: 'check-label' });
    const hide = node('input', undefined, { type: 'checkbox', 'aria-label': `Hide zero counts for ${label}` }); hide.checked = true; hideLabel.prepend(hide);
    const table = node('table', undefined, { 'aria-label': `${label} counts` }), head = node('thead'), headers = node('tr');
    const nameHeader = node('th', undefined, { scope: 'col' }), countHeader = node('th', undefined, { scope: 'col' });
    const nameSort = node('button', 'Value', { type: 'button', 'aria-label': `Sort ${label} by value` });
    const countSort = node('button', 'Count', { type: 'button', 'aria-label': `Sort ${label} by count` });
    nameHeader.append(nameSort); countHeader.append(countSort); headers.append(nameHeader, countHeader, node('th', 'Share', { scope: 'col' })); head.append(headers);
    const body = node('tbody'), empty = node('p', '', { class: 'hint' }); table.append(head, body);
    let key = 'count', direction = -1;
    const draw = () => {
      const rows = stats.counts.map((entry, index) => ({ ...entry, index, label: valueLabel(definition, entry.value) }))
        .filter(entry => !hide.checked || entry.count !== 0)
        .sort((a, b) => direction * (key === 'count' ? a.count - b.count : a.label.localeCompare(b.label, undefined, { numeric: true })) || a.index - b.index);
      nameHeader.setAttribute('aria-sort', key === 'value' ? direction === 1 ? 'ascending' : 'descending' : 'none');
      countHeader.setAttribute('aria-sort', key === 'count' ? direction === 1 ? 'ascending' : 'descending' : 'none');
      nameSort.textContent = `Value${key === 'value' ? direction === 1 ? ' ↑' : ' ↓' : ''}`;
      countSort.textContent = `Count${key === 'count' ? direction === 1 ? ' ↑' : ' ↓' : ''}`;
      body.replaceChildren();
      for (const entry of rows) {
        const row = node('tr'), name = node('td'); name.append(node('span', entry.label));
        const colors = swatchNode(node, definition, entry.value); if (colors) name.append(colors);
        row.append(name, node('td', String(entry.count), { class: 'count-value' }), node('td', report.resolved ? `${(entry.count / report.resolved * 100).toFixed(1)}%` : '—', { class: 'count-share' })); body.append(row);
      }
      empty.textContent = report.resolved === 0 ? 'No resolved cases; percentages are unavailable.' : rows.length ? '' : 'No categories match this view.';
    };
    const sort = next => { direction = key === next ? -direction : next === 'count' ? -1 : 1; key = next; draw(); };
    nameSort.onclick = () => sort('value'); countSort.onclick = () => sort('count'); hide.onchange = draw;
    const wrap = node('div', undefined, { class: 'table-wrap' }); wrap.append(table);
    section.append(hideLabel, wrap, empty); content.append(section); draw();
  }

  const cases = node('section'); cases.append(node('h2', 'Review cases'));
  const filter = node('select', undefined, { 'aria-label': 'Filter cases' });
  for (const [value, text] of [['all', 'All cases'], ['flagged', 'Warnings, failures & errors'], ['warning', 'Warnings'], ['failure', 'Failures'], ['error', 'Execution errors']]) filter.append(node('option', text, { value }));
  filter.value = report.warnings.length || report.failures.length || report.errors.length ? 'flagged' : 'all';
  const rows = node('div'), pagination = node('div', undefined, { class: 'actions' });
  const previous = node('button', 'Previous cases', { type: 'button' }), next = node('button', 'Next cases', { type: 'button' });
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
      if (sample.values) {
        const values = node('dl', undefined, { class: 'case-values' });
        for (const [id, value] of Object.entries(sample.values)) {
          const definition = definitions[id], detail = node('dd'); detail.append(node('span', valueLabel(definition, value)));
          const colors = swatchNode(node, definition, value); if (colors) detail.append(colors);
          values.append(node('dt', definition.label ?? id), detail);
        }
        row.append(values);
      } else row.append(node('p', 'No resolved parameter values.', { class: 'hint' }));
      const raw = node('details'); raw.append(node('summary', 'Raw JSON'), node('pre', JSON.stringify(sample.values, null, 2))); row.append(raw);
      const actions = node('div', undefined, { class: 'actions' }), preview = node('button', 'Preview case', { type: 'button' }), download = node('button', 'Save recipe', { type: 'button' });
      preview.disabled = !onPreviewCase || sample.values === null; download.disabled = sample.values === null;
      if (!onPreviewCase) preview.title = 'Connect onPreviewCase to the artwork restoration workflow';
      preview.onclick = () => { void runAction(async () => {
        try {
          await onPreviewCase(recipeForCase(report, index), { index, sample: copy(sample) });
          message(`Case ${index + 1} opened. Review the restored composition in the artwork.`);
        } catch (error) { message(`Could not preview case: ${error.message}`); }
      }); };
      download.onclick = () => {
        try {
          downloadBlob(new Blob([JSON.stringify(recipeForCase(report, index), null, 2)], { type: 'application/json' }), `${report.artwork.id}-case-${index + 1}.json`);
          message(`Recipe download started for case ${index + 1}.`);
        } catch (error) { message(error.message); }
      };
      actions.append(preview, download); row.append(actions); rows.append(row);
    }
    previous.disabled = page === 0; next.disabled = (page + 1) * 10 >= indexed.length;
    pageStatus.textContent = indexed.length ? `Cases ${page * 10 + 1}–${page * 10 + visible.length} of ${indexed.length} matching this filter.` : 'No matching cases.';
  };
  filter.onchange = () => { page = 0; renderRows(); }; previous.onclick = () => { page--; renderRows(); }; next.onclick = () => { page++; renderRows(); };
  cases.append(filter, rows, pageStatus, pagination, node('p', 'Preview and recipes use the recorded seed, values and comparison context. Save the report for all cases and diagnostics.', { class: 'hint' }));
  content.append(cases); renderRows();
  return { summary, content };
}
