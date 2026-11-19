import { createHash } from 'node:crypto';
import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Entry } from '../../src/format/schema.js';
import {
  confirm,
  effectiveStatus,
  LifecycleError,
  markDisputed,
  newEntry,
  promote,
  resolve,
  type NewEntryInput,
} from '../../src/memory/lifecycle.js';
import { DEFAULT_CONFIG, type Config } from '../../src/store/config.js';
import { makeEntry } from '../helpers/entries.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const LATER = new Date('2026-11-20T09:30:00.000Z');
const config: Config = { ...DEFAULT_CONFIG, trustedAuthors: ['owner@example.com'] };

function input(overrides: Partial<NewEntryInput> = {}): NewEntryInput {
  return {
    kind: 'finding',
    area: 'auth',
    summary: 'Origins grouped by /64',
    body: 'Observed in origin.ts.\n',
    anchors: [],
    loadWhen: [],
    contradicts: [],
    provenance: { agent: 'claude-code', session: 's1' },
    human: false,
    ...overrides,
  };
}

function repoWithSource() {
  const repo = tmpRepo();
  repo.write('src/origin.ts', 'line one\r\nline two\r\nline three\r\n');
  return repo;
}

describe('newEntry', () => {
  test('finding with valid anchors is verified with estimated tokens', () => {
    const repo = repoWithSource();
    const e = newEntry(repo.root, input({ anchors: [{ path: 'src/origin.ts', range: [2, 3] }] }), config, NOW);
    expect(e.status).toBe('verified');
    expect(e.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(e.estTokens).toBe(Math.ceil(('Origins grouped by /64' + 'Observed in origin.ts.\n').length / 3.5));
    expect(e.estTokens).toBe(13); // 22 + 23 chars = 45; 45 / 3.5 = 12.86
    const expectedHash = 'sha256:' + createHash('sha256').update('line two\nline three').digest('hex');
    expect(e.anchors).toEqual([{ path: 'src/origin.ts', range: [2, 3], hash: expectedHash }]);
    expect(e.provenance).toEqual({ created: '2026-11-19T12:00:00.000Z', agent: 'claude-code', session: 's1' });
    expect(e.confirmations).toEqual([]);
    expect(e.resolvedBy).toBeNull();
  });

  test('anchor path with backslashes is stored as POSIX', () => {
    const repo = repoWithSource();
    const e = newEntry(repo.root, input({ anchors: [{ path: 'src\\origin.ts', range: [1, 1] }] }), config, NOW);
    expect(e.anchors[0]?.path).toBe('src/origin.ts');
  });

  test('finding without anchors is a hypothesis', () => {
    const repo = repoWithSource();
    expect(newEntry(repo.root, input(), config, NOW).status).toBe('hypothesis');
  });

  test('kind hypothesis with anchors stays hypothesis', () => {
    const repo = repoWithSource();
    const e = newEntry(repo.root, input({ kind: 'hypothesis', anchors: [{ path: 'src/origin.ts', range: [1, 1] }] }), config, NOW);
    expect(e.status).toBe('hypothesis');
  });

  test('kind rule from an agent is refused', () => {
    const repo = repoWithSource();
    expect(() => newEntry(repo.root, input({ kind: 'rule' }), config, NOW)).toThrow(LifecycleError);
    expect(() => newEntry(repo.root, input({ kind: 'rule' }), config, NOW)).toThrow(/rule requires a human/);
  });

  test('kind rule from a human is verified and keeps its body literally', () => {
    const repo = repoWithSource();
    const body = 'Dinero con decimal.js;  redondeo HALF_UP.\n\n- Sin   compresión.\n';
    const e = newEntry(repo.root, input({ kind: 'rule', body, human: true }), config, NOW);
    expect(e.status).toBe('verified');
    expect(e.body).toBe(body);
  });

  test('anchor to .env is denied and nothing is written', () => {
    const repo = repoWithSource();
    repo.write('.env', 'X=1\n');
    expect(() => newEntry(repo.root, input({ anchors: [{ path: '.env', range: [1, 1] }] }), config, NOW)).toThrow(/denied/);
    expect(existsSync(join(repo.root, '.keelson'))).toBe(false);
  });

  test('anchor to a binary file (NUL byte) is refused', () => {
    const repo = repoWithSource();
    repo.write('img.bin', Buffer.from([0x61, 0x00, 0x62, 0x0a]));
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'img.bin', range: [1, 1] }] }), config, NOW)).toThrow(/binary/);
  });

  test('anchor to a file over 1 MiB is refused; exactly 1 MiB is accepted', () => {
    const repo = repoWithSource();
    repo.write('big.txt', 'a'.repeat(1024 * 1024) + '\n');
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'big.txt', range: [1, 1] }] }), config, NOW)).toThrow(/1 MiB/);
    repo.write('edge.txt', 'a'.repeat(1024 * 1024 - 1) + '\n');
    expect(newEntry(repo.root, input({ anchors: [{ path: 'edge.txt', range: [1, 1] }] }), config, NOW).status).toBe('verified');
  });

  test('symlink inside the repo pointing to a denied file is refused', () => {
    const repo = repoWithSource();
    repo.write('.env', 'X=1\n');
    symlinkSync(join(repo.root, '.env'), join(repo.root, 'src', 'link.ts'), 'file');
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'src/link.ts', range: [1, 1] }] }), config, NOW)).toThrow(/denied/);
  });

  test('symlink inside the repo pointing to a gitignored file is refused', () => {
    const repo = repoWithSource();
    repo.write('.gitignore', 'private.txt\n');
    repo.write('private.txt', 'hidden\n');
    symlinkSync(join(repo.root, 'private.txt'), join(repo.root, 'src', 'link.ts'), 'file');
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'src/link.ts', range: [1, 1] }] }), config, NOW)).toThrow(/denied/);
  });

  test('anchor to a directory gives a clear LifecycleError', () => {
    const repo = repoWithSource();
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'src', range: [1, 1] }] }), config, NOW)).toThrow(LifecycleError);
  });

  test('anchor inside a directory whose name starts with two dots is accepted', () => {
    const repo = repoWithSource();
    repo.write('..cache/a.ts', 'x\n');
    expect(newEntry(repo.root, input({ anchors: [{ path: '..cache/a.ts', range: [1, 1] }] }), config, NOW).status).toBe('verified');
  });

  test('anchor outside the repo, missing file or bad range is refused', () => {
    const repo = repoWithSource();
    expect(() => newEntry(repo.root, input({ anchors: [{ path: '../x.ts', range: [1, 1] }] }), config, NOW)).toThrow(LifecycleError);
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'src/none.ts', range: [1, 1] }] }), config, NOW)).toThrow(/not found/);
    expect(() => newEntry(repo.root, input({ anchors: [{ path: 'src/origin.ts', range: [2, 9] }] }), config, NOW)).toThrow(LifecycleError);
  });

  test('body with an AKIA key is refused as secret', () => {
    const repo = repoWithSource();
    const body = 'key is ' + 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
    expect(() => newEntry(repo.root, input({ body }), config, NOW)).toThrow(LifecycleError);
    expect(() => newEntry(repo.root, input({ body }), config, NOW)).toThrow(/secret/);
    expect(() => newEntry(repo.root, input({ summary: body }), config, NOW)).toThrow(/secret/);
  });

  test('summary over 160 chars, empty summary or invalid contradicts id are refused', () => {
    const repo = repoWithSource();
    expect(() => newEntry(repo.root, input({ summary: 'x'.repeat(161) }), config, NOW)).toThrow(LifecycleError);
    expect(() => newEntry(repo.root, input({ summary: '  ' }), config, NOW)).toThrow(LifecycleError);
    expect(() => newEntry(repo.root, input({ contradicts: ['nope'] }), config, NOW)).toThrow(LifecycleError);
  });
});

