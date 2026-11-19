import type { Entry } from '../../src/format/schema.js';

let counter = 0;

export function makeId(n = ++counter): string {
  return '01JD' + String(n).padStart(22, '0');
}

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: makeId(),
    kind: 'finding',
    status: 'verified',
    area: 'core',
    summary: 'A finding',
    loadWhen: [],
    anchors: [],
    provenance: { created: '2026-11-19T12:00:00.000Z' },
    confirmations: [],
    contradicts: [],
    supersedes: [],
    resolvedBy: null,
    estTokens: 3,
    body: 'Body.\n',
    ...overrides,
  };
}
