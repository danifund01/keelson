import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export interface TmpRepo {
  root: string;
  write(path: string, content: string | Buffer): void;
  git(...args: string[]): string;
  commit(message: string, email?: string): void;
}

/** A throwaway git repo under the OS temp dir, removed after each test. */
export function tmpRepo(): TmpRepo {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'keelson-test-')));
  created.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'owner@example.com');
  git('config', 'user.name', 'Owner');
  git('config', 'core.autocrlf', 'false');
  return {
    root,
    git,
    write(path, content) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    commit(message, email = 'owner@example.com') {
      git('add', '-A');
      git('-c', `user.email=${email}`, 'commit', '-q', '--allow-empty', '-m', message);
    },
  };
}

/** A `git clone <args>` of the repo, removed after each test. */
export function cloneRepo(repo: TmpRepo, args: string[] = []): string {
  const parent = realpathSync.native(mkdtempSync(join(tmpdir(), 'keelson-clone-')));
  created.push(parent);
  const dest = join(parent, 'clone');
  execFileSync('git', ['clone', '-q', ...args, pathToFileURL(repo.root).href, dest], { stdio: 'ignore' });
  return dest;
}

/** A `git clone --depth 1` of the repo, removed after each test. */
export function shallowClone(repo: TmpRepo): string {
  return cloneRepo(repo, ['--depth', '1']);
}
