import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { locateAnchor } from '../anchor/locate.js';
import type { Anchor, Entry, Status } from '../format/schema.js';
import { loadConfig, type Config } from '../store/config.js';
import { listEntries, updateEntry } from '../store/store.js';
import { LifecycleError, readAnchorable } from './lifecycle.js';

export type VerifyReason = 'ok' | 'relocated' | 'stale' | 'archived-file-deleted';
export type VerifyResult = { entry: Entry; changed: boolean; reason: VerifyReason };

type AnchorCheck = { kind: 'deleted' } | { kind: 'missing' } | { kind: 'relocated'; anchor: Anchor } | { kind: 'match' };

const SEVERITY: Record<AnchorCheck['kind'], number> = { deleted: 3, missing: 2, relocated: 1, match: 0 };

function checkAnchor(root: string, anchor: Anchor, config: Config): AnchorCheck {
  if (!existsSync(join(root, anchor.path))) return { kind: 'deleted' };
  let text: string;
  try {
    text = readAnchorable(root, anchor.path, config).text;
  } catch (e) {
    // Now denied, binary, oversized or escaping: never read it, treat the evidence as gone.
    if (e instanceof LifecycleError) return { kind: 'missing' };
    throw e;
  }
  const found = locateAnchor(anchor, text);
  if (found.kind === 'relocated') return { kind: 'relocated', anchor: { ...anchor, range: found.range } };
  return found;
}

export function verifyEntry(root: string, entry: Entry, config: Config = loadConfig(root)): VerifyResult {
  if (entry.status === 'archived' || entry.anchors.length === 0) return { entry, changed: false, reason: 'ok' };

  const checks = entry.anchors.map((a) => checkAnchor(root, a, config));
  const worst = checks.reduce((w, c) => (SEVERITY[c.kind] > SEVERITY[w.kind] ? c : w));

  if (worst.kind === 'deleted') {
    return { entry: { ...entry, status: 'archived' }, changed: true, reason: 'archived-file-deleted' };
  }
  if (worst.kind === 'missing') {
    const changed = entry.status !== 'stale';
    return { entry: changed ? { ...entry, status: 'stale' } : entry, changed, reason: 'stale' };
  }
  // Content matches again: a stale entry comes back only as a hypothesis.
  const status: Status = entry.status === 'stale' ? 'hypothesis' : entry.status;
  if (worst.kind === 'relocated') {
    const anchors = entry.anchors.map((a, i) => {
      const c = checks[i];
      return c?.kind === 'relocated' ? c.anchor : a;
    });
    return { entry: { ...entry, status, anchors }, changed: true, reason: 'relocated' };
  }
  const changed = status !== entry.status;
  return { entry: changed ? { ...entry, status } : entry, changed, reason: 'ok' };
}

export function verifyAll(root: string): { results: VerifyResult[]; errors: { file: string; message: string }[] } {
  const config = loadConfig(root);
  const { entries, errors } = listEntries(root);
  const results = entries.map((e) => verifyEntry(root, e, config));
  for (const r of results) {
    if (r.changed) updateEntry(root, r.entry);
  }
  return { results, errors };
}
