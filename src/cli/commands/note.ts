import { KINDS, type Kind } from '../../format/schema.js';
import { markDisputed, newEntry } from '../../memory/lifecycle.js';
import { loadConfig } from '../../store/config.js';
import { readEntry, updateEntry, writeNewEntry } from '../../store/store.js';
import type { Command } from '../run.js';
import { CliError, EXIT_OK, parse, parseAnchorSpec, readBody, repoRoot, sessionOf } from '../shared.js';

const options = {
  kind: { type: 'string' },
  area: { type: 'string' },
  summary: { type: 'string' },
  body: { type: 'string' },
  'body-file': { type: 'string' },
  anchor: { type: 'string', multiple: true },
  'load-when': { type: 'string', multiple: true },
  contradicts: { type: 'string', multiple: true },
  session: { type: 'string' },
  agent: { type: 'string' },
  model: { type: 'string' },
} as const;

function isKind(k: string): k is Kind {
  return (KINDS as readonly string[]).includes(k);
}

export const note: Command = async (args, io) => {
  const { values, positionals } = parse(args, options);
  if (positionals.length > 0) throw new CliError(`unexpected argument: ${positionals[0]}`);
  const { kind, area, summary } = values;
  if (kind === undefined || area === undefined || summary === undefined) {
    throw new CliError('note requires --kind, --area and --summary');
  }
  if (!isKind(kind)) throw new CliError(`invalid --kind ${kind}: expected one of ${KINDS.join(', ')}`);

  const root = repoRoot(io);
  const config = loadConfig(root);
  const contradicted = (values.contradicts ?? []).map((id) => readEntry(root, id));
  const entry = newEntry(
    root,
    {
      kind,
      area,
      summary,
      body: readBody(values, io, root, config),
      anchors: (values.anchor ?? []).map((a) => parseAnchorSpec(a, io.cwd)),
      loadWhen: values['load-when'] ?? [],
      contradicts: values.contradicts ?? [],
      provenance: { agent: values.agent, model: values.model, session: sessionOf(io, values.session) },
      human: false,
    },
    config,
    io.now(),
  );

  const [created, ...others] = markDisputed([entry, ...contradicted]);
  if (created === undefined) throw new Error('unreachable: markDisputed dropped the new entry');
  writeNewEntry(root, created);
  others.forEach((e, i) => {
    if (e !== contradicted[i]) updateEntry(root, e);
  });
  io.stdout(`ok ${created.id} ${created.status}\n`);
  return EXIT_OK;
};
