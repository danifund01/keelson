import { expect, test } from 'vitest';
import { run } from '../../src/cli/run.js';
import { fakeIo } from '../helpers/io.js';

test('prints version from package.json', async () => {
  const io = fakeIo();
  const code = await run(['--version'], io);
  expect(code).toBe(0);
  expect(io.out.join('')).toMatch(/^\d+\.\d+\.\d+\n$/);
});

test('unknown command exits 2 with usage on stderr', async () => {
  const io = fakeIo();
  const code = await run(['frobnicate'], io);
  expect(code).toBe(2);
  expect(io.err.join('')).toContain('Usage:');
  expect(io.out).toEqual([]);
});

test('no arguments exits 2 with usage on stderr', async () => {
  const io = fakeIo();
  expect(await run([], io)).toBe(2);
  expect(io.err.join('')).toContain('Usage:');
});
