import { execFileSync } from 'node:child_process';

export class ShallowHistoryError extends Error {
  override name = 'ShallowHistoryError';
}

/** Author recorded for a pending change when git has no user.email: never trusted. */
export const UNKNOWN_AUTHOR = '(unknown)';

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

function currentUser(root: string): string {
  try {
    const email = git(root, ['config', 'user.email']).trim().toLowerCase();
    return email === '' ? UNKNOWN_AUTHOR : email;
  } catch {
    return UNKNOWN_AUTHOR;
  }
}

function add(authors: Map<string, Set<string>>, path: string, author: string): void {
  const m = ENTRY_PATH.exec(path.trim());
  if (m?.[1] === undefined) return;
  const set = authors.get(m[1]) ?? new Set<string>();
  set.add(author);
  authors.set(m[1], set);
}

/**
 * Lowercased, sorted, distinct authors of each entry file:
 * - every commit that changed it, read in one `git log` pass; `--cc` makes a
 *   merge commit that adds or edits the file (beyond its parents) count too;
 * - the current git user when the file has uncommitted changes, so a compile
 *   before a commit predicts the trust that applies after it.
 * A shallow history is refused: its boundary commit seems to add everything.
 */
export function entryAuthors(root: string): Map<string, string[]> {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new ShallowHistoryError('history is shallow; trust needs full history (git fetch --unshallow)');
  }
  const authors = new Map<string, Set<string>>();
  if (hasCommits(root)) {
    const log = git(root, ['-c', 'core.quotePath=false', 'log', '--cc', '--no-renames', '--format=%x01%ae', '--name-only', '--', '.keelson/entries']);
    let current = '';
    for (const line of log.split('\n')) {
      if (line.startsWith('\x01')) current = line.slice(1).trim().toLowerCase();
      else add(authors, line, current);
    }
  }
  const status = git(root, ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.keelson/entries']);
  const pending = status.split('\0').filter((r) => r.length > 3);
  if (pending.length > 0) {
    const user = currentUser(root);
    for (const record of pending) add(authors, record.slice(3), user);
  }
  return new Map([...authors].map(([id, set]) => [id, [...set].sort()]));
}