describe('confirm', () => {
  const hyp = (): Entry => makeEntry({ status: 'hypothesis', provenance: { created: NOW.toISOString(), session: 's1' } });

  test('confirm from another session promotes a hypothesis to verified', () => {
    const e = confirm(hyp(), { session: 's2' }, LATER);
    expect(e.status).toBe('verified');
    expect(e.confirmations).toEqual([{ at: '2026-11-20T09:30:00.000Z', session: 's2' }]);
  });

  test('confirm from the same session or without session keeps hypothesis but records it', () => {
    const same = confirm(hyp(), { session: 's1' }, LATER);
    expect(same.status).toBe('hypothesis');
    expect(same.confirmations).toHaveLength(1);
    const none = confirm(hyp(), {}, LATER);
    expect(none.status).toBe('hypothesis');
    expect(none.confirmations).toEqual([{ at: '2026-11-20T09:30:00.000Z' }]);
  });

  test('confirm does not mutate its input', () => {
    const e = hyp();
    confirm(e, { session: 's2' }, LATER);
    expect(e.status).toBe('hypothesis');
    expect(e.confirmations).toEqual([]);
  });

  test('confirm of an archived or stale entry is refused', () => {
    expect(() => confirm(makeEntry({ status: 'archived' }), { session: 's2' }, LATER)).toThrow(LifecycleError);
    expect(() => confirm(makeEntry({ status: 'stale' }), { session: 's2' }, LATER)).toThrow(LifecycleError);
  });
});

