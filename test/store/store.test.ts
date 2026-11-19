import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { serializeEntry } from '../../src/format/entry-file.js';
import { keelsonDir, listEntries, readEntry, updateEntry, writeNewEntry } from '../../src/store/store.js';
import { makeEntry, makeId } from '../helpers/entries.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

const entriesDir = (root: string) => join(keelsonDir(root), 'entries');

describe('store', () => {
  test('writeNewEntry then readEntry roundtrips', () => {
    const repo = tmpRepo();
    const e = makeEntry();
    writeNewEntry(repo.root, e);
    expect(readEntry(repo.root, e.id)).toEqual(e);
    expect(readFileSync(join(entriesDir(repo.root), `${e.id}.md`), 'utf8')).toBe(serializeEntry(e));
  });

  test('writeNewEntry refuses existing id and keeps the first content', () => {
    const repo = tmpRepo();
    const e = makeEntry({ summary: 'first' });
    writeNewEntry(repo.root, e);
    expect(() => writeNewEntry(repo.root, { ...e, summary: 'second' })).toThrow();
    expect(readEntry(repo.root, e.id).summary).toBe('first');
  });

  test('two concurrent writeNewEntry with different ids both persist', async () => {
    const repo = tmpRepo();
    const entries = Array.from({ length: 20 }, () => makeEntry());
    await Promise.all(entries.map(async (e) => writeNewEntry(repo.root, e)));
    expect(readdirSync(entriesDir(repo.root))).toHaveLength(20);
  });

  test('listEntries reports hand-corrupted file in errors and still returns the valid ones', () => {
    const repo = tmpRepo();
    const a = makeEntry();
    const b = makeEntry();
    writeNewEntry(repo.root, b);
    writeNewEntry(repo.root, a);
    const badId = makeId();
    writeFileSync(join(entriesDir(repo.root), `${badId}.md`), '---\nkind: [broken\n---\n');
    const { entries, errors } = listEntries(repo.root);
    expect(entries.map((e) => e.id)).toEqual([a.id, b.id].sort());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe(`.keelson/entries/${badId}.md`);
  });

  test('listEntries flags a file whose name does not match its id', () => {
    const repo = tmpRepo();
    const e = makeEntry();
    repo.write(`.keelson/entries/${makeId()}.md`, serializeEntry(e));
    const { entries, errors } = listEntries(repo.root);
    expect(entries).toEqual([]);
    expect(errors[0]?.message).toMatch(/does not match/);
  });

  test('listEntries returns empty when .keelson is absent and ignores non-md files', () => {
    const repo = tmpRepo();
    expect(listEntries(repo.root)).toEqual({ entries: [], errors: [] });
    repo.write('.keelson/entries/notes.txt', 'x');
    expect(listEntries(repo.root)).toEqual({ entries: [], errors: [] });
  });

  test('updateEntry leaves no temp files', () => {
    const repo = tmpRepo();
    const e = makeEntry();
    writeNewEntry(repo.root, e);
    updateEntry(repo.root, { ...e, status: 'stale' });
    expect(readEntry(repo.root, e.id).status).toBe('stale');
    expect(readdirSync(entriesDir(repo.root))).toEqual([`${e.id}.md`]);
  });

  test('updateEntry refuses an entry that does not exist', () => {
    const repo = tmpRepo();
    expect(() => updateEntry(repo.root, makeEntry())).toThrow(/not found/);
  });

  test('readEntry rejects ids that are not ULIDs (no path traversal)', () => {
    const repo = tmpRepo();
    expect(() => readEntry(repo.root, '../../etc/passwd')).toThrow(/not a valid entry id/);
  });

  test('readEntry of a missing id says not found', () => {
    const repo = tmpRepo();
    expect(() => readEntry(repo.root, makeId())).toThrow(/not found/);
  });
});
