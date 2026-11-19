import { readFileSync } from 'node:fs';

export interface CliIo {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdinIsTTY: boolean;
  now: () => Date;
}

export type Command = (args: string[], io: CliIo) => Promise<number>;

const commands: Record<string, Command> = {};

const USAGE = `Usage: keelson <command> [options]

Commands:
${Object.keys(commands).sort().map((c) => `  ${c}`).join('\n')}
Options:
  --version  print version
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
  const command = name === undefined ? undefined : commands[name];
  if (command === undefined) {
    io.stderr(USAGE);
    return 2;
  }
  return command(rest, io);
}
