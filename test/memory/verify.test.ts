import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Entry } from '../../src/format/schema.js';
import { newEntry, type NewEntryInput } from '../../src/memory/lifecycle.js';
import { verifyAll, verifyEntry } from '../../src/memory/verify.js';
import { DEFAULT_CONFIG } from '../../src/store/config.js';
import { keelsonDir, readEntry, updateEntry, writeNewEntry } from '../../src/store/store.js';
import { makeId } from '../helpers/entries.js';
import { tmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const SOURCE = ['import x', 'function f() {', '  return 1;', '}', 'export { f }', ''].join('\n');

function setup(anchors: NewEntryInput['anchors'] = [{ path: 'src/f.ts', range: [2, 4] }], status?: Entry['status']): { repo: TmpRepo; entry: Entry } {
  const repo = tmpRepo();
  repo.write('src/f.ts', SOURCE);
  repo.write('src/g.ts', 'one\ntwo\n');
  const created = newEntry(
    repo.root,
    { kind: 'finding', area: 'core', summary: 'f returns 1', body: '', anchors, loadWhen: [], contradicts: [], provenance: {}, human: false },
    DEFAULT_CONFIG,
    NOW,
  );
  const entry = status === undefined ? created : { ...created, status };
  writeNewEntry(repo.root, entry);
  return { repo, entry };
}

describe('verify', () => {
  test('unchanged file keeps verified', () => {
    const { repo, entry } = setup();
    expect(verifyEntry(repo.root, entry)).toEqual({ entry, changed: false, reason: 'ok' });
    const all = verifyAll(repo.root);
    expect(all.errors).toEqual([]);
    expect(all.results.map((r) => r.reason)).toEqual(['ok']);
    expect(readEntry(repo.root, entry.id)).toEqual(entry);
  });

  test('lines inserted above → relocated, range updated on disk, status kept', () => {
    const { repo, entry } = setup();
    repo.write('src/f.ts', '// a\n// b\n// c\n' + SOURCE);
    const { results } = verifyAll(repo.root);
    expect(results[0]?.reason).toBe('relocated');
    const onDisk = readEntry(repo.root, entry.id);
    expect(onDisk.anchors[0]?.range).toEqual([5, 7]);
    expect(onDisk.anchors[0]?.hash).toBe(entry.anchors[0]?.hash);
    expect(onDisk.status).toBe('verified');
  });

  test('verifyAll persist false reports changes but leaves entry files unchanged', () => {
    const { repo, entry } = setup();
    const file = join(keelsonDir(repo.root), 'entries', `${entry.id}.md`);
    const before = readFileSync(file, 'utf8');
    repo.write('src/f.ts', SOURCE.replace('return 1', 'return 2'));
    const { results } = verifyAll(repo.root, { persist: false });
    expect(results[0]?.reason).toBe('stale');
    expect(results[0]?.entry.status).toBe('stale');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  test('anchored lines edited → stale', () => {
    const { repo, entry } = setup();
    repo.write('src/f.ts', SOURCE.replace('return 1', 'return 2'));
    expect(verifyAll(repo.root).results[0]?.reason).toBe('stale');
    expect(readEntry(repo.root, entry.id).status).toBe('stale');
  });

  test('CRLF conversion of the anchored file is not a change', () => {
    const { repo, entry } = setup();
    repo.write('src/f.ts', SOURCE.replace(/\n/g, '\r\n'));
    expect(verifyEntry(repo.root, entry).reason).toBe('ok');
  });

  test('anchored file emptied → stale', () => {
    const { repo, entry } = setup();
    repo.write('src/f.ts', '');
    expect(verifyEntry(repo.root, entry).reason).toBe('stale');
  });

  test('anchored file removed from disk → archived', () => {
    const { repo, entry } = setup();
    repo.git('add', '-A');
    repo.git('rm', '-q', '-f', 'src/f.ts');
    const { results } = verifyAll(repo.root);
    expect(results[0]?.reason).toBe('archived-file-deleted');
    expect(readEntry(repo.root, entry.id).status).toBe('archived');
  });

  test('git mv of anchored file → archived', () => {
    const { repo, entry } = setup();
    repo.commit('add sources');
    repo.git('mv', 'src/f.ts', 'src/renamed.ts');
    expect(verifyAll(repo.root).results[0]?.reason).toBe('archived-file-deleted');
    expect(readEntry(repo.root, entry.id).status).toBe('archived');
  });

  test('worst anchor wins: one deleted and one matching → archived', () => {
    const { repo, entry } = setup([
      { path: 'src/f.ts', range: [2, 4] },
      { path: 'src/g.ts', range: [1, 2] },
    ]);
    repo.git('add', '-A');
    repo.git('rm', '-q', '-f', 'src/g.ts');
    expect(verifyEntry(repo.root, entry).reason).toBe('archived-file-deleted');
  });

  test('worst anchor wins: one edited and one relocated → stale', () => {
    const { repo, entry } = setup([
      { path: 'src/f.ts', range: [2, 4] },
      { path: 'src/g.ts', range: [1, 2] },
    ]);
    repo.write('src/f.ts', '// moved\n' + SOURCE);
    repo.write('src/g.ts', 'one\nTWO\n');
    const r = verifyEntry(repo.root, entry);
    expect(r.reason).toBe('stale');
    expect(r.entry.status).toBe('stale');
  });

  test('anchored file that became gitignored is not read and goes stale', () => {
    const { repo, entry } = setup();
    repo.write('.gitignore', 'src/f.ts\n');
    expect(verifyEntry(repo.root, entry).reason).toBe('stale');
  });

  test('entries already archived are skipped', () => {
    const { repo, entry } = setup(undefined, 'archived');
    repo.git('add', '-A');
    repo.git('rm', '-q', '-f', 'src/f.ts');
    expect(verifyEntry(repo.root, entry)).toEqual({ entry, changed: false, reason: 'ok' });
  });

  test('stale entry whose content is restored returns to hypothesis', () => {
    const { repo, entry } = setup(undefined, 'stale');
    const r = verifyEntry(repo.root, entry);
    expect(r.changed).toBe(true);
    expect(r.entry.status).toBe('hypothesis');
  });

  test('stale entry restored at another position returns to hypothesis and is relocated', () => {
    const { repo, entry } = setup(undefined, 'stale');
    repo.write('src/f.ts', '// moved\n' + SOURCE);
    const r = verifyEntry(repo.root, entry);
    expect(r.reason).toBe('relocated');
    expect(r.entry.status).toBe('hypothesis');
  });

  test('hypothesis is never upgraded by verification', () => {
    const { repo, entry } = setup(undefined, 'hypothesis');
    expect(verifyEntry(repo.root, entry).entry.status).toBe('hypothesis');
  });

  test('disputed entry with edited anchor becomes stale', () => {
    const { repo, entry } = setup(undefined, 'disputed');
    repo.write('src/f.ts', SOURCE.replace('return 1', 'return 2'));
    expect(verifyEntry(repo.root, entry).entry.status).toBe('stale');
  });

  test('hand-edited anchor pointing to a directory goes stale and others still verify', () => {
    const { repo, entry } = setup();
    updateEntry(repo.root, { ...entry, anchors: [{ ...entry.anchors[0]!, path: 'src' }] });
    const good = { ...entry, id: makeId() };
    writeNewEntry(repo.root, good);
    const { results, errors } = verifyAll(repo.root);
    expect(errors).toEqual([]);
    expect(results.map((r) => r.reason).sort()).toEqual(['ok', 'stale']);
  });

  test('corrupt entry file appears in errors and others still verify', () => {
    const { repo } = setup();
    const badId = makeId();
    writeFileSync(join(keelsonDir(repo.root), 'entries', `${badId}.md`), 'garbage');
    const { results, errors } = verifyAll(repo.root);
    expect(results).toHaveLength(1);
    expect(errors.map((e) => e.file)).toEqual([`.keelson/entries/${badId}.md`]);
  });
});
