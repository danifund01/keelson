import { verifyAll } from '../../memory/verify.js';
import type { Command } from '../run.js';
import { EXIT_ERROR, EXIT_OK, parse, repoRoot } from '../shared.js';

export const verify: Command = async (args, io) => {
  const { values } = parse(args, { json: { type: 'boolean' } });
  const root = repoRoot(io);
  const { results, errors } = verifyAll(root);
  if (values.json === true) {
    const rows = results.map((r) => ({ id: r.entry.id, reason: r.reason, status: r.entry.status, changed: r.changed }));
    io.stdout(JSON.stringify({ results: rows, errors }) + '\n');
  } else {
    const fresh = results.filter((r) => r.reason === 'ok' && r.entry.status !== 'archived').length;
    const count = (reason: string) => results.filter((r) => r.reason === reason).length;
    io.stdout(
      `ok verified=${fresh} relocated=${count('relocated')} stale=${count('stale')} archived=${count('archived-file-deleted')} errors=${errors.length}\n`,
    );
    for (const e of errors) io.stderr(`error: ${e.file}: ${e.message}\n`);
  }
  return errors.length > 0 ? EXIT_ERROR : EXIT_OK;
};
