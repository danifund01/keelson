# keelson

Anchored, hash-verified memory for coding agents, shared by every agent and model that works on a repository.

> **Status: alpha.** The memory core and the budgeted index work (this README covers them). Hooks, metrics and the viewer are still to come. Nothing here sends data over the network.

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
| `list [--area <a>] [--status <s>] [--json]` | One line per entry with its effective status. A `verified` entry is shown as `hypothesis` if anyone outside `trusted_authors` committed a change to its file. | `<id> <status> <area> <summary>` |
| `compile [--check] [--adopt-agents-md]` | Re-checks anchors and builds the root index (`.keelson/index.md`, within `root_index_tokens`), one skill per area in `.agents/skills`, `.claude/skills` and `.gemini/skills`, and the keelson block of `AGENTS.md`. `--check` writes nothing and exits 1 if any of that is out of date. | `ok compile areas=N skills=N index=T/B levels=L descriptions=~D written=W removed=R` |

The session id comes from `--session` or the `KEELSON_SESSION` environment variable.

Exit codes: `0` ok, `1` error (message on stderr as `error: ...`) or `compile --check` found outdated files, `2` unknown command or bad usage, `3` the action needs a person at an interactive terminal.

## Compile for agents

`keelson compile` turns memory into files that agents already read. Commit them, so agents without keelson (for example in the cloud) see the same memory. If two branches conflict on them, run `keelson compile` again instead of merging by hand.

- **Index:** `.keelson/index.md` lists each area with when to load it, its estimated cost, a summary and its freshness. It never exceeds `root_index_tokens` (default 1500): with many areas it splits into nested levels under `.keelson/index/`.
- **Skills:** one `SKILL.md` per area, copied to each agent's folder. Its `description` is the trigger. Stale, disputed and hypothesis items are labeled "verify before use".
- **AGENTS.md:** keelson owns only the block between `<!-- keelson:begin ... -->` and `<!-- keelson:end -->`. It holds the universal rules (rules without `load_when`) and a pointer to the index. If your `AGENTS.md` has no block, keelson never touches it: run `keelson compile --adopt-agents-md` yourself in a terminal to see the block and append it. Claude Code users can import it from `CLAUDE.md` with `@AGENTS.md`.
- **Human files are never overwritten.** Every generated file carries `<!-- keelson:generated do-not-edit -->`. A file without that mark at a generated path stops the compile.
- **Summaries in always-loaded text come from people.** Set `areas.<name>.description` in `.keelson/config.json`. Without it, the summary is derived from the area name and its globs, never from what agents wrote.
- **Skill descriptions are fixed context** in agents that list skills. `compile` reports their estimated total and warns when it exceeds `root_index_tokens`.

In CI, trust needs the full git history:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npx keelson compile --check
```

## Safety

- keelson never reads or anchors `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, gitignored files, or the globs you add to `deny` in `.keelson/config.json`.
- Notes whose text looks like a secret are refused.
- Binary files and files over 1 MiB cannot be anchored.
- Memory is data, not instructions: keelson never executes entry content.

## Format

Entries are plain Markdown files with YAML frontmatter, specified in [spec/FORMAT.md](spec/FORMAT.md). Any tool can read and write them.

## License

MIT
