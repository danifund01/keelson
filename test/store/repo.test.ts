import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { findRepoRoot, lastCommitterEmail, NotARepoError, OutsideRepoError, toRepoPath } from '../../src/store/repo.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

const win = process.platform === 'win32';

describe('repo', () => {
  test('toRepoPath converts backslashes and rejects ../outside and other-drive absolute paths', () => {
    const root = win ? 'C:\\work\\repo' : '/work/repo';
    expect(toRepoPath(root, 'src\\a.ts')).toBe('src/a.ts');
    expect(toRepoPath(root, 'src/lib/../a.ts')).toBe('src/a.ts');
    expect(toRepoPath(root, join(root, 'src', 'b.ts'))).toBe('src/b.ts');
    expect(() => toRepoPath(root, '../x')).toThrow(OutsideRepoError);
    expect(() => toRepoPath(root, 'src/../../x')).toThrow(OutsideRepoError);
    expect(() => toRepoPath(root, '.')).toThrow(OutsideRepoError);
    expect(() => toRepoPath(root, '..\\x')).toThrow(OutsideRepoError);
    const other = win ? 'D:\\elsewhere\\x.ts' : '/elsewhere/x.ts';
    expect(() => toRepoPath(root, other)).toThrow(OutsideRepoError);
  });

  test('toRepoPath keeps a file whose name starts with two dots inside the repo', () => {
    const root = win ? 'C:\\work\\repo' : '/work/repo';
    expect(toRepoPath(root, '..hidden/a.ts')).toBe('..hidden/a.ts');
  });

  test('findRepoRoot from nested dir', () => {
    const repo = tmpRepo();
    const nested = join(repo.root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(repo.root);
    expect(findRepoRoot(repo.root)).toBe(repo.root);
  });

  test('findRepoRoot outside a repo throws NotARepoError', () => {
    expect(() => findRepoRoot(win ? 'C:\\' : '/')).toThrow(NotARepoError);
  });

  test('lastCommitterEmail returns null for untracked file and the author email after commit', () => {
    const repo = tmpRepo();
    repo.write('seed.txt', 'seed\n');
    repo.commit('seed');
    repo.write('a.txt', 'x\n');
    expect(lastCommitterEmail(repo.root, 'a.txt')).toBeNull();
    repo.commit('add a', 'stranger@example.org');
    expect(lastCommitterEmail(repo.root, 'a.txt')).toBe('stranger@example.org');
  });

  test('lastCommitterEmail returns null in a repo without commits', () => {
    const repo = tmpRepo();
    expect(lastCommitterEmail(repo.root, 'missing.txt')).toBeNull();
  });
});
