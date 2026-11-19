import { createHash } from 'node:crypto';
import type { Entry, Kind, Status } from '../format/schema.js';
import type { Config } from '../store/config.js';

export type Freshness = 'fresh' | 'unconfirmed' | 'verify-before-use';

/**
 * An entry with its effective status (trust applied, never persisted) and
 * whether every author of its file is trusted. Only trusted entries may
 * supply text that agents load in every session (area names, globs).
 */
export type ModelEntry = { entry: Entry; status: Status; trusted: boolean };

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
  // Count and cut by code point: splitting a surrogate pair would write U+FFFD and never compare equal again.
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, max - 1).join('').trimEnd() + '…';
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

/**
 * Built only from human config, or from the area name and globs of entries by
 * trusted authors: agent summaries and untrusted text never reach always-loaded text.
 */
function describe(area: string, display: string, loadWhen: string[], nameTrusted: boolean, config: Config): string {
  const configured = config.areas[area]?.description;
  if (configured !== undefined) return cleanText(configured, DESCRIPTION_MAX);
  if (!nameTrusted) {
    return `Unverified project memory (area ${display}) from authors outside trusted_authors. Check against the code before use.`;
  }
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
  const hash6 = (area: string) => createHash('sha256').update(area).digest('hex').slice(0, 6);
  const areas = [...byArea.keys()].sort(compareText).map((area) => {
    const list = (byArea.get(area) ?? []).sort(compareEntries);
    const trusted = list.filter((m) => m.trusted);
    // A name is shown only if a trusted author used it or a person configured it.
    const nameTrusted = trusted.length > 0 || config.areas[area] !== undefined;
    const base = nameTrusted ? slugify(area) : `unverified-${hash6(area)}`;
    const display = nameTrusted ? cleanText(area, DISPLAY_MAX) : base;
    const loadWhen = [...new Set(trusted.flatMap((m) => m.entry.loadWhen))].sort(compareText);
    return { area, base, display, nameTrusted, loadWhen, list };
  });

  const bySlug = new Map<string, number>();
  for (const a of areas) bySlug.set(a.base, (bySlug.get(a.base) ?? 0) + 1);

  return areas.map(({ area, base, display, nameTrusted, loadWhen, list }) => ({
    area,
    display,
    slug: (bySlug.get(base) ?? 0) > 1 ? `${base}-${hash6(area)}` : base,
    description: describe(area, display, loadWhen, nameTrusted, config),
    loadWhen,
    freshness: freshnessOf(list),
    entries: list,
  }));
}
