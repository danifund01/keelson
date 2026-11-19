import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { isDenied, matchesDenyGlob } from '../guard/deny.js';
import type { Config } from '../store/config.js';
import { findRepoRoot, OutsideRepoError, toRepoPath } from '../store/repo.js';
import type { CliIo } from './run.js';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_NEEDS_HUMAN = 3;

/** An error whose message is shown to the user as is. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number = EXIT_ERROR,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function parse<O extends NonNullable<ParseArgsConfig['options']>>(args: string[], options: O) {
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (e) {
    throw new CliError(e instanceof Error ? e.message : String(e));
  }
}

export function repoRoot(io: CliIo): string {
  return findRepoRoot(io.cwd);
}

export function requireHuman(io: CliIo): void {
  if (!io.stdinIsTTY) throw new CliError('requires an interactive terminal (human only)', EXIT_NEEDS_HUMAN);
}

export function sessionOf(io: CliIo, flag: string | undefined): string | undefined {
  const s = flag ?? io.env['KEELSON_SESSION'];
  return s === undefined || s === '' ? undefined : s;
}

export function gitUserEmail(root: string): string | undefined {
  try {
    const out = execFileSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

/** Parses `path:start-end`; the path is resolved against the working directory. */
export function parseAnchorSpec(spec: string, cwd: string): { path: string; range: [number, number] } {
  const m = /^(.+):(\d+)-(\d+)$/.exec(spec);
  if (m === null) throw new CliError(`invalid --anchor "${spec}": expected path:start-end`);
  const [, path = '', start = '', end = ''] = m;
  return { path: resolve(cwd, path), range: [Number(start), Number(end)] };
}

export function oneId(positionals: string[], command: string): string {
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw new CliError(`usage: keelson ${command} <id>`);
  return id;
}

/** Inside the repo: deny globs plus .gitignore. Outside: deny globs on the path and file name. */
function pathIsDenied(root: string, absPath: string, config: Config): boolean {
  try {
    return isDenied(root, toRepoPath(root, absPath), config);
  } catch (e) {
    if (e instanceof OutsideRepoError) return matchesDenyGlob(absPath, config);
    throw e;
  }
}

/** Body from --body or --body-file (never both). The body file, or its link target, must not be denied. */
export function readBody(
  values: { body?: string | undefined; 'body-file'?: string | undefined },
  io: CliIo,
  root: string,
  config: Config,
): string {
  const { body, 'body-file': bodyFile } = values;
  if (body !== undefined && bodyFile !== undefined) throw new CliError('use either --body or --body-file, not both');
  if (bodyFile === undefined) return body ?? '';
  const full = resolve(io.cwd, bodyFile);
  let real = full;
  try {
    real = realpathSync.native(full);
  } catch {
    // Missing file: the read below reports it.
  }
  for (const p of new Set([full, real])) {
    if (pathIsDenied(root, p, config)) throw new CliError(`body file is denied: ${bodyFile}`);
  }
  try {
    return readFileSync(full, 'utf8');
  } catch {
    throw new CliError(`cannot read body file: ${bodyFile}`);
  }
}
