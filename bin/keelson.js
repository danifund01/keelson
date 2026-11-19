#!/usr/bin/env node
import { run } from '../dist/cli/run.js';

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  stdinIsTTY: Boolean(process.stdin.isTTY),
  now: () => new Date(),
});
process.exitCode = code;
