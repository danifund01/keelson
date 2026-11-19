import { resolve as resolveEntry } from '../../memory/lifecycle.js';
import { readEntry, updateEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { CliError, EXIT_OK, oneId, parse, repoRoot } from '../shared.js';

export const resolve: Command = async (args, io) => {
  const { values, positionals } = parse(args, { by: { type: 'string' } });
  const id = oneId(positionals, 'resolve');
  if (values.by === undefined) throw new CliError('resolve requires --by <commit or entry id>');
  const root = repoRoot(io);
  const updated = resolveEntry(readEntry(root, id), values.by);
  updateEntry(root, updated);
  io.stdout(`ok ${updated.id} ${updated.status}\n`);
  return EXIT_OK;
};
