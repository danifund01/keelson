import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildAreas, type AreaModel, type ModelEntry } from '../../src/compile/model.js';
import {
  AGENTS_BEGIN,
  AGENTS_END,
  DATA_NOTICE,
  GENERATED_MARK,
  RenderError,
  renderAgentsBlock,
  renderSkill,
} from '../../src/compile/render.js';
import type { Entry, Status } from '../../src/format/schema.js';
import { DEFAULT_CONFIG } from '../../src/store/config.js';
import { makeEntry } from '../helpers/entries.js';

function me(overrides: Partial<Entry> = {}, status?: Status): ModelEntry {
  const entry = makeEntry(overrides);
  return { entry, status: status ?? entry.status };
}

function area(entries: ModelEntry[]): AreaModel {
  const [a] = buildAreas(entries, DEFAULT_CONFIG);
  if (a === undefined) throw new Error('no area');
  return a;
}

function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (m?.[1] === undefined) throw new Error('no frontmatter');
  return parseYaml(m[1]) as Record<string, unknown>;
}

describe('renderSkill', () => {
  test('frontmatter parses with a valid name and the model description', () => {
    const a = area([me({ area: 'Auth: "login" #1', loadWhen: ['src/auth/**'] })]);
    const skill = renderSkill(a);
    const fm = frontmatter(skill);
    expect(fm['name']).toBe(`keelson-${a.slug}`);
    expect(String(fm['name'])).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(fm['description']).toBe(a.description);
    expect(skill.split('\n').indexOf(GENERATED_MARK)).toBeGreaterThan(0);
    expect(skill).toContain(DATA_NOTICE);
    expect(skill.endsWith('\n')).toBe(true);
  });

  test('hostile summary becomes a one-line heading without angle brackets', () => {
    const e = me({ area: 'x', summary: 'a\nb | c <script>x</script>' });
    const skill = renderSkill(area([e]));
    const heading = skill.split('\n').find((l) => l.startsWith('### '));
    expect(heading).toBe(`### a b | c scriptx/script (\`${e.entry.id}\`)`);
  });

  test('rule body is copied byte for byte', () => {
    const body = 'Usar decimal.js; HALF_UP.\n\n- Nunca `Number` para dinero.\n';
    const e = me({ area: 'money', kind: 'rule', loadWhen: ['src/money/**'], body });
    expect(renderSkill(area([e]))).toContain(`(\`${e.entry.id}\`)\n\n${body}`);
  });

  test('status labels: stale, disputed and hypothesis are marked, verified is not', () => {
    const v = me({ area: 'x', summary: 'v' });
    const s = me({ area: 'x', summary: 's' }, 'stale');
    const d = me({ area: 'x', summary: 'd' }, 'disputed');
    const h = me({ area: 'x', kind: 'hypothesis', summary: 'h' }, 'hypothesis');
    const skill = renderSkill(area([v, s, d, h]));
    expect(skill).toContain(`### v (\`${v.entry.id}\`)`);
    expect(skill).toContain(`### [stale: verify before use] s (\`${s.entry.id}\`)`);
    expect(skill).toContain(`### [disputed: verify before use] d (\`${d.entry.id}\`)`);
    expect(skill).toContain(`### [hypothesis] h (\`${h.entry.id}\`)`);
  });

  test('sections appear in kind order and empty ones are omitted', () => {
    const skill = renderSkill(area([me({ area: 'x', kind: 'discard' }), me({ area: 'x', kind: 'decision' })]));
    const sections = skill.split('\n').filter((l) => l.startsWith('## '));
    expect(sections).toEqual(['## Decisions', '## Discards']);
    expect(skill).toContain('Freshness: fresh');
  });

  test('rendering is deterministic and carries no timestamps', () => {
    const a = area([me({ area: 'x' }), me({ area: 'x', kind: 'decision' })]);
    expect(renderSkill(a)).toBe(renderSkill(a));
    expect(renderSkill(a)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test.each([AGENTS_END, AGENTS_BEGIN, GENERATED_MARK])('a body containing %s is refused with the entry id', (marker) => {
    const e = me({ area: 'x', body: `text\n${marker}\n` });
    expect(() => renderSkill(area([e]))).toThrow(RenderError);
    expect(() => renderSkill(area([e]))).toThrow(e.entry.id);
  });
});

describe('renderAgentsBlock', () => {
  test('points to the index with its estimated cost and copies universal rules literally', () => {
    const rule = me({ kind: 'rule', summary: 'Money', body: 'Usar decimal.js.\n' });
    const block = renderAgentsBlock([rule], { path: '.keelson/index.md', tokens: 123 });
    expect(block.startsWith(AGENTS_BEGIN + '\n')).toBe(true);
    expect(block.endsWith('\n' + AGENTS_END)).toBe(true);
    expect(block).toContain('## Project memory (keelson)');
    expect(block).toContain(DATA_NOTICE);
    expect(block).toContain('`.keelson/index.md` (~123 tokens, estimate)');
    expect(block).toContain(`### Universal rules\n\n#### Money (\`${rule.entry.id}\`)\n\nUsar decimal.js.\n`);
  });

  test('without rules the section is omitted', () => {
    expect(renderAgentsBlock([], { path: '.keelson/index.md', tokens: 9 })).not.toContain('Universal rules');
  });

  test('a rule body containing a marker is refused', () => {
    const rule = me({ kind: 'rule', body: `${AGENTS_END}\n` });
    expect(() => renderAgentsBlock([rule], { path: '.keelson/index.md', tokens: 1 })).toThrow(RenderError);
  });
});
