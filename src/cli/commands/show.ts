import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keelsonDir, readEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { EXIT_OK, oneId, parse, repoRoot } from '../shared.js';

export const show: Command = async (args, io) => {
  const { positionals } = parse(args, {});
  const id = oneId(positionals, 'show');
  const root = repoRoot(io);
  readEntry(root, id); // validates the id and the file before printing it
  io.stdout(readFileSync(join(keelsonDir(root), 'entries', `${id}.md`), 'utf8'));
  return EXIT_OK;
};
