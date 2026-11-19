import { parse, stringify } from 'yaml';
import { diskFrontmatterSchema, FORMAT_VERSION, type DiskFrontmatter, type Entry } from './schema.js';

export class EntryParseError extends Error {
  override name = 'EntryParseError';
}

const OPEN = '---\n';
const CLOSE = '\n---\n';

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function parseEntryFile(text: string): Entry {
  const lf = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!lf.startsWith(OPEN)) throw new EntryParseError('missing frontmatter: file must start with ---');
  const end = lf.indexOf(CLOSE, OPEN.length - 1);
  if (end === -1) throw new EntryParseError('missing closing --- after frontmatter');
  const yamlText = lf.slice(OPEN.length, end + 1);
  const body = lf.slice(end + CLOSE.length);

  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (e) {
    throw new EntryParseError(`invalid yaml: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof raw !== 'object' || raw === null) throw new EntryParseError('frontmatter must be a mapping');
  const version: unknown = (raw as Record<string, unknown>)['format_version'];
  if (version !== FORMAT_VERSION) {
    throw new EntryParseError(`unsupported format_version ${String(version)} (this reader supports ${FORMAT_VERSION})`);
  }
  const result = diskFrontmatterSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue ? issue.path.join('.') : '';
    throw new EntryParseError(`invalid frontmatter${where ? ` at ${where}` : ''}: ${issue?.message ?? 'unknown error'}`);
  }
  const fm = result.data;
  return {
    id: fm.id,
    kind: fm.kind,
    status: fm.status,
    area: fm.area,
    summary: fm.summary,
    loadWhen: fm.load_when,
    anchors: fm.anchors.map((a) => ({ path: a.path, range: [a.range[0], a.range[1]], hash: a.hash })),
    provenance: stripUndefined(fm.provenance),
    confirmations: fm.confirmations.map((c) => stripUndefined(c)),
    contradicts: fm.contradicts,
    supersedes: fm.supersedes,
    resolvedBy: fm.resolved_by,
    estTokens: fm.est_tokens,
    body,
  };
}

export function serializeEntry(entry: Entry): string {
  const fm: DiskFrontmatter = {
    format_version: FORMAT_VERSION,
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    area: entry.area,
    summary: entry.summary,
    load_when: entry.loadWhen,
    anchors: entry.anchors.map((a) => ({ path: a.path, range: [a.range[0], a.range[1]], hash: a.hash })),
    provenance: stripUndefined({
      created: entry.provenance.created,
      agent: entry.provenance.agent,
      model: entry.provenance.model,
      session: entry.provenance.session,
      author: entry.provenance.author,
    }),
    confirmations: entry.confirmations.map((c) => stripUndefined({ at: c.at, session: c.session, author: c.author })),
    contradicts: entry.contradicts,
    supersedes: entry.supersedes,
    resolved_by: entry.resolvedBy,
    est_tokens: entry.estTokens,
  };
  const yamlText = stringify(fm, { lineWidth: 0, flowCollectionPadding: false });
  return `${OPEN}${yamlText}---\n${entry.body}`;
}
