import { execFileSync } from 'node:child_process';

export class ShallowHistoryError extends Error {
  override name = 'ShallowHistoryError';
}

const ENTRY_PATH = /^\.keelson\/entries\/([0-9A-HJKMNP-TV-Z]{26})\.md$/;

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

function hasCommits(root: string): boolean {
  try {
    git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lowercased, sorted, distinct authors of every commit that touched each entry
 * file, read in one `git log` pass. Trust needs all of them, so a shallow
 * history (where the boundary commit seems to add everything) is refused.
 */
export function entryAuthors(root: string): Map<string, string[]> {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new ShallowHistoryError('history is shallow; trust needs full history (git fetch --unshallow)');
  }
  const authors = new Map<string, Set<string>>();
  if (!hasCommits(root)) return new Map();
  const out = git(root, ['-c', 'core.quotePath=false', 'log', '--no-renames', '--format=%x01%ae', '--name-only', '--', '.keelson/entries']);
  let current = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('\x01')) {
      current = line.slice(1).trim().toLowerCase();
      continue;
    }
    const m = ENTRY_PATH.exec(line.trim());
    if (m?.[1] === undefined) continue;
    const set = authors.get(m[1]) ?? new Set<string>();
    set.add(current);
    authors.set(m[1], set);
  }
  return new Map([...authors].map(([id, set]) => [id, [...set].sort()]));
}
