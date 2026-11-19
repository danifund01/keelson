import { spawnSync } from 'node:child_process';
import picomatch from 'picomatch';
import type { Config } from '../store/config.js';

export const DEFAULT_DENY: readonly string[] = [
  '.env*',
  '.dev.vars*',
  '*.pem',
  '*.key',
  'certificate.json',
  'deployment-info.json',
  'backups/**',
  '.claude/settings.local.json',
];

/**
 * Every pattern matches at the repo root and below any directory, so
 * `.env*` also denies `apps/web/.env`. Negations in config.deny are
 * dropped: config can only add to the defaults.
 */
function matcher(patterns: readonly string[]): (path: string) => boolean {
  const expanded = patterns.filter((p) => !p.startsWith('!')).flatMap((p) => [p, `**/${p}`]);
  return picomatch(expanded, { dot: true, nocase: true });
}

function ignoredByGit(root: string, repoPath: string): boolean {
  const r = spawnSync('git', ['check-ignore', '-q', '--', repoPath], { cwd: root, stdio: 'ignore' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  return true; // git failed: fail closed
}

/** Glob check only, for paths outside the repository (no .gitignore applies there). */
export function matchesDenyGlob(path: string, config: Config): boolean {
  const posix = path.replace(/\\/g, '/');
  const name = posix.slice(posix.lastIndexOf('/') + 1);
  const match = matcher([...DEFAULT_DENY, ...config.deny]);
  return match(posix) || match(name);
}

export function isDenied(root: string, repoPath: string, config: Config): boolean {
  if (matcher([...DEFAULT_DENY, ...config.deny])(repoPath)) return true;
  return ignoredByGit(root, repoPath);
}
