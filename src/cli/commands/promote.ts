import { promote as promoteEntry } from '../../memory/lifecycle.js';
import { updateEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { EXIT_OK, oneId, parse, repoRoot, requireHuman } from '../shared.js';
import { freshOrFail } from './confirm.js';

export const promote: Command = async (args, io) => {
  const { positionals } = parse(args, {});
  const id = oneId(positionals, 'promote');
  requireHuman(io);
  const root = repoRoot(io);
  const updated = promoteEntry(freshOrFail(root, id), io.now());
  updateEntry(root, updated);
  io.stdout(`ok ${updated.id} ${updated.status}\n`);
  return EXIT_OK;
};
