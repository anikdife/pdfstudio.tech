const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/scanBrackets.cjs <path>');
  process.exit(2);
}

const src = fs.readFileSync(file, 'utf8');

let line = 1;
let col = 0;
let state = 'normal'; // normal | sq | dq | tpl | linec | blockc

const stack = []; // { ch, line, col }

function push(ch) {
  stack.push({ ch, line, col });
}

function pop(expected) {
  const last = stack[stack.length - 1];
  if (!last) return { ok: false, last: null };
  const pairs = { ')': '(', ']': '[', '}': '{' };
  if (last.ch !== pairs[expected]) return { ok: false, last };
  stack.pop();
  return { ok: true, last };
}

for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  const next = src[i + 1];

  if (ch === '\n') {
    line++;
    col = 0;
  } else {
    col++;
  }

  if (state === 'linec') {
    if (ch === '\n') state = 'normal';
    continue;
  }
  if (state === 'blockc') {
    if (ch === '*' && next === '/') {
      state = 'normal';
      i++;
      col++;
    }
    continue;
  }
  if (state === 'sq') {
    if (ch === '\\') {
      i++;
      col++;
      continue;
    }
    if (ch === "'") state = 'normal';
    continue;
  }
  if (state === 'dq') {
    if (ch === '\\') {
      i++;
      col++;
      continue;
    }
    if (ch === '"') state = 'normal';
    continue;
  }
  if (state === 'tpl') {
    if (ch === '\\') {
      i++;
      col++;
      continue;
    }
    // NOTE: this does NOT fully understand ${...} nesting; it's still good enough to find gross mismatches.
    if (ch === '`') state = 'normal';
    continue;
  }

  // normal
  if (ch === '/' && next === '/') {
    state = 'linec';
    i++;
    col++;
    continue;
  }
  if (ch === '/' && next === '*') {
    state = 'blockc';
    i++;
    col++;
    continue;
  }
  if (ch === "'") {
    state = 'sq';
    continue;
  }
  if (ch === '"') {
    state = 'dq';
    continue;
  }
  if (ch === '`') {
    state = 'tpl';
    continue;
  }

  if (ch === '(' || ch === '[' || ch === '{') push(ch);
  if (ch === ')' || ch === ']' || ch === '}') {
    const res = pop(ch);
    if (!res.ok) {
      console.log('MISMATCH at', { line, col, found: ch, expectedTop: res.last?.ch, expectedTopAt: res.last ? { line: res.last.line, col: res.last.col } : null });
      process.exit(1);
    }
  }
}

if (stack.length) {
  console.log('UNCLOSED tokens:', stack.slice(-20));
  process.exit(1);
}

console.log('OK: all (), [], {} appear balanced (ignoring template ${} nesting).');
