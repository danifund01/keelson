import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { run } from '../../src/cli/run.js';
import { readEntry } from '../../src/store/store.js';
import { fakeIo } from '../helpers/io.js';
import { shallowClone, tmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

const OK_ID = /^ok ([0-9A-HJKMNP-TV-Z]{26}) (\w+)\n$/;

async function cli(repo: TmpRepo, args: string[], opts: { tty?: boolean; env?: Record<string, string> } = {}) {
  const io = fakeIo({ cwd: repo.root, stdinIsTTY: opts.tty ?? false, env: opts.env ?? {} });
  const code = await run(args, io);
  return { code, out: io.out.join(''), err: io.err.join('') };
}

async function initRepo(): Promise<TmpRepo> {
  const repo = tmpRepo();
  repo.write('src/a.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
  expect((await cli(repo, ['init'])).code).toBe(0);
  return repo;
}

async function note(repo: TmpRepo, extra: string[] = [], env: Record<string, string> = {}) {
  const r = await cli(repo, ['note', '--kind', 'finding', '--area', 'core', '--summary', 'a is 1', ...extra], { env });
  const m = OK_ID.exec(r.out);
  return { ...r, id: m?.[1] ?? '', status: m?.[2] ?? '' };
}

const entryFiles = (repo: TmpRepo) => {
  const dir = join(repo.root, '.keelson', 'entries');
  return existsSync(dir) ? readdirSync(dir) : [];
};

describe('init', () => {
  test('creates .keelson with entries, config and gitignore', async () => {
    const repo = tmpRepo();
    const r = await cli(repo, ['init']);
    expect(r).toEqual({ code: 0, out: 'ok init .keelson\n', err: '' });
    expect(existsSync(join(repo.root, '.keelson', 'entries'))).toBe(true);
    expect(JSON.parse(readFileSync(join(repo.root, '.keelson', 'config.json'), 'utf8'))).toEqual({ trusted_authors: ['owner@example.com'] });
    expect(readFileSync(join(repo.root, '.keelson', '.gitignore'), 'utf8')).toBe('.local/\n');
  });

  test('second init exits 1', async () => {
    const repo = await initRepo();
    const r = await cli(repo, ['init']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^error: .*already/);
  });
});

describe('note', () => {
  test('note with anchor prints ok <id> verified and writes the entry', async () => {
    const repo = await initRepo();
    const r = await note(repo, ['--anchor', 'src/a.ts:1-2', '--body', 'seen in a.ts', '--load-when', 'src/**', '--session', 's1', '--agent', 'claude-code', '--model', 'opus']);
    expect(r.code).toBe(0);
    expect(r.status).toBe('verified');
    const e = readEntry(repo.root, r.id);
    expect(e.anchors[0]?.range).toEqual([1, 2]);
    expect(e.loadWhen).toEqual(['src/**']);
    expect(e.provenance).toMatchObject({ session: 's1', agent: 'claude-code', model: 'opus' });
    expect(e.body).toBe('seen in a.ts');
  });

  test('note without anchors is a hypothesis; session comes from KEELSON_SESSION', async () => {
    const repo = await initRepo();
    const r = await note(repo, [], { KEELSON_SESSION: 'env-session' });
    expect(r.status).toBe('hypothesis');
    expect(readEntry(repo.root, r.id).provenance.session).toBe('env-session');
  });

  test('note --body-file reads the body from a file', async () => {
    const repo = await initRepo();
    repo.write('notes/body.md', 'Evidencia con acentos.\n');
    const r = await note(repo, ['--body-file', 'notes/body.md']);
    expect(readEntry(repo.root, r.id).body).toBe('Evidencia con acentos.\n');
  });

  test('note --anchor src\\a.ts:1-2 stores src/a.ts', async () => {
    const repo = await initRepo();
    const r = await note(repo, ['--anchor', 'src\\a.ts:1-2']);
    expect(readEntry(repo.root, r.id).anchors[0]?.path).toBe('src/a.ts');
  });

  test('note with denied anchor writes no file', async () => {
    const repo = await initRepo();
    repo.write('.env', 'SECRET=x\n');
    const r = await note(repo, ['--anchor', '.env:1-1']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^error: .*denied/);
    expect(r.out).toBe('');
    expect(entryFiles(repo)).toEqual([]);
  });

  test('note with a denied --body-file is refused', async () => {
    const repo = await initRepo();
    repo.write('.env.local', 'X=1\n');
    const r = await note(repo, ['--body-file', '.env.local']);
    expect(r.code).toBe(1);
    expect(entryFiles(repo)).toEqual([]);
  });

  test('note with a --body-file outside the repo that matches a deny glob is refused', async () => {
    const repo = await initRepo();
    const elsewhere = tmpRepo();
    elsewhere.write('.env', 'NEXT_PUBLIC_SITE=hello\n');
    elsewhere.write('keys/server.pem', 'not really a key\n');
    for (const f of ['.env', 'keys/server.pem']) {
      const r = await note(repo, ['--body-file', join(elsewhere.root, f)]);
      expect(r.code, f).toBe(1);
      expect(r.err).toMatch(/denied/);
    }
    expect(entryFiles(repo)).toEqual([]);
  });

  test('note with a --body-file outside the repo that is not denied is accepted', async () => {
    const repo = await initRepo();
    const elsewhere = tmpRepo();
    elsewhere.write('notes.md', 'plain evidence\n');
    const r = await note(repo, ['--body-file', join(elsewhere.root, 'notes.md')]);
    expect(r.code).toBe(0);
    expect(readEntry(repo.root, r.id).body).toBe('plain evidence\n');
  });

  test('note validation errors exit 1: missing summary, bad kind, bad anchor syntax, unknown flag', async () => {
    const repo = await initRepo();
    expect((await cli(repo, ['note', '--kind', 'finding', '--area', 'core'])).code).toBe(1);
    expect((await cli(repo, ['note', '--kind', 'rumor', '--area', 'core', '--summary', 's'])).code).toBe(1);
    expect((await note(repo, ['--anchor', 'src/a.ts'])).code).toBe(1);
    expect((await note(repo, ['--anchor', 'src/a.ts:2-1'])).code).toBe(1);
    expect((await note(repo, ['--frobnicate'])).code).toBe(1);
    expect((await note(repo, ['--body', 'x', '--body-file', 'y'])).code).toBe(1);
    expect(entryFiles(repo)).toEqual([]);
  });

  test('note --kind rule is refused for agents', async () => {
    const repo = await initRepo();
    const r = await cli(repo, ['note', '--kind', 'rule', '--area', 'core', '--summary', 'always x']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/rule requires a human/);
  });

  test('note --contradicts marks both entries disputed', async () => {
    const repo = await initRepo();
    const first = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    const second = await note(repo, ['--contradicts', first.id]);
    expect(second.status).toBe('disputed');
    expect(readEntry(repo.root, first.id).status).toBe('disputed');
  });

  test('note --contradicts with an unknown id is refused', async () => {
    const repo = await initRepo();
    const r = await note(repo, ['--contradicts', '01JD9999999999999999999999']);
    expect(r.code).toBe(1);
    expect(entryFiles(repo)).toEqual([]);
  });
});

describe('confirm, resolve, promote, rule add', () => {
  test('confirm from another session verifies a hypothesis', async () => {
    const repo = await initRepo();
    const h = await note(repo, ['--session', 's1']);
    const r = await cli(repo, ['confirm', h.id, '--session', 's2']);
    expect(r).toEqual({ code: 0, out: `ok ${h.id} verified\n`, err: '' });
  });

  test('confirm from the same session keeps hypothesis', async () => {
    const repo = await initRepo();
    const h = await note(repo, ['--session', 's1']);
    expect((await cli(repo, ['confirm', h.id], { env: { KEELSON_SESSION: 's1' } })).out).toBe(`ok ${h.id} hypothesis\n`);
  });

  test('confirm of an entry whose anchor changed fails and marks it stale', async () => {
    const repo = await initRepo();
    const h = await note(repo, ['--kind', 'hypothesis', '--anchor', 'src/a.ts:1-1', '--session', 's1']);
    repo.write('src/a.ts', 'changed\n');
    const r = await cli(repo, ['confirm', h.id, '--session', 's2']);
    expect(r.code).toBe(1);
    expect(readEntry(repo.root, h.id).status).toBe('stale');
  });

  test('confirm of an unknown id exits 1', async () => {
    const repo = await initRepo();
    const r = await cli(repo, ['confirm', '01JD9999999999999999999999']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not found/);
  });

  test('resolve archives with --by', async () => {
    const repo = await initRepo();
    const e = await note(repo);
    expect(await cli(repo, ['resolve', e.id, '--by', 'abc1234'])).toEqual({ code: 0, out: `ok ${e.id} archived\n`, err: '' });
    expect(readEntry(repo.root, e.id).resolvedBy).toBe('abc1234');
    expect((await cli(repo, ['resolve', e.id])).code).toBe(1);
  });

  test('promote with stdinIsTTY false exits 3 and changes nothing', async () => {
    const repo = await initRepo();
    const h = await note(repo);
    const before = readFileSync(join(repo.root, '.keelson', 'entries', `${h.id}.md`), 'utf8');
    const r = await cli(repo, ['promote', h.id]);
    expect(r.code).toBe(3);
    expect(r.err).toBe('error: requires an interactive terminal (human only)\n');
    expect(readFileSync(join(repo.root, '.keelson', 'entries', `${h.id}.md`), 'utf8')).toBe(before);
  });

  test('promote in a terminal verifies', async () => {
    const repo = await initRepo();
    const h = await note(repo);
    expect((await cli(repo, ['promote', h.id], { tty: true })).out).toBe(`ok ${h.id} verified\n`);
  });

  test('rule add without a terminal exits 3 and writes nothing', async () => {
    const repo = await initRepo();
    const r = await cli(repo, ['rule', 'add', '--area', 'money', '--summary', 'Use decimal.js']);
    expect(r.code).toBe(3);
    expect(entryFiles(repo)).toEqual([]);
  });

  test('rule add in a terminal creates a verified rule with the literal body', async () => {
    const repo = await initRepo();
    const body = 'Dinero con decimal.js;  HALF_UP.\n';
    const r = await cli(repo, ['rule', 'add', '--area', 'money', '--summary', 'Use decimal.js', '--body', body], { tty: true });
    expect(r.code).toBe(0);
    const [, id, status] = OK_ID.exec(r.out) ?? [];
    expect(status).toBe('verified');
    const e = readEntry(repo.root, id ?? '');
    expect(e.kind).toBe('rule');
    expect(e.body).toBe(body);
    expect(e.provenance.author).toBe('owner@example.com');
  });

  test('rule with an unknown subcommand exits 2', async () => {
    const repo = await initRepo();
    expect((await cli(repo, ['rule', 'remove'], { tty: true })).code).toBe(2);
  });
});

describe('verify, show, list', () => {
  test('verify prints counts', async () => {
    const repo = await initRepo();
    await note(repo, ['--anchor', 'src/a.ts:1-1']);
    const moved = await note(repo, ['--anchor', 'src/a.ts:3-3']);
    await note(repo, ['--anchor', 'src/a.ts:2-2']);
    repo.write('src/a.ts', 'export const a = 1;\nexport const b = 22;\n// new\nexport const c = 3;\n');
    const r = await cli(repo, ['verify']);
    expect(r).toEqual({ code: 0, out: 'ok verified=1 relocated=1 stale=1 archived=0 errors=0\n', err: '' });
    expect(readEntry(repo.root, moved.id).anchors[0]?.range).toEqual([4, 4]);
  });

  test('verify --json lists each result', async () => {
    const repo = await initRepo();
    const e = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    const r = await cli(repo, ['verify', '--json']);
    expect(JSON.parse(r.out)).toEqual({ results: [{ id: e.id, reason: 'ok', status: 'verified', changed: false }], errors: [] });
  });

  test('verify exits 1 when an entry file is corrupt', async () => {
    const repo = await initRepo();
    repo.write('.keelson/entries/01JD0000000000000000000099.md', 'garbage');
    const r = await cli(repo, ['verify']);
    expect(r.code).toBe(1);
    expect(r.out).toBe('ok verified=0 relocated=0 stale=0 archived=0 errors=1\n');
    expect(r.err).toContain('01JD0000000000000000000099.md');
  });

  test('show prints the effective status, then the entry file', async () => {
    const repo = await initRepo();
    const e = await note(repo);
    const r = await cli(repo, ['show', e.id]);
    expect(r.code).toBe(0);
    expect(r.out).toBe('effective_status: hypothesis\n' + readFileSync(join(repo.root, '.keelson', 'entries', `${e.id}.md`), 'utf8'));
    expect((await cli(repo, ['show', '01JD9999999999999999999999'])).code).toBe(1);
  });

  test('show of a verified entry committed by an untrusted author reports hypothesis', async () => {
    const repo = await initRepo();
    const v = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    repo.commit('external memory', 'stranger@example.org');
    expect((await cli(repo, ['show', v.id])).out.split('\n')[0]).toBe('effective_status: hypothesis');
  });

  test('show re-checks anchors and reports and persists stale', async () => {
    const repo = await initRepo();
    const v = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    repo.write('src/a.ts', 'changed\n');
    const r = await cli(repo, ['show', v.id]);
    expect(r.out.split('\n')[0]).toBe('effective_status: stale');
    expect(r.out).toContain('status: stale');
    expect(readEntry(repo.root, v.id).status).toBe('stale');
  });

  test('list prints one line per entry and filters by area and status', async () => {
    const repo = await initRepo();
    const v = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    const h = await cli(repo, ['note', '--kind', 'finding', '--area', 'ui', '--summary', 'theme is dark']);
    const hid = OK_ID.exec(h.out)?.[1];
    const all = await cli(repo, ['list']);
    expect(all.code).toBe(0);
    expect(all.out).toBe(`${v.id} verified core a is 1\n${hid} hypothesis ui theme is dark\n`);
    expect((await cli(repo, ['list', '--area', 'ui'])).out).toBe(`${hid} hypothesis ui theme is dark\n`);
    expect((await cli(repo, ['list', '--status', 'verified'])).out).toBe(`${v.id} verified core a is 1\n`);
    const json = JSON.parse((await cli(repo, ['list', '--json'])).out);
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ id: v.id, status: 'verified', area: 'core', summary: 'a is 1' });
  });

  test('list shows hypothesis for verified entry committed by author outside trustedAuthors', async () => {
    const repo = await initRepo();
    const v = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    repo.commit('external memory', 'stranger@example.org');
    expect((await cli(repo, ['list'])).out).toBe(`${v.id} hypothesis core a is 1\n`);
  });

  test('list keeps verified for an entry committed by a trusted author', async () => {
    const repo = await initRepo();
    const v = await note(repo, ['--anchor', 'src/a.ts:1-1']);
    repo.commit('own memory');
    expect((await cli(repo, ['list'])).out).toBe(`${v.id} verified core a is 1\n`);
  });

  test('list keeps hypothesis when an owner commits a relocation of an external entry (#4)', async () => {
    const repo = await initRepo();
    repo.commit('seed');
    const v = await note(repo, ['--anchor', 'src/a.ts:3-3']);
    repo.commit('external memory', 'stranger@example.org');
    repo.write('src/a.ts', '// top\nexport const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
    expect((await cli(repo, ['verify'])).out).toContain('relocated=1');
    repo.commit('owner relocation');
    expect((await cli(repo, ['list'])).out).toBe(`${v.id} hypothesis core a is 1\n`);
  });

  test('list in a shallow clone exits 1 with "shallow"', async () => {
    const repo = await initRepo();
    await note(repo, ['--anchor', 'src/a.ts:1-1']);
    repo.commit('one');
    repo.write('x.txt', 'x\n');
    repo.commit('two');
    const io = fakeIo({ cwd: shallowClone(repo) });
    expect(await run(['list'], io)).toBe(1);
    expect(io.err.join('')).toMatch(/^error: .*shallow/);
  });

  test('list reports corrupt files on stderr and exits 0', async () => {
    const repo = await initRepo();
    repo.write('.keelson/entries/01JD0000000000000000000099.md', 'garbage');
    const r = await cli(repo, ['list']);
    expect(r.code).toBe(0);
    expect(r.err).toContain('01JD0000000000000000000099.md');
  });
});

describe('outside a repository', () => {
  test('commands outside a git repo exit 1 with "not a git repository"', async () => {
    const io = fakeIo({ cwd: process.platform === 'win32' ? 'C:\\' : '/' });
    const code = await run(['list'], io);
    expect(code).toBe(1);
    expect(io.err.join('')).toMatch(/^error: not a git repository/);
  });
});
