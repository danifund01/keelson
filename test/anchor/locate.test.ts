import { describe, expect, test } from 'vitest';
import { createAnchor } from '../../src/anchor/hash.js';
import { locateAnchor } from '../../src/anchor/locate.js';

const original = ['import x', 'function f() {', '  return 1;', '}', 'export { f }'].join('\n') + '\n';
const anchor = createAnchor(original, 'src/f.ts', [2, 4]);

describe('locateAnchor', () => {
  test('match when range content unchanged', () => {
    expect(locateAnchor(anchor, original)).toEqual({ kind: 'match' });
    expect(locateAnchor(anchor, original.replace(/\n/g, '\r\n'))).toEqual({ kind: 'match' });
  });

  test('relocated when 3 lines inserted above', () => {
    const shifted = 'a\nb\nc\n' + original;
    expect(locateAnchor(anchor, shifted)).toEqual({ kind: 'relocated', range: [5, 7] });
  });

  test('relocated when lines removed above', () => {
    const shifted = original.split('\n').slice(1).join('\n');
    expect(locateAnchor(anchor, shifted)).toEqual({ kind: 'relocated', range: [1, 3] });
  });

  test('missing when anchored lines edited', () => {
    expect(locateAnchor(anchor, original.replace('return 1', 'return 2'))).toEqual({ kind: 'missing' });
  });

  test('missing when content appears twice after shift (ambiguous)', () => {
    const block = 'function f() {\n  return 1;\n}\n';
    const twice = 'x\ny\n' + block + 'z\n' + block;
    expect(locateAnchor(anchor, twice)).toEqual({ kind: 'missing' });
  });

  test('match wins even if the content also appears elsewhere', () => {
    const extra = original + 'function f() {\n  return 1;\n}\n';
    expect(locateAnchor(anchor, extra)).toEqual({ kind: 'match' });
  });

  test('missing when file shorter than range', () => {
    expect(locateAnchor(anchor, 'import x\n')).toEqual({ kind: 'missing' });
    expect(locateAnchor(anchor, '')).toEqual({ kind: 'missing' });
  });
});
