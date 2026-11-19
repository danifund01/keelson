import { compileRepo } from '../../compile/compile.js';
import { compareText } from '../../compile/model.js';
import { adoptAgentsMd, AGENTS_FILE, applyOutputs, diffOutputs } from '../../compile/outputs.js';
import type { Command } from '../run.js';
import { CliError, EXIT_ERROR, EXIT_OK, EXIT_USAGE, parse, repoRoot, requireHuman } from '../shared.js';

export const compile: Command = async (args, io) => {
  const { values } = parse(args, { check: { type: 'boolean' }, 'adopt-agents-md': { type: 'boolean' } });
  const check = values.check === true;
  const adopt = values['adopt-agents-md'] === true;
  if (check && adopt) throw new CliError('--check and --adopt-agents-md cannot be combined', EXIT_USAGE);
  if (adopt) requireHuman(io);

  const root = repoRoot(io);
  const result = compileRepo(root);
  const diff = diffOutputs(root, result.files, result.agentsBlock);

  if (check) {
    const outdated = [...diff.write.map((f) => f.path), ...diff.remove, ...(diff.agents.kind === 'write' ? [AGENTS_FILE] : [])].sort(compareText);
    if (outdated.length === 0) {
      io.stdout('ok compile up-to-date\n');
      return EXIT_OK;
    }
    for (const p of outdated) io.stdout(`outdated ${p}\n`);
    return EXIT_ERROR;
  }

  applyOutputs(root, diff);
  let written = diff.write.length + (diff.agents.kind === 'write' ? 1 : 0);
  if (adopt && diff.agents.kind === 'unmanaged') {
    io.stdout(adoptAgentsMd(root, result.agentsBlock));
    written += 1;
  } else if (diff.agents.kind === 'unmanaged') {
    io.stderr('note: AGENTS.md has no keelson block; run "keelson compile --adopt-agents-md" in a terminal to review and add it\n');
  }

  const r = result.report;
  if (r.descriptionTokens > r.budget) {
    io.stderr(`warning: skill descriptions ~${r.descriptionTokens} tokens exceed root_index_tokens ${r.budget}; merge areas\n`);
  }
  io.stdout(
    `ok compile areas=${r.areas} skills=${r.skills} index=${r.indexTokens}/${r.budget} levels=${r.levels} descriptions=~${r.descriptionTokens} written=${written} removed=${diff.remove.length}\n`,
  );
  return EXIT_OK;
};
