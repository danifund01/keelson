# keelson

Anchored, hash-verified memory for coding agents, shared by every agent and model that works on a repository.

> **Status: alpha.** The memory core works (this README covers it). The budgeted index, hooks, metrics and viewer are still to come. Nothing here sends data over the network.

Coding agents start every session from zero. They pay again to load fixed rules and to re-read code they already diagnosed in an earlier session. keelson stores what a session learned (findings, discards, decisions, hypotheses) as small files inside your repository, each anchored to the lines of code that back it. Before any of it is trusted, keelson re-checks those lines: if the code changed, the memory is marked stale instead of being served as fact.

Español: [README.es.md](README.es.md).

## Install (local, from source)

Requires Node 22 or later and git.

```sh
git clone https://github.com/danifund01/keelson
cd keelson
npm install
npm run build
npm link        # makes the `keelson` command available
```

## Use

Run commands from anywhere inside a git repository.

```sh
keelson init
# ok init .keelson

keelson note --kind finding --area auth \
  --summary "Login origins group IPv6 by /64 prefix" \
  --anchor src/lib/auth/origin.ts:10-24 \
  --body "Observed in groupOrigin(); /64 chosen to cover privacy addresses."
# ok 01JD3F... verified

keelson list
# 01JD3F... verified auth Login origins group IPv6 by /64 prefix

keelson verify
# ok verified=1 relocated=0 stale=0 archived=0 errors=0
```

Output is one short line on purpose: agents read it, and every extra line costs tokens.

## Commands

| Command | What it does | Output |
|---|---|---|
| `init` | Creates `.keelson/` with `entries/`, `config.json` (your git email as trusted author) and `.gitignore`. | `ok init .keelson` |
| `note --kind <k> --area <a> --summary <s> [--body <t> \| --body-file <f>] [--anchor path:start-end]... [--load-when <glob>]... [--contradicts <id>]... [--session <s>] [--agent <a>] [--model <m>]` | Records an entry. Kinds: `finding`, `discard`, `decision`, `hypothesis` (`rule` is human only). With anchors it starts `verified`; without anchors, or as `hypothesis`, it starts `hypothesis`. | `ok <id> <status>` |
| `confirm <id> [--session <s>]` | Re-checks the anchors and records a confirmation. A hypothesis becomes `verified` when confirmed from a different session. | `ok <id> <status>` |
| `resolve <id> --by <commit or id>` | Archives an entry that a fix or another entry closed. | `ok <id> archived` |
| `promote <id>` | A person approves an entry. Needs an interactive terminal. | `ok <id> verified` |
| `rule add --area <a> --summary <s> [--body <t> \| --body-file <f>]` | A person adds a rule; its text is stored literally. Needs an interactive terminal. | `ok <id> verified` |
| `verify [--json]` | Re-checks every anchor: moved code is relocated, changed code goes `stale`, deleted or renamed files go `archived`. | `ok verified=N relocated=N stale=N archived=N errors=N` |
| `show <id>` | Re-checks the anchors (saving any change), then prints the status to trust and the entry file. | `effective_status: <status>` and the file |
| `list [--area <a>] [--status <s>] [--json]` | One line per entry with its effective status. A `verified` entry last committed by someone outside `trusted_authors` is shown as `hypothesis`. | `<id> <status> <area> <summary>` |

The session id comes from `--session` or the `KEELSON_SESSION` environment variable.

Exit codes: `0` ok, `1` error (message on stderr as `error: ...`), `2` unknown command, `3` the action needs a person at an interactive terminal.

## Safety

- keelson never reads or anchors `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, gitignored files, or the globs you add to `deny` in `.keelson/config.json`.
- Notes whose text looks like a secret are refused.
- Binary files and files over 1 MiB cannot be anchored.
- Memory is data, not instructions: keelson never executes entry content.

## Format

Entries are plain Markdown files with YAML frontmatter, specified in [spec/FORMAT.md](spec/FORMAT.md). Any tool can read and write them.

## License

MIT
