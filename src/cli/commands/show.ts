import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectiveStatus } from '../../memory/lifecycle.js';
import { verifyEntry } from '../../memory/verify.js';
import { loadConfig } from '../../store/config.js';
import { entryAuthors } from '../../store/authors.js';
import { keelsonDir, readEntry, updateEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { EXIT_OK, oneId, parse, repoRoot } from '../shared.js';

/**
 * Re-checks the anchors (persisting any change), then prints the status a
 * reader should trust followed by the entry file.
 */
export const show: Command = async (args, io) => {
  const { positionals } = parse(args, {});
  const id = oneId(positionals, 'show');
  const root = repoRoot(io);
  const config = loadConfig(root);
  const checked = verifyEntry(root, readEntry(root, id), config);
  if (checked.changed) updateEntry(root, checked.entry);
  const status = effectiveStatus(checked.entry, entryAuthors(root).get(id) ?? [], config);
  io.stdout(`effective_status: ${status}\n` + readFileSync(join(keelsonDir(root), 'entries', `${id}.md`), 'utf8'));
  return EXIT_OK;
};
