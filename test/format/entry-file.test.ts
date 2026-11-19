import { describe, expect, test } from 'vitest';
import { EntryParseError, parseEntryFile, serializeEntry } from '../../src/format/entry-file.js';
import type { Entry } from '../../src/format/schema.js';

const ID = '01JD0000000000000000000000';
const OTHER = '01JD0000000000000000000001';

function sample(overrides: Partial<Entry> = {}): Entry {
  return {
    id: ID,
    kind: 'finding',
    status: 'verified',
    area: 'auth',
    summary: 'Login origins group IPv6 by /64 prefix',
    loadWhen: ['src/lib/auth/**'],
    anchors: [{ path: 'src/lib/auth/origin.ts', range: [10, 24], hash: 'sha256:' + 'a'.repeat(64) }],
    provenance: { created: '2026-11-19T12:00:00.000Z', agent: 'claude-code', model: 'opus', session: 's1', author: 'dev@example.com' },
    confirmations: [{ at: '2026-11-19T13:00:00.000Z', session: 's2' }],
    contradicts: [OTHER],
    supersedes: [],
    resolvedBy: null,
    estTokens: 42,
    body: 'Evidencia: la función agrupa por /64.\n---\nlínea con espacios finales   \n',
    ...overrides,
  };
}

function withFrontmatter(mutate: (fm: string) => string): string {
  const text = serializeEntry(sample());
  const end = text.indexOf('\n---\n', 4);
  return mutate(text.slice(0, end)) + text.slice(end);
}

describe('entry file', () => {
  test('roundtrip preserves every field and body byte-for-byte', () => {
    const e = sample();
    expect(parseEntryFile(serializeEntry(e))).toEqual(e);
  });

  test('roundtrip with empty body and optional provenance absent', () => {
    const e = sample({ body: '', provenance: { created: '2026-11-19T12:00:00.000Z' }, confirmations: [], contradicts: [], resolvedBy: 'abc1234' });
    expect(parseEntryFile(serializeEntry(e))).toEqual(e);
  });

  test('serialized frontmatter uses snake_case keys and format_version 1', () => {
    const text = serializeEntry(sample());
    expect(text.startsWith('---\nformat_version: 1\n')).toBe(true);
    expect(text).toContain('load_when:');
    expect(text).toContain('resolved_by:');
    expect(text).toContain('est_tokens: 42');
    expect(text).not.toContain('loadWhen');
  });

  test('serialization is stable for the same entry', () => {
    expect(serializeEntry(sample())).toBe(serializeEntry(sample()));
  });

  test('rejects unknown format_version', () => {
    const text = withFrontmatter((fm) => fm.replace('format_version: 1', 'format_version: 2'));
    expect(() => parseEntryFile(text)).toThrow(EntryParseError);
    expect(() => parseEntryFile(text)).toThrow(/format_version 2/);
  });

  test('rejects unknown kind', () => {
    const text = withFrontmatter((fm) => fm.replace('kind: finding', 'kind: rumor'));
    expect(() => parseEntryFile(text)).toThrow(EntryParseError);
  });

  test('rejects summary longer than 160 chars', () => {
    expect(() => parseEntryFile(serializeEntry(sample({ summary: 'x'.repeat(161) })))).toThrow(EntryParseError);
    expect(() => parseEntryFile(serializeEntry(sample({ summary: 'x'.repeat(160) })))).not.toThrow();
  });

  test('rejects id that is not a ULID', () => {
    expect(() => parseEntryFile(serializeEntry(sample({ id: 'not-a-ulid' })))).toThrow(EntryParseError);
    expect(() => parseEntryFile(serializeEntry(sample({ id: '01JD000000000000000000000I' })))).toThrow(EntryParseError);
  });

  test('parses CRLF file identically to LF', () => {
    const lf = serializeEntry(sample({ body: 'one\ntwo\n' }));
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(parseEntryFile(crlf)).toEqual(parseEntryFile(lf));
  });

  test('rejects text without frontmatter', () => {
    expect(() => parseEntryFile('hello')).toThrow(EntryParseError);
    expect(() => parseEntryFile('---\nformat_version: 1\n')).toThrow(EntryParseError);
  });

  test('rejects malformed yaml with EntryParseError', () => {
    expect(() => parseEntryFile('---\nkind: [unclosed\n---\n')).toThrow(EntryParseError);
  });

  test('rejects anchor with inverted range or bad hash', () => {
    const bad = sample({ anchors: [{ path: 'a.ts', range: [5, 2], hash: 'sha256:' + 'a'.repeat(64) }] });
    expect(() => parseEntryFile(serializeEntry(bad))).toThrow(EntryParseError);
    const badHash = sample({ anchors: [{ path: 'a.ts', range: [1, 2], hash: 'md5:x' }] });
    expect(() => parseEntryFile(serializeEntry(badHash))).toThrow(EntryParseError);
  });
});
