import { createHash } from 'node:crypto';
import type { Entry, Kind, Status } from '../format/schema.js';
import type { Config } from '../store/config.js';

export type Freshness = 'fresh' | 'unconfirmed' | 'verify-before-use';

/** An entry with its effective status (trust applied, never persisted). */
export type ModelEntry = { entry: Entry; status: Status };

export type AreaModel = {
  area: string;
  display: string;
  slug: string;
  description: string;
  loadWhen: string[];
  freshness: Freshness;
  entries: ModelEntry[];
};

const KIND_ORDER: readonly Kind[] = ['rule', 'decision', 'finding', 'discard', 'hypothesis'];
const DESCRIPTION_MAX = 200;
const DISPLAY_MAX = 40;
const GLOB_MAX = 60;
const GLOBS_SHOWN = 3;
const SLUG_MAX = 40;

/** Code-unit order, never locale-dependent, so output is the same on every machine. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One line of plain text: no control characters, no angle brackets, at most `max` characters. */
export function cleanText(s: string, max: number): string {
  const flat = s
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

export function slugify(area: string): string {
  const slug = area
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug === '' ? 'area' : slug;
}

function isUniversal(m: ModelEntry): boolean {
  return m.entry.kind === 'rule' && m.entry.loadWhen.length === 0 && m.status === 'verified';
}

function compareEntries(a: ModelEntry, b: ModelEntry): number {
  return KIND_ORDER.indexOf(a.entry.kind) - KIND_ORDER.indexOf(b.entry.kind) || compareText(a.entry.id, b.entry.id);
}

/** Rules that apply everywhere: compiled into AGENTS.md instead of an area skill. */
export function universalRules(entries: ModelEntry[]): ModelEntry[] {
  return entries.filter(isUniversal).sort(compareEntries);
}

function freshnessOf(entries: ModelEntry[]): Freshness {
  if (entries.some((e) => e.status === 'stale' || e.status === 'disputed')) return 'verify-before-use';
  return entries.every((e) => e.status === 'verified') ? 'fresh' : 'unconfirmed';
}

/** Built only from human config or the area name and globs: agent summaries never reach always-loaded text. */
function describe(area: string, display: string, loadWhen: string[], config: Config): string {
  const configured = config.areas[area]?.description;
  if (configured !== undefined) return cleanText(configured, DESCRIPTION_MAX);
  let text = `Project memory for area "${display}".`;
  if (loadWhen.length > 0) {
    const shown = loadWhen.slice(0, GLOBS_SHOWN).map((g) => cleanText(g, GLOB_MAX));
    const more = loadWhen.length - shown.length;
    text += ` Use when working on ${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}.`;
  }
  return cleanText(text, DESCRIPTION_MAX);
}

export function buildAreas(entries: ModelEntry[], config: Config): AreaModel[] {
  const byArea = new Map<string, ModelEntry[]>();
  for (const m of entries) {
    if (m.entry.status === 'archived' || isUniversal(m)) continue;
    const list = byArea.get(m.entry.area) ?? [];
    list.push(m);
    byArea.set(m.entry.area, list);
  }
  const names = [...byArea.keys()].sort(compareText);

  const bySlug = new Map<string, number>();
  for (const name of names) bySlug.set(slugify(name), (bySlug.get(slugify(name)) ?? 0) + 1);

  return names.map((area) => {
    const list = (byArea.get(area) ?? []).sort(compareEntries);
    const base = slugify(area);
    const slug = (bySlug.get(base) ?? 0) > 1 ? `${base}-${createHash('sha256').update(area).digest('hex').slice(0, 6)}` : base;
    const loadWhen = [...new Set(list.flatMap((m) => m.entry.loadWhen))].sort(compareText);
    const display = cleanText(area, DISPLAY_MAX);
    return { area, display, slug, description: describe(area, display, loadWhen, config), loadWhen, freshness: freshnessOf(list), entries: list };
  });
}
