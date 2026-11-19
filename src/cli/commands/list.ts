import { effectiveStatus } from '../../memory/lifecycle.js';
import { loadConfig } from '../../store/config.js';
import { lastCommitterEmail } from '../../store/repo.js';
import { listEntries } from '../../store/store.js';
import type { Command } from '../run.js';
import { EXIT_OK, parse, repoRoot } from '../shared.js';

export const list: Command = async (args, io) => {
  const { values } = parse(args, { area: { type: 'string' }, status: { type: 'string' }, json: { type: 'boolean' } });
  const root = repoRoot(io);
  const config = loadConfig(root);
  const { entries, errors } = listEntries(root);
  const rows = entries
    .filter((e) => values.area === undefined || e.area === values.area)
    .map((e) => ({
      id: e.id,
      status: effectiveStatus(e, lastCommitterEmail(root, `.keelson/entries/${e.id}.md`), config),
      kind: e.kind,
      area: e.area,
      summary: e.summary,
      estTokens: e.estTokens,
    }))
    .filter((r) => values.status === undefined || r.status === values.status);

  if (values.json === true) io.stdout(JSON.stringify(rows) + '\n');
  else for (const r of rows) io.stdout(`${r.id} ${r.status} ${r.area} ${r.summary}\n`);
  for (const e of errors) io.stderr(`error: ${e.file}: ${e.message}\n`);
  return EXIT_OK;
};
