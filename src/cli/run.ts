import { readFileSync } from 'node:fs';
import { compile } from './commands/compile.js';
import { confirm } from './commands/confirm.js';
import { init } from './commands/init.js';
import { list } from './commands/list.js';
import { note } from './commands/note.js';
import { promote } from './commands/promote.js';
import { resolve } from './commands/resolve.js';
import { rule } from './commands/rule.js';
import { show } from './commands/show.js';
import { verify } from './commands/verify.js';
import { CliError, EXIT_ERROR, EXIT_USAGE } from './shared.js';

export interface CliIo {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdinIsTTY: boolean;
  now: () => Date;
}

export type Command = (args: string[], io: CliIo) => Promise<number>;

const commands: Record<string, Command> = { init, note, confirm, resolve, promote, rule, verify, show, list, compile };

const USAGE = `Usage: keelson <command> [options]

Commands:
  init                     create .keelson/ in this repository
  note --kind --area --summary [--body|--body-file] [--anchor path:start-end]...
                           record a finding, discard, decision or hypothesis
  confirm <id>             confirm an entry from this session
  resolve <id> --by <ref>  archive an entry closed by a commit or entry
  promote <id>             approve an entry (human only)
  rule add --area --summary [--body|--body-file]
                           add a rule (human only)
  verify [--json]          re-check every anchor and update freshness
  show <id>                print an entry
  list [--area a] [--status s] [--json]
                           one line per entry with its effective status
  compile [--check] [--adopt-agents-md]
                           build the index, area skills and AGENTS.md block

Options:
  --version                print version
`;

function packageVersion(): string {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  const pkg: unknown = JSON.parse(readFileSync(pkgUrl, 'utf8'));
  if (typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string') {
    return pkg.version;
  }
  throw new Error('package.json has no version');
}

export async function run(argv: string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === '--version') {
    io.stdout(`${packageVersion()}\n`);
    return 0;
  }
  const command = name === undefined || !Object.hasOwn(commands, name) ? undefined : commands[name];
  if (command === undefined) {
    io.stderr(USAGE);
    return EXIT_USAGE;
  }
  try {
    return await command(rest, io);
  } catch (e) {
    io.stderr(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    return e instanceof CliError ? e.code : EXIT_ERROR;
  }
}
