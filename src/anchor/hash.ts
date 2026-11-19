import { createHash } from 'node:crypto';
import type { Anchor } from '../format/schema.js';

export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
}

/** Lines of normalized text; a final newline does not add an empty line. */
export function splitLines(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized === '') return [];
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function hashLines(lines: readonly string[]): string {
  return 'sha256:' + createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

export function assertRange(range: [number, number], lineCount: number): void {
  const [start, end] = range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lineCount) {
    throw new RangeError(`invalid range ${start}-${end} for a file with ${lineCount} lines`);
  }
}

export function hashRange(text: string, range: [number, number]): string {
  const lines = splitLines(text);
  assertRange(range, lines.length);
  return hashLines(lines.slice(range[0] - 1, range[1]));
}

export function createAnchor(text: string, repoPath: string, range: [number, number]): Anchor {
  return { path: repoPath, range: [range[0], range[1]], hash: hashRange(text, range) };
}
