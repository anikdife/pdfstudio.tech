import type { ListType } from '../state/types';

function toAlpha(n: number, upper: boolean) {
  // 1 -> A, 26 -> Z, 27 -> AA
  let x = Math.max(1, Math.floor(n));
  let s = '';
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return upper ? s : s.toLowerCase();
}

function toRoman(n: number) {
  // Supports 1..3999; clamps out-of-range values.
  let x = Math.max(1, Math.min(3999, Math.floor(n)));
  const parts: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let out = '';
  for (const [value, sym] of parts) {
    while (x >= value) {
      out += sym;
      x -= value;
    }
  }
  return out;
}

export function isOrderedListType(listType: ListType) {
  return (
    listType === 'number' ||
    listType === 'upper-alpha' ||
    listType === 'lower-alpha' ||
    listType === 'upper-roman' ||
    listType === 'lower-roman'
  );
}

export function formatListMarker(params: {
  listType: ListType;
  index: number;
  startNumber: number;
  checked?: boolean;
  mode: 'ui' | 'export' | 'thumbnail';
}) {
  const idx = Math.max(0, Math.floor(params.index));
  const n = Math.max(1, Math.floor(params.startNumber)) + idx;

  switch (params.listType) {
    case 'number':
      return `${n}.`;
    case 'upper-alpha':
      return `${toAlpha(n, true)}.`;
    case 'lower-alpha':
      return `${toAlpha(n, false)}.`;
    case 'upper-roman':
      return `${toRoman(n)}.`;
    case 'lower-roman':
      return `${toRoman(n).toLowerCase()}.`;

    case 'checkbox':
      if (params.mode === 'export') return params.checked ? '[x]' : '[ ]';
      return params.checked ? '☑' : '☐';

    case 'filled-circle':
      return '●';

    case 'hollow-circle':
      return '○';

    case 'circle':
      return '◦';
    case 'square':
      return '▪';
    case 'dash':
      return '–';

    case 'bullet':
    default:
      return '•';
  }
}
