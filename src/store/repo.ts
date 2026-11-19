import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class NotARepoError extends Error {
  override name = 'NotARepoError';
}

export class OutsideRepoError extends Error {
  override name = 'OutsideRepoError';
}

export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new NotARepoError(`not a git repository: ${start}`);
    dir = parent;
  }
}

/** POSIX path relative to the repo root. Relative inputs resolve against the root. */
export function toRepoPath(root: string, p: string): string {
  const input = sep === '\\' ? p : p.replace(/\\/g, '/');
  const abs = resolve(root, input);
  const rel = relative(resolve(root), abs);
  const outside = rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`);
  if (outside) throw new OutsideRepoError(`path is outside the repository: ${p}`);
  return rel.split(sep).join('/');
}

export function lastCommitterEmail(root: string, repoPath: string): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ae', '--', repoPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? null : out;
  } catch {
    return null;
  }
}
