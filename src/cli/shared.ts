import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { isDenied } from '../guard/deny.js';
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

/** Body from --body or --body-file (never both). A body file inside the repo must not be denied. */
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
  let repoPath: string | null = null;
  try {
    repoPath = toRepoPath(root, full);
  } catch (e) {
    if (!(e instanceof OutsideRepoError)) throw e;
  }
  if (repoPath !== null && isDenied(root, repoPath, config)) throw new CliError(`body file is denied: ${repoPath}`);
  try {
    return readFileSync(full, 'utf8');
  } catch {
    throw new CliError(`cannot read body file: ${bodyFile}`);
  }
}