describe('markDisputed', () => {
  test('entry contradicting another makes both disputed', () => {
    const b = makeEntry({ status: 'verified' });
    const a = makeEntry({ status: 'hypothesis', contradicts: [b.id] });
    const out = markDisputed([a, b]);
    expect(out.map((e) => e.status)).toEqual(['disputed', 'disputed']);
  });

  test('contradiction against an archived or unknown entry changes nothing', () => {
    const b = makeEntry({ status: 'archived' });
    const a = makeEntry({ status: 'verified', contradicts: [b.id, '01JD9999999999999999999999'] });
    const c = makeEntry({ status: 'verified' });
    expect(markDisputed([a, b, c]).map((e) => e.status)).toEqual(['verified', 'archived', 'verified']);
  });
});

describe('resolve and promote', () => {
  test('resolve archives and records resolvedBy', () => {
    const e = resolve(makeEntry({ status: 'verified' }), 'abc1234');
    expect(e.status).toBe('archived');
    expect(e.resolvedBy).toBe('abc1234');
  });

  test('resolve refuses an empty reference or an already resolved entry', () => {
    expect(() => resolve(makeEntry(), ' ')).toThrow(LifecycleError);
    expect(() => resolve(makeEntry({ status: 'archived', resolvedBy: 'x' }), 'y')).toThrow(LifecycleError);
  });

  test('promote makes a hypothesis verified and records the approval', () => {
    const e = promote(makeEntry({ status: 'hypothesis' }), LATER);
    expect(e.status).toBe('verified');
    expect(e.confirmations).toEqual([{ at: '2026-11-20T09:30:00.000Z', author: 'human' }]);
  });

  test('promote refuses stale or archived entries', () => {
    expect(() => promote(makeEntry({ status: 'stale' }), LATER)).toThrow(LifecycleError);
    expect(() => promote(makeEntry({ status: 'archived' }), LATER)).toThrow(LifecycleError);
  });
});

describe('effectiveStatus', () => {
  test('verified with an author outside trustedAuthors is a hypothesis', () => {
    expect(effectiveStatus(makeEntry({ status: 'verified' }), ['stranger@example.org'], config)).toBe('hypothesis');
  });

  test('verified with only trusted authors stays verified (email case ignored)', () => {
    expect(effectiveStatus(makeEntry({ status: 'verified' }), ['Owner@Example.com'], config)).toBe('verified');
  });

  test('one untrusted author among trusted ones makes it a hypothesis', () => {
    expect(effectiveStatus(makeEntry({ status: 'verified' }), ['owner@example.com', 'stranger@example.org'], config)).toBe('hypothesis');
  });

  test('no authors (entry not committed yet, local) keeps the stored status', () => {
    expect(effectiveStatus(makeEntry({ status: 'verified' }), [], config)).toBe('verified');
  });

  test('statuses other than verified are never upgraded', () => {
    expect(effectiveStatus(makeEntry({ status: 'stale' }), ['stranger@example.org'], config)).toBe('stale');
    expect(effectiveStatus(makeEntry({ status: 'disputed' }), ['owner@example.com'], config)).toBe('disputed');
  });
});
