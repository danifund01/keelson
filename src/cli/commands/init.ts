import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { keelsonDir } from '../../store/store.js';
import type { Command } from '../run.js';
import { CliError, EXIT_OK, gitUserEmail, parse, repoRoot } from '../shared.js';

export const init: Command = async (args, io) => {
  parse(args, {});
  const root = repoRoot(io);
  const dir = keelsonDir(root);
  if (existsSync(dir)) throw new CliError('.keelson already exists');
  mkdirSync(join(dir, 'entries'), { recursive: true });
  const email = gitUserEmail(root);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ trusted_authors: email === undefined ? [] : [email] }, null, 2) + '\n');
  writeFileSync(join(dir, '.gitignore'), '.local/\n');
  io.stdout('ok init .keelson\n');
  return EXIT_OK;
};
