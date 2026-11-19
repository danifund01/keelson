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
