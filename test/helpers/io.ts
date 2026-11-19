import type { CliIo } from '../../src/cli/run.js';

export interface FakeIo extends CliIo {
  out: string[];
  err: string[];
}

export function fakeIo(overrides: Partial<CliIo> = {}): FakeIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    cwd: process.cwd(),
    env: {},
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    stdinIsTTY: false,
    now: () => new Date('2026-11-19T12:00:00.000Z'),
    ...overrides,
    out,
    err,
  };
}
