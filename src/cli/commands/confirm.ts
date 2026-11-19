import type { Entry } from '../../format/schema.js';
import { confirm as confirmEntry } from '../../memory/lifecycle.js';
import { verifyEntry } from '../../memory/verify.js';
import { readEntry, updateEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { CliError, EXIT_OK, oneId, parse, repoRoot, sessionOf } from '../shared.js';

/** Re-checks anchors before a status change; persists and refuses if the evidence is gone. */
export function freshOrFail(root: string, id: string): Entry {
  const checked = verifyEntry(root, readEntry(root, id));
  if (checked.changed) updateEntry(root, checked.entry);
  if (checked.entry.status === 'stale' || checked.entry.status === 'archived') {
    throw new CliError(`entry ${id} is ${checked.entry.status}: its anchored evidence changed`);
  }
  return checked.entry;
}

export const confirm: Command = async (args, io) => {
  const { values, positionals } = parse(args, { session: { type: 'string' } });
  const root = repoRoot(io);
  const entry = freshOrFail(root, oneId(positionals, 'confirm'));
  const updated = confirmEntry(entry, { session: sessionOf(io, values.session) }, io.now());
  updateEntry(root, updated);
  io.stdout(`ok ${updated.id} ${updated.status}\n`);
  return EXIT_OK;
};
