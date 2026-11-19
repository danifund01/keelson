import type { Anchor } from '../format/schema.js';
import { hashLines, splitLines } from './hash.js';

export type LocateResult = { kind: 'match' } | { kind: 'relocated'; range: [number, number] } | { kind: 'missing' };

export function locateAnchor(anchor: Anchor, text: string): LocateResult {
  const lines = splitLines(text);
  const [start, end] = anchor.range;
  const size = end - start + 1;
  if (end <= lines.length && hashLines(lines.slice(start - 1, end)) === anchor.hash) {
    return { kind: 'match' };
  }
  let found: number | null = null;
  for (let i = 0; i + size <= lines.length; i++) {
    if (hashLines(lines.slice(i, i + size)) !== anchor.hash) continue;
    if (found !== null) return { kind: 'missing' };
    found = i + 1;
  }
  return found === null ? { kind: 'missing' } : { kind: 'relocated', range: [found, found + size - 1] };
}
