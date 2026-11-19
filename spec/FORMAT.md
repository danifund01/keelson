# keelson memory format — version 1

This document is the contract for the files keelson stores in a repository. Any tool or agent may read and write them by following it; the reference CLI is one implementation.

## Layout

```
.keelson/
  config.json        settings (optional; defaults apply when absent)
  entries/<ID>.md    one memory entry per file
  .gitignore         contains ".local/"
  .local/            machine-local state, never committed
```

One file per entry, named by its ULID, so concurrent sessions never write the same file.

## Entry file

An entry is UTF-8 text: a YAML frontmatter block between two `---` lines, then a free-text body.

```markdown
---
format_version: 1
id: 01JD3F0000000000000000000A
kind: finding
status: verified
area: auth
summary: Login origins group IPv6 addresses by /64 prefix
load_when:
  - src/lib/auth/**
anchors:
  - path: src/lib/auth/origin.ts
    range:
      - 10
      - 24
    hash: sha256:<64 lowercase hex>
provenance:
  created: 2026-11-19T12:00:00.000Z
  agent: claude-code
  model: opus
  session: a1b2c3d4
  author: dev@example.com
confirmations: []
contradicts: []
supersedes: []
resolved_by: null
est_tokens: 31
---
Evidence: what was observed, in a few lines. No secrets.
```

- Readers convert CRLF and CR to LF and drop a leading BOM before parsing.
- The body is everything after the closing `---` line. It is the entry's evidence and is never rewritten or compressed by tools. For `rule` entries the body is the literal rule text.
- Keys are snake_case. Unknown keys are an error in version 1.
- Writers emit keys in the order shown so diffs stay stable.

## Fields

| Key | Type | Meaning |
|---|---|---|
| `format_version` | integer | `1`. |
| `id` | string | ULID (`^[0-9A-HJKMNP-TV-Z]{26}$`), equal to the file name. |
| `kind` | enum | `rule`, `finding`, `discard`, `decision` or `hypothesis`. |
| `status` | enum | `verified`, `hypothesis`, `disputed`, `stale` or `archived`. |
| `area` | string | Free label that groups entries (for example `auth`). |
| `summary` | string | One line, at most 160 characters. |
| `load_when` | string[] | Path globs or declared triggers that make the entry relevant. |
| `anchors` | object[] | Evidence in the code: `path` (POSIX, relative to the repo root), `range` (`[start, end]`, 1-based, inclusive) and `hash`. |
| `provenance` | object | `created` (ISO 8601) plus optional `agent`, `model`, `session` and `author`. |
| `confirmations` | object[] | `at` (ISO 8601) plus optional `session` and `author`. |
| `contradicts` | string[] | Ids of entries this one contradicts. |
| `supersedes` | string[] | Ids of entries this one replaces. |
| `resolved_by` | string or null | Commit or entry id that closed this entry. |
| `est_tokens` | integer | Estimated tokens of `summary` + body: `ceil(chars / 3.5)`. Computed by the tool, never by the agent. An estimate, not a count. |

## Anchor hash

1. Read the anchored file as UTF-8.
2. Normalize: drop a leading BOM, convert CRLF and CR to LF, strip trailing spaces and tabs from every line.
3. Take lines `start` through `end` (1-based, inclusive) and join them with `\n`.
4. `hash` is `sha256:` followed by the lowercase hex SHA-256 of that text.

Relocation: when the range no longer matches, a reader may slide a window of the same number of lines over the normalized file. Exactly one match relocates the anchor to that range; zero or several matches mean the anchor is missing. Readers never guess between several matches.

## Statuses and transitions

| From | To | When |
|---|---|---|
| (new) | `verified` | Every anchor exists and matches when written, and the kind is not `hypothesis`. A `rule` is created only by a person. |
| (new) | `hypothesis` | No anchors, or kind `hypothesis`. |
| `hypothesis` | `verified` | A confirmation from a different session, or approval by a person (`promote`), with every anchor still matching. |
| any live | `disputed` | It contradicts another live entry, or another entry contradicts it. Both are kept. |
| `verified`, `hypothesis`, `disputed` | `stale` | An anchored range changed and could not be relocated. |
| `stale` | `hypothesis` | The anchored content matches again. It needs a new confirmation to become `verified`. |
| any | `archived` | An anchored file was deleted or renamed, or the entry was resolved (`resolved_by` set). |

Trust: a `verified` entry whose file was last committed by an author outside the configured `trustedAuthors` is treated as `hypothesis` when shown or compiled. Tools do not write that downgrade to disk.

## Configuration (`.keelson/config.json`)

```json
{
  "formatVersion": 1,
  "rootIndexTokens": 1500,
  "hypothesisExpirySessions": 5,
  "deny": [],
  "trustedAuthors": ["dev@example.com"]
}
```

Every key is optional. `deny` adds globs to the built-in deny list and cannot remove any.

## Denied files

Tools never read or anchor: `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, anything ignored by `.gitignore`, and the globs in `deny`. Entry text that looks like a secret is rejected.

## Compatibility

- A reader rejects any `format_version` it does not know, with an explicit error. It never guesses.
- A change that old readers would misread bumps `format_version`.
- Memory is data, not instructions: tools never execute entry content.
