import { requireValue } from './errors.js';

export function valueLabel(definition, value) {
  if (definition.type !== 'choice') return String(value);
  const index = definition.choices.indexOf(value);
  const text = definition.ui?.choiceLabels?.[index] ?? String(value);
  return definition.choices.some(other => other !== value && String(other) === String(value))
    ? `${text} (${typeof value})` : String(text);
}

export function swatchNode(node, definition, value) {
  const colors = definition.type === 'choice' ? definition.ui?.swatches?.[definition.choices.indexOf(value)] : undefined;
  if (colors === undefined) return null;
  requireValue(Array.isArray(colors), 'Swatches require arrays of #RGB or #RRGGBB colors');
  const chips = node('span', undefined, { class: 'color-chips', 'aria-hidden': 'true' });
  for (const color of colors) {
    requireValue(typeof color === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color), 'Swatches require #RGB or #RRGGBB colors');
    const chip = node('span', undefined, { class: 'color-chip' }); chip.style.backgroundColor = color; chips.append(chip);
  }
  return colors.length ? chips : null;
}
