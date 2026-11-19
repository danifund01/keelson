import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { adoptAgentsMd, applyOutputs, diffOutputs, HumanFileError, type Output } from '../../src/compile/outputs.js';
import { AGENTS_BEGIN, AGENTS_END, GENERATED_MARK } from '../../src/compile/render.js';
import { tmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

const BLOCK = `${AGENTS_BEGIN}\n## Project memory (keelson)\n\nIndex here.\n${AGENTS_END}`;

const FILES: Output[] = [
  { path: '.keelson/index.md', content: `${GENERATED_MARK}\n# Project memory index\n` },
  { path: '.keelson/index/1.md', content: `${GENERATED_MARK}\n# Level 1\n` },
  { path: '.agents/skills/keelson-auth/SKILL.md', content: `---\nname: keelson-auth\n---\n${GENERATED_MARK}\n# Memory: auth\n` },
  { path: '.claude/skills/keelson-auth/SKILL.md', content: `---\nname: keelson-auth\n---\n${GENERATED_MARK}\n# Memory: auth\n` },
];

const read = (repo: TmpRepo, p: string) => readFileSync(join(repo.root, p), 'utf8');

describe('diffOutputs and applyOutputs', () => {
  test('a clean repo gets every file and AGENTS.md; a second diff is empty', () => {
    const repo = tmpRepo();
    const diff = diffOutputs(repo.root, FILES, BLOCK);
    expect(diff.write.map((o) => o.path)).toEqual(FILES.map((o) => o.path));
    expect(diff.agents).toEqual({ kind: 'write', next: `${BLOCK}\n` });
    applyOutputs(repo.root, diff);
    for (const f of FILES) expect(read(repo, f.path)).toBe(f.content);
    expect(read(repo, 'AGENTS.md')).toBe(`${BLOCK}\n`);
    expect(diffOutputs(repo.root, FILES, BLOCK)).toEqual({ write: [], remove: [], agents: { kind: 'current' } });
  });

  test('a human SKILL.md at a generated path is refused and nothing is planned', () => {
    const repo = tmpRepo();
    repo.write('.claude/skills/keelson-auth/SKILL.md', '# My own skill\n');
    expect(() => diffOutputs(repo.root, FILES, BLOCK)).toThrow(HumanFileError);
    expect(() => diffOutputs(repo.root, FILES, BLOCK)).toThrow('.claude/skills/keelson-auth/SKILL.md');
    expect(existsSync(join(repo.root, '.keelson/index.md'))).toBe(false);
    expect(read(repo, '.claude/skills/keelson-auth/SKILL.md')).toBe('# My own skill\n');
  });

  test('generated orphans are removed with their empty folder; unmarked files stay', () => {
    const repo = tmpRepo();
    repo.write('.agents/skills/keelson-old/SKILL.md', `---\nname: keelson-old\n---\n${GENERATED_MARK}\n`);
    repo.write('.gemini/skills/keelson-x/SKILL.md', '# human\n');
    repo.write('.keelson/index/9.md', `${GENERATED_MARK}\n`);
    const diff = diffOutputs(repo.root, FILES, BLOCK);
    expect(diff.remove).toEqual(['.agents/skills/keelson-old/SKILL.md', '.keelson/index/9.md']);
    applyOutputs(repo.root, diff);
    expect(existsSync(join(repo.root, '.agents/skills/keelson-old'))).toBe(false);
    expect(existsSync(join(repo.root, '.keelson/index/9.md'))).toBe(false);
    expect(read(repo, '.gemini/skills/keelson-x/SKILL.md')).toBe('# human\n');
  });

  test('a human AGENTS.md without markers is unmanaged and never changes', () => {
    const repo = tmpRepo();
    repo.write('AGENTS.md', '# Rules\n\nBe nice.\n');
    const diff = diffOutputs(repo.root, FILES, BLOCK);
    expect(diff.agents).toEqual({ kind: 'unmanaged' });
    applyOutputs(repo.root, diff);
    expect(read(repo, 'AGENTS.md')).toBe('# Rules\n\nBe nice.\n');
  });

  test('a CRLF AGENTS.md with a block only gets the block replaced, staying CRLF', () => {
    const repo = tmpRepo();
    const before = 'Intro\r\n\r\n';
    const after = '\r\n\r\nOutro\r\n';
    repo.write('AGENTS.md', `${before}${AGENTS_BEGIN}\r\nold\r\n${AGENTS_END}${after}`);
    applyOutputs(repo.root, diffOutputs(repo.root, FILES, BLOCK));
    const text = read(repo, 'AGENTS.md');
    expect(text).toBe(`${before}${BLOCK.replace(/\n/g, '\r\n')}${after}`);
    expect(text).not.toMatch(/[^\r]\n/);
    expect(diffOutputs(repo.root, FILES, BLOCK).agents).toEqual({ kind: 'current' });
  });

  test.each([
    ['only BEGIN', `${AGENTS_BEGIN}\nx\n`],
    ['two BEGIN', `${AGENTS_BEGIN}\n${AGENTS_BEGIN}\n${AGENTS_END}\n`],
    ['END before BEGIN', `${AGENTS_END}\n${AGENTS_BEGIN}\n`],
    ['only END', `x\n${AGENTS_END}\n`],
  ])('malformed markers (%s) are refused', (_name, text) => {
    const repo = tmpRepo();
    repo.write('AGENTS.md', text);
    expect(() => diffOutputs(repo.root, FILES, BLOCK)).toThrow(/AGENTS.md has malformed keelson markers/);
  });

  test('a generated file checked out with CRLF counts as current', () => {
    const repo = tmpRepo();
    applyOutputs(repo.root, diffOutputs(repo.root, FILES, BLOCK));
    const first = FILES[0];
    if (first === undefined) throw new Error('fixture');
    repo.write(first.path, first.content.replace(/\n/g, '\r\n'));
    expect(diffOutputs(repo.root, FILES, BLOCK).write).toEqual([]);
  });
});

describe('linked outputs', () => {
  test('a skills root linked to another removes each orphan once and finishes the run', () => {
    const repo = tmpRepo();
    mkdirSync(join(repo.root, '.agents', 'skills'), { recursive: true });
    mkdirSync(join(repo.root, '.claude'), { recursive: true });
    symlinkSync(join(repo.root, '.agents', 'skills'), join(repo.root, '.claude', 'skills'), 'junction');
    repo.write('.agents/skills/keelson-old/SKILL.md', `---\nname: keelson-old\n---\n${GENERATED_MARK}\n`);
    repo.write('.gemini/skills/keelson-old/SKILL.md', `---\nname: keelson-old\n---\n${GENERATED_MARK}\n`);
    const diff = diffOutputs(repo.root, FILES, BLOCK);
    expect(() => applyOutputs(repo.root, diff)).not.toThrow();
    expect(existsSync(join(repo.root, '.agents/skills/keelson-old'))).toBe(false);
    expect(existsSync(join(repo.root, '.gemini/skills/keelson-old'))).toBe(false);
    expect(read(repo, 'AGENTS.md')).toBe(`${BLOCK}\n`);
    expect(diffOutputs(repo.root, FILES, BLOCK)).toEqual({ write: [], remove: [], agents: { kind: 'current' } });
  });

  test('a symlinked AGENTS.md updates its target and stays a link', () => {
    const repo = tmpRepo();
    repo.write('CLAUDE.md', `Intro\n\n${AGENTS_BEGIN}\nold\n${AGENTS_END}\n`);
    symlinkSync(join(repo.root, 'CLAUDE.md'), join(repo.root, 'AGENTS.md'), 'file');
    applyOutputs(repo.root, diffOutputs(repo.root, FILES, BLOCK));
    expect(lstatSync(join(repo.root, 'AGENTS.md')).isSymbolicLink()).toBe(true);
    expect(read(repo, 'CLAUDE.md')).toBe(`Intro\n\n${BLOCK}\n`);
  });

  test('a generated path that links outside the repository is refused', () => {
    const repo = tmpRepo();
    const outside = tmpRepo();
    outside.write('AGENTS.md', `${AGENTS_BEGIN}\nold\n${AGENTS_END}\n`);
    symlinkSync(join(outside.root, 'AGENTS.md'), join(repo.root, 'AGENTS.md'), 'file');
    expect(() => diffOutputs(repo.root, FILES, BLOCK)).toThrow(HumanFileError);
    expect(() => diffOutputs(repo.root, FILES, BLOCK)).toThrow(/outside the repository/);
  });
});

describe('adoptAgentsMd', () => {
  test('appends the block after the human text and returns it as + lines', () => {
    const repo = tmpRepo();
    repo.write('AGENTS.md', '# Rules\n');
    const diff = adoptAgentsMd(repo.root, BLOCK);
    const text = read(repo, 'AGENTS.md');
    expect(text).toBe(`# Rules\n\n${BLOCK}\n`);
    expect(diff).toContain(`+${AGENTS_BEGIN}`);
    expect(diff.split('\n').filter((l) => l !== '').every((l) => l.startsWith('+'))).toBe(true);
    expect(diffOutputs(repo.root, FILES, BLOCK).agents).toEqual({ kind: 'current' });
  });

  test('adds the missing final newline and keeps CRLF', () => {
    const repo = tmpRepo();
    repo.write('AGENTS.md', '# Rules\r\nNo newline at end');
    adoptAgentsMd(repo.root, BLOCK);
    expect(read(repo, 'AGENTS.md')).toBe(`# Rules\r\nNo newline at end\r\n\r\n${BLOCK.replace(/\n/g, '\r\n')}\r\n`);
  });

  test('does nothing when AGENTS.md already has a block', () => {
    const repo = tmpRepo();
    repo.write('AGENTS.md', `${BLOCK}\n`);
    expect(adoptAgentsMd(repo.root, BLOCK)).toBe('');
    expect(read(repo, 'AGENTS.md')).toBe(`${BLOCK}\n`);
  });
});
