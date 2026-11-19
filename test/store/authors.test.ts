import { describe, expect, test } from 'vitest';
import { serializeEntry } from '../../src/format/entry-file.js';
import { entryAuthors, ShallowHistoryError } from '../../src/store/authors.js';
import { makeEntry } from '../helpers/entries.js';
import { shallowClone, tmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

function writeEntry(repo: TmpRepo, id: string, summary = 'A finding'): void {
  repo.write(`.keelson/entries/${id}.md`, serializeEntry(makeEntry({ id, summary })));
}

describe('entryAuthors', () => {
  test('entry created and relocated by owner has only the owner', () => {
    const repo = tmpRepo();
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('add');
    writeEntry(repo, id, 'Relocated');
    repo.commit('relocate');
    expect(entryAuthors(repo.root).get(id)).toEqual(['owner@example.com']);
  });

  test('entry created by stranger and later committed by owner keeps both authors', () => {
    const repo = tmpRepo();
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('external', 'stranger@example.org');
    writeEntry(repo, id, 'Relocated by owner');
    repo.commit('relocate');
    expect(entryAuthors(repo.root).get(id)).toEqual(['owner@example.com', 'stranger@example.org']);
  });

  test('entry edited by stranger includes the stranger', () => {
    const repo = tmpRepo();
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('add');
    writeEntry(repo, id, 'Poisoned');
    repo.commit('edit', 'Stranger@Example.org');
    expect(entryAuthors(repo.root).get(id)).toEqual(['owner@example.com', 'stranger@example.org']);
  });

  test('uncommitted entry has no authors and other entries are separate', () => {
    const repo = tmpRepo();
    const a = makeEntry().id;
    const b = makeEntry().id;
    writeEntry(repo, a);
    repo.commit('add a');
    writeEntry(repo, b);
    const map = entryAuthors(repo.root);
    expect(map.get(a)).toEqual(['owner@example.com']);
    expect(map.has(b)).toBe(false);
  });

  test('repo without commits gives an empty map', () => {
    const repo = tmpRepo();
    expect(entryAuthors(repo.root).size).toBe(0);
  });

  test('shallow clone throws ShallowHistoryError', () => {
    const repo = tmpRepo();
    writeEntry(repo, makeEntry().id);
    repo.commit('one');
    repo.write('x.txt', 'x\n');
    repo.commit('two');
    expect(() => entryAuthors(shallowClone(repo))).toThrow(ShallowHistoryError);
    expect(() => entryAuthors(shallowClone(repo))).toThrow(/shallow/);
  });
});
