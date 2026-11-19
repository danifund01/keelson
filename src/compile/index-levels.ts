import { posix } from 'node:path';
import { estimateTokens } from '../memory/lifecycle.js';
import { cleanText, compareText, type Freshness } from './model.js';
import { DATA_NOTICE, GENERATED_MARK } from './render.js';

export type IndexRow = { label: string; loadWhen: string[]; tokens: number; summary: string; freshness: Freshness; target: string };
export type IndexFile = { path: string; content: string; tokens: number };

export class BudgetError extends Error {
  override name = 'BudgetError';
}

export const ROOT_INDEX = '.keelson/index.md';
const LEVEL_DIR = '.keelson/index';
const LABEL_MAX = 80;
const GLOB_MAX = 60;
const GLOBS_SHOWN = 3;
const SUMMARY_MAX = 120;
const PLACEHOLDER_TOKENS = 99999;

const HEADER = [
  GENERATED_MARK,
  '# Project memory index',
  '',
  DATA_NOTICE,
  '',
  'Costs are token estimates (chars / 3.5).',
  '',
  '| Area | Load when | Cost | Summary | Freshness |',
  '|---|---|---|---|---|',
].join('\n');

const WORST: readonly Freshness[] = ['fresh', 'unconfirmed', 'verify-before-use'];

/** A row plus the leaf areas it covers, for group labels. */
type Node = IndexRow & { first: string; last: string; areas: number };

/** Markdown-table safe: one line, backslashes doubled so an escaped pipe stays escaped. */
function cell(s: string, max: number): string {
  const text = cleanText(s, max).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  return text === '' ? '-' : text;
}

function renderRow(file: string, n: Node): string {
  const label = cell(n.label, LABEL_MAX).replace(/[[\]]/g, (c) => `\\${c}`);
  const link = posix.relative(posix.dirname(file), n.target);
  const shown = n.loadWhen.slice(0, GLOBS_SHOWN).map((g) => cleanText(g, GLOB_MAX));
  const more = n.loadWhen.length - shown.length;
  const globs = shown.length === 0 ? '-' : cell(shown.join(', ') + (more > 0 ? ` +${more}` : ''), GLOBS_SHOWN * (GLOB_MAX + 2) + 8);
  return `| [${label}](${link}) | ${globs} | ~${n.tokens} | ${cell(n.summary, SUMMARY_MAX)} | ${n.freshness} |`;
}

function render(path: string, nodes: Node[]): IndexFile {
  const content = [HEADER, ...nodes.map((n) => renderRow(path, n))].join('\n') + '\n';
  return { path, content, tokens: estimateTokens(content) };
}

function childPath(id: string, i: number): { id: string; path: string } {
  const child = id === '' ? String(i) : `${id}-${i}`;
  return { id: child, path: `${LEVEL_DIR}/${child}.md` };
}

/** Contiguous chunks whose sizes differ by at most one, larger first. */
function split<T>(items: T[], k: number): T[][] {
  const base = Math.floor(items.length / k);
  const extra = items.length % k;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

function groupNode(chunk: Node[], target: string, tokens: number): Node {
  const first = chunk[0]?.first ?? '';
  const last = chunk[chunk.length - 1]?.last ?? '';
  const areas = chunk.reduce((s, n) => s + n.areas, 0);
  const worst = chunk.reduce((w, n) => (WORST.indexOf(n.freshness) > WORST.indexOf(w) ? n.freshness : w), 'fresh' as Freshness);
  return {
    label: `${first} … ${last} (${areas} areas)`,
    loadWhen: [...new Set(chunk.flatMap((n) => n.loadWhen))].sort(compareText),
    tokens,
    summary: '',
    freshness: worst,
    target,
    first,
    last,
    areas,
  };
}

function build(nodes: Node[], id: string, path: string, budget: number): IndexFile[] {
  const flat = render(path, nodes);
  if (flat.tokens <= budget) return [flat];

  // Widest fan-out whose group table still fits, measured with the widest possible cost cell.
  let k = 0;
  for (let c = 2; c < nodes.length; c++) {
    const trial = split(nodes, c).map((chunk, i) => groupNode(chunk, childPath(id, i + 1).path, PLACEHOLDER_TOKENS));
    if (render(path, trial).tokens > budget) break;
    k = c;
  }
  if (k === 0) {
    const pair = split(nodes, 2).map((chunk, i) => groupNode(chunk, childPath(id, i + 1).path, PLACEHOLDER_TOKENS));
    const minimum = Math.max(render(path, pair).tokens, estimateTokens(HEADER + '\n'));
    throw new BudgetError(`root_index_tokens ${budget} is too small; minimum is ${minimum}`);
  }

  const files: IndexFile[] = [];
  const groups = split(nodes, k).map((chunk, i) => {
    const child = childPath(id, i + 1);
    const sub = build(chunk, child.id, child.path, budget);
    files.push(...sub);
    return groupNode(chunk, child.path, sub[0]?.tokens ?? 0);
  });
  return [render(path, groups), ...files];
}

/**
 * Root index at `.keelson/index.md`, nested levels under `.keelson/index/`
 * until every file fits `budget` estimated tokens. Root first.
 */
export function buildIndex(rows: IndexRow[], budget: number): IndexFile[] {
  const nodes: Node[] = [...rows]
    .sort((a, b) => compareText(a.label, b.label) || compareText(a.target, b.target))
    .map((r) => ({ ...r, first: cleanText(r.label, 40), last: cleanText(r.label, 40), areas: 1 }));
  return build(nodes, '', ROOT_INDEX, budget);
}
