import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BudgetError, buildIndex, type IndexFile, type IndexRow } from '../../src/compile/index-levels.js';
import type { Freshness } from '../../src/compile/model.js';
import { estimateTokens } from '../../src/memory/lifecycle.js';

const FRESHNESS: Freshness[] = ['fresh', 'unconfirmed', 'verify-before-use'];

function row(i: number, overrides: Partial<IndexRow> = {}): IndexRow {
  const name = `area-${String(i).padStart(3, '0')}`;
  return {
    label: name,
    loadWhen: [`src/${name}/**`, `test/${name}/**`],
    tokens: 200 + ((i * 37) % 900),
    summary: `Project memory for area "${name}". Use when working on src/${name}/**, test/${name}/**.`,
    freshness: FRESHNESS[i % 3] ?? 'fresh',
    target: `.agents/skills/keelson-${name}/SKILL.md`,
    ...overrides,
  };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));

const LINK = /\]\(([^)]+)\)/g;

function links(file: IndexFile): string[] {
  return [...file.content.matchAll(LINK)].map((m) => posix.normalize(posix.join(posix.dirname(file.path), m[1] ?? '')));
}

function checkTree(files: IndexFile[], budget: number, all: IndexRow[]): number {
  const byPath = new Map(files.map((f) => [f.path, f]));
  expect(files[0]?.path).toBe('.keelson/index.md');
  for (const f of files) {
    expect(f.tokens).toBeLessThanOrEqual(budget);
    expect(f.tokens).toBe(estimateTokens(f.content));
  }
  const seen = new Set<string>();
  const targets: string[] = [];
  let depth = 0;
  const walk = (path: string, level: number) => {
    const f = byPath.get(path);
    expect(f, path).toBeDefined();
    if (f === undefined || seen.has(path)) return;
    seen.add(path);
    depth = Math.max(depth, level);
    for (const l of links(f)) {
      if (l.startsWith('.keelson/index')) walk(l, level + 1);
      else targets.push(l);
    }
  };
  walk('.keelson/index.md', 1);
  expect(seen.size).toBe(files.length);
  expect([...targets].sort()).toEqual(all.map((r) => r.target).sort());
  return depth;
}

/** Pipes that separate cells: not preceded by an odd number of backslashes. */
function cellPipes(line: string): number {
  return [...line.matchAll(/(\\*)\|/g)].filter((m) => (m[1]?.length ?? 0) % 2 === 0).length;
}

describe('buildIndex', () => {
  test('a few rows fit in one root file listing every area', () => {
    const files = buildIndex(rows(5), 1500);
    expect(files.map((f) => f.path)).toEqual(['.keelson/index.md']);
    for (const r of rows(5)) expect(files[0]?.content).toContain(`[${r.label}](../${r.target})`);
    expect(files[0]?.content).toContain('| Area | Load when | Cost | Summary | Freshness |');
    expect(files[0]?.content).toContain('Costs are token estimates (chars / 3.5).');
  });

  test('300 areas stay within a 1500 token budget, each area in exactly one leaf', () => {
    const all = rows(300);
    const files = buildIndex(all, 1500);
    expect(files.length).toBeGreaterThan(1);
    expect(checkTree(files, 1500, all)).toBeGreaterThanOrEqual(2);
  });

  test('a 400 token budget nests at least three levels and still holds', () => {
    const all = rows(300);
    expect(checkTree(buildIndex(all, 400), 400, all)).toBeGreaterThanOrEqual(3);
  });

  test('output is deterministic and independent of input order', () => {
    const all = rows(120);
    const shuffled = [...all].sort((a, b) => (a.tokens % 7) - (b.tokens % 7));
    expect(buildIndex(shuffled, 600)).toEqual(buildIndex(all, 600));
  });

  test('group rows show the range, area count and worst freshness', () => {
    const files = buildIndex(rows(60), 600);
    const root = files[0]?.content ?? '';
    expect(root).toMatch(/\[area-001 … area-\d{3} \(\d+ areas\)\]\(index\/1\.md\)/);
    expect(root).toContain('verify-before-use');
  });

  test('a budget too small for any table is refused', () => {
    expect(() => buildIndex(rows(10), 50)).toThrow(BudgetError);
    expect(() => buildIndex(rows(10), 50)).toThrow(/root_index_tokens 50 is too small/);
  });

  test('pipes, backslashes, brackets and newlines keep every table row at 5 cells', () => {
    const hostile = row(1, { label: 'a]b[c|d', summary: 'x | y\nz \\| w', loadWhen: ['src/|/**', 'a\nb'] });
    const files = buildIndex([hostile, row(2)], 1500);
    const tableRows = (files[0]?.content ?? '').split('\n').filter((l) => l.startsWith('| '));
    expect(tableRows.length).toBe(3);
    for (const l of tableRows) expect(cellPipes(l)).toBe(6);
    expect(files[0]?.content).toContain('](../.agents/skills/keelson-area-001/SKILL.md)');
  });
});
