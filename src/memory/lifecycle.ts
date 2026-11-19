import { readFileSync, realpathSync, statSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { monotonicFactory } from 'ulidx';
import { createAnchor } from '../anchor/hash.js';
import { SUMMARY_MAX, ULID_RE, type Anchor, type Entry, type Kind, type Provenance, type Status } from '../format/schema.js';
import { isDenied } from '../guard/deny.js';
import { findSecret } from '../guard/secrets.js';
import type { Config } from '../store/config.js';
import { OutsideRepoError, toRepoPath } from '../store/repo.js';

export const MAX_ANCHOR_BYTES = 1024 * 1024;
const CHARS_PER_TOKEN = 3.5;
// Monotonic within a process: entries created in the same millisecond still sort in creation order.
const nextId = monotonicFactory();

export class LifecycleError extends Error {
  override name = 'LifecycleError';
}

export type NewEntryInput = {
  kind: Kind;
  area: string;
  summary: string;
  body: string;
  anchors: { path: string; range: [number, number] }[];
  loadWhen: string[];
  contradicts: string[];
  provenance: Omit<Provenance, 'created'>;
  human: boolean;
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function definedOnly<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Reads an anchorable file as text, refusing denied, escaping, binary and oversized files. */
export function readAnchorable(root: string, rawPath: string, config: Config): { repoPath: string; text: string } {
  let repoPath: string;
  try {
    repoPath = toRepoPath(root, rawPath);
  } catch (e) {
    if (e instanceof OutsideRepoError) throw new LifecycleError(e.message);
    throw e;
  }
  if (isDenied(root, repoPath, config)) throw new LifecycleError(`anchor path is denied: ${repoPath}`);
  const full = join(root, repoPath);
  let stat: Stats;
  let real: string;
  try {
    stat = statSync(full);
    real = realpathSync.native(full);
  } catch {
    throw new LifecycleError(`anchor file not found: ${repoPath}`);
  }
  if (!stat.isFile()) throw new LifecycleError(`anchor is not a regular file: ${repoPath}`);
  let realRepoPath: string;
  try {
    realRepoPath = toRepoPath(realpathSync.native(root), real);
  } catch {
    throw new LifecycleError(`anchor resolves outside the repository: ${repoPath}`);
  }
  // A symlink must not reach a denied target either.
  if (realRepoPath !== repoPath && isDenied(root, realRepoPath, config)) {
    throw new LifecycleError(`anchor path is denied (link target): ${repoPath}`);
  }
  if (stat.size > MAX_ANCHOR_BYTES) throw new LifecycleError(`anchor file is larger than 1 MiB: ${repoPath}`);
  let buf: Buffer;
  try {
    buf = readFileSync(full);
  } catch (e) {
    throw new LifecycleError(`cannot read anchor file ${repoPath}: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}`);
  }
  if (buf.includes(0)) throw new LifecycleError(`anchor file looks binary: ${repoPath}`);
  return { repoPath, text: buf.toString('utf8') };
}

function makeAnchor(root: string, a: { path: string; range: [number, number] }, config: Config): Anchor {
  const { repoPath, text } = readAnchorable(root, a.path, config);
  try {
    return createAnchor(text, repoPath, a.range);
  } catch (e) {
    if (e instanceof RangeError) throw new LifecycleError(`${repoPath}: ${e.message}`);
    throw e;
  }
}

export function newEntry(root: string, input: NewEntryInput, config: Config, now: Date): Entry {
  if (input.kind === 'rule' && !input.human) throw new LifecycleError('a rule requires a human: agents may propose, not create rules');
  const summary = input.summary.trim();
  if (summary === '') throw new LifecycleError('summary is empty');
  if (summary.length > SUMMARY_MAX) throw new LifecycleError(`summary is longer than ${SUMMARY_MAX} characters`);
  if (input.area.trim() === '') throw new LifecycleError('area is empty');
  for (const id of input.contradicts) {
    if (!ULID_RE.test(id)) throw new LifecycleError(`contradicts: not a valid entry id: ${id}`);
  }
  for (const text of [summary, input.body, input.area, ...input.loadWhen]) {
    const secret = findSecret(text);
    if (secret !== null) throw new LifecycleError(`refused: text looks like a secret (${secret})`);
  }
  const anchors = input.anchors.map((a) => makeAnchor(root, a, config));

  let status: Status;
  if (input.kind === 'rule') status = 'verified';
  else if (input.kind === 'hypothesis' || anchors.length === 0) status = 'hypothesis';
  else status = 'verified';

  return {
    id: nextId(now.getTime()),
    kind: input.kind,
    status,
    area: input.area.trim(),
    summary,
    loadWhen: [...input.loadWhen],
    anchors,
    provenance: definedOnly({ created: now.toISOString(), ...input.provenance }),
    confirmations: [],
    contradicts: [...input.contradicts],
    supersedes: [],
    resolvedBy: null,
    estTokens: estimateTokens(summary + input.body),
    body: input.body,
  };
}

export function confirm(entry: Entry, by: { session?: string; author?: string }, now: Date): Entry {
  if (entry.status === 'archived' || entry.status === 'stale') {
    throw new LifecycleError(`cannot confirm a ${entry.status} entry: ${entry.id}`);
  }
  const confirmations = [...entry.confirmations, definedOnly({ at: now.toISOString(), session: by.session, author: by.author })];
  const independent = by.session !== undefined && by.session !== entry.provenance.session;
  const status: Status = entry.status === 'hypothesis' && independent ? 'verified' : entry.status;
  return { ...entry, status, confirmations };
}

const LIVE: ReadonlySet<Status> = new Set(['verified', 'hypothesis', 'disputed']);

export function markDisputed(entries: Entry[]): Entry[] {
  const live = new Map(entries.filter((e) => LIVE.has(e.status)).map((e) => [e.id, e]));
  const disputed = new Set<string>();
  for (const e of live.values()) {
    for (const other of e.contradicts) {
      if (other !== e.id && live.has(other)) {
        disputed.add(e.id);
        disputed.add(other);
      }
    }
  }
  return entries.map((e) => (disputed.has(e.id) ? { ...e, status: 'disputed' } : e));
}

export function resolve(entry: Entry, by: string): Entry {
  const ref = by.trim();
  if (ref === '') throw new LifecycleError('resolve needs a commit or entry reference');
  if (entry.resolvedBy !== null) throw new LifecycleError(`entry already resolved by ${entry.resolvedBy}: ${entry.id}`);
  return { ...entry, status: 'archived', resolvedBy: ref };
}

export function promote(entry: Entry, now: Date): Entry {
  if (entry.status === 'archived' || entry.status === 'stale') {
    throw new LifecycleError(`cannot promote a ${entry.status} entry: ${entry.id}`);
  }
  return { ...entry, status: 'verified', confirmations: [...entry.confirmations, { at: now.toISOString(), author: 'human' }] };
}

/** True when the entry has known authors and every one of them is in `trustedAuthors`. */
export function authorsTrusted(authors: readonly string[], config: Config): boolean {
  const trusted = new Set(config.trustedAuthors.map((a) => a.toLowerCase()));
  return authors.length > 0 && authors.every((a) => trusted.has(a.toLowerCase()));
}

/**
 * `authors`: everyone who changed the entry file, including the current git
 * user for uncommitted changes (see `entryAuthors`). A verified entry stays
 * verified only if they are all trusted; no known author fails closed.
 */
export function effectiveStatus(entry: Entry, authors: readonly string[], config: Config): Status {
  if (entry.status !== 'verified') return entry.status;
  return authorsTrusted(authors, config) ? 'verified' : 'hypothesis';
}
