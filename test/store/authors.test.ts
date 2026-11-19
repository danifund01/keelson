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

  test('an uncommitted entry is authored by the current git user, so compiling before a commit predicts after it', () => {
    const repo = tmpRepo();
    const a = makeEntry().id;
    const b = makeEntry().id;
    writeEntry(repo, a);
    repo.commit('add a');
    repo.git('config', 'user.email', 'Mate@Example.org');
    writeEntry(repo, b);
    const map = entryAuthors(repo.root);
    expect(map.get(a)).toEqual(['owner@example.com']);
    expect(map.get(b)).toEqual(['mate@example.org']);
  });

  test('a local edit of a committed entry adds the current git user', () => {
    const repo = tmpRepo();
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('add');
    repo.git('config', 'user.email', 'mate@example.org');
    writeEntry(repo, id, 'Edited locally');
    expect(entryAuthors(repo.root).get(id)).toEqual(['mate@example.org', 'owner@example.com']);
  });

  test('an entry added inside a merge commit counts the merge author (critical: merge bypass)', () => {
    const repo = tmpRepo();
    repo.write('seed.txt', 's\n');
    repo.commit('seed');
    repo.git('checkout', '-q', '-b', 'pr');
    repo.write('pr.txt', 'p\n');
    repo.commit('pr work', 'stranger@example.org');
    repo.git('checkout', '-q', 'main');
    repo.write('main.txt', 'm\n');
    repo.commit('main work');
    repo.git('checkout', '-q', 'pr');
    repo.git('merge', '-q', '--no-ff', '--no-commit', 'main');
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.git('add', '-A');
    repo.git('-c', 'user.email=stranger@example.org', 'commit', '-q', '-m', 'merge main');
    expect(entryAuthors(repo.root).get(id)).toEqual(['stranger@example.org']);
  });

  test('an entry edited inside a merge commit counts the merge author', () => {
    const repo = tmpRepo();
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('owner entry');
    repo.git('checkout', '-q', '-b', 'pr');
    repo.write('pr.txt', 'p\n');
    repo.commit('pr work', 'stranger@example.org');
    repo.git('checkout', '-q', 'main');
    repo.write('main.txt', 'm\n');
    repo.commit('main work');
    repo.git('checkout', '-q', 'pr');
    repo.git('merge', '-q', '--no-ff', '--no-commit', 'main');
    writeEntry(repo, id, 'Poisoned in merge');
    repo.git('add', '-A');
    repo.git('-c', 'user.email=stranger@example.org', 'commit', '-q', '-m', 'merge main');
    expect(entryAuthors(repo.root).get(id)).toEqual(['owner@example.com', 'stranger@example.org']);
  });

  test('a clean merge of an owner entry does not add the merge author', () => {
    const repo = tmpRepo();
    repo.write('seed.txt', 's\n');
    repo.commit('seed');
    repo.git('checkout', '-q', '-b', 'feature');
    const id = makeEntry().id;
    writeEntry(repo, id);
    repo.commit('owner entry');
    repo.git('checkout', '-q', 'main');
    repo.write('main.txt', 'm\n');
    repo.commit('main work');
    repo.git('-c', 'user.email=merger@example.org', 'merge', '-q', '--no-ff', '-m', 'merge feature', 'feature');
    expect(entryAuthors(repo.root).get(id)).toEqual(['owner@example.com']);
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
