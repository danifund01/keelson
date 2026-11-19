import { newEntry } from '../../memory/lifecycle.js';
import { loadConfig } from '../../store/config.js';
import { writeNewEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { CliError, EXIT_OK, EXIT_USAGE, gitUserEmail, parse, parseAnchorSpec, readBody, repoRoot, requireHuman } from '../shared.js';

const options = {
  area: { type: 'string' },
  summary: { type: 'string' },
  body: { type: 'string' },
  'body-file': { type: 'string' },
  anchor: { type: 'string', multiple: true },
  'load-when': { type: 'string', multiple: true },
} as const;

export const rule: Command = async (args, io) => {
  const [sub, ...rest] = args;
  if (sub !== 'add') throw new CliError('usage: keelson rule add --area <a> --summary <s> [--body <t> | --body-file <f>]', EXIT_USAGE);
  const { values, positionals } = parse(rest, options);
  if (positionals.length > 0) throw new CliError(`unexpected argument: ${positionals[0]}`);
  if (values.area === undefined || values.summary === undefined) throw new CliError('rule add requires --area and --summary');
  requireHuman(io);

  const root = repoRoot(io);
  const config = loadConfig(root);
  const entry = newEntry(
    root,
    {
      kind: 'rule',
      area: values.area,
      summary: values.summary,
      body: readBody(values, io, root, config),
      anchors: (values.anchor ?? []).map((a) => parseAnchorSpec(a, io.cwd)),
      loadWhen: values['load-when'] ?? [],
      contradicts: [],
      provenance: { author: gitUserEmail(root) },
      human: true,
    },
    config,
    io.now(),
  );
  writeNewEntry(root, entry);
  io.stdout(`ok ${entry.id} ${entry.status}\n`);
  return EXIT_OK;
};
