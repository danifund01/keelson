import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { createAnchor, hashRange, normalizeText } from '../../src/anchor/hash.js';

const sha = (s: string) => 'sha256:' + createHash('sha256').update(s, 'utf8').digest('hex');

describe('hash', () => {
  test('same content with CRLF, LF and BOM hashes equal', () => {
    const lf = 'a\nb\nc\n';
    const crlf = 'a\r\nb\r\nc\r\n';
    const bom = '﻿a\nb\nc\n';
    const cr = 'a\rb\rc\r';
    expect(hashRange(crlf, [1, 3])).toBe(hashRange(lf, [1, 3]));
    expect(hashRange(bom, [1, 3])).toBe(hashRange(lf, [1, 3]));
    expect(hashRange(cr, [1, 3])).toBe(hashRange(lf, [1, 3]));
  });

  test('hash is sha256 of the selected lines joined by LF (independent oracle)', () => {
    expect(hashRange('x\ny\nz\n', [2, 3])).toBe(sha('y\nz'));
    expect(hashRange('only', [1, 1])).toBe(sha('only'));
  });

  test('trailing whitespace does not change hash; inner whitespace does', () => {
    expect(hashRange('a  \nb\t\n', [1, 2])).toBe(hashRange('a\nb\n', [1, 2]));
    expect(hashRange('a b\n', [1, 1])).not.toBe(hashRange('ab\n', [1, 1]));
    expect(hashRange('  a\n', [1, 1])).not.toBe(hashRange('a\n', [1, 1]));
  });

  test('hashRange throws for [0,1], [3,2] and end beyond last line', () => {
    const text = 'a\nb\nc\n';
    expect(() => hashRange(text, [0, 1])).toThrow(RangeError);
    expect(() => hashRange(text, [3, 2])).toThrow(RangeError);
    expect(() => hashRange(text, [1, 4])).toThrow(RangeError);
    expect(() => hashRange(text, [1.5, 2])).toThrow(RangeError);
    expect(() => hashRange(text, [1, 3])).not.toThrow();
  });

  test('final newline does not count as an extra line; a file without one has the same lines', () => {
    expect(hashRange('a\nb', [1, 2])).toBe(hashRange('a\nb\n', [1, 2]));
    expect(() => hashRange('a\nb\n', [3, 3])).toThrow(RangeError);
  });

  test('normalizeText strips BOM, converts line endings and trailing spaces', () => {
    expect(normalizeText('﻿a \r\nb\t\rc')).toBe('a\nb\nc');
  });

  test('createAnchor records path, range and hash', () => {
    expect(createAnchor('a\nb\n', 'src/a.ts', [2, 2])).toEqual({ path: 'src/a.ts', range: [2, 2], hash: sha('b') });
  });
});
