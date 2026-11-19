import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEntryFile, serializeEntry } from '../format/entry-file.js';
import { ULID_RE, type Entry } from '../format/schema.js';

export class EntryNotFoundError extends Error {
  override name = 'EntryNotFoundError';
}

export function keelsonDir(root: string): string {
  return join(root, '.keelson');
}

function entriesDir(root: string): string {
  return join(keelsonDir(root), 'entries');
}

function entryFile(root: string, id: string): string {
  if (!ULID_RE.test(id)) throw new Error(`not a valid entry id: ${id}`);
  return join(entriesDir(root), `${id}.md`);
}

/** Creates the entry file; fails if it already exists (never overwrites). */
export function writeNewEntry(root: string, entry: Entry): void {
  const file = entryFile(root, entry.id);
  mkdirSync(entriesDir(root), { recursive: true });
  writeFileSync(file, serializeEntry(entry), { encoding: 'utf8', flag: 'wx' });
}

/** Replaces an existing entry atomically (temp file + rename). */
export function updateEntry(root: string, entry: Entry): void {
  const file = entryFile(root, entry.id);
  if (!existsSync(file)) throw new EntryNotFoundError(`entry not found: ${entry.id}`);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, serializeEntry(entry), { encoding: 'utf8', flag: 'wx' });
  renameSync(tmp, file);
}

function parseFile(file: string, expectedId: string): Entry {
  const entry = parseEntryFile(readFileSync(file, 'utf8'));
  if (entry.id !== expectedId) throw new Error(`id ${entry.id} does not match file name ${expectedId}.md`);
  return entry;
}

export function readEntry(root: string, id: string): Entry {
  const file = entryFile(root, id);
  if (!existsSync(file)) throw new EntryNotFoundError(`entry not found: ${id}`);
  return parseFile(file, id);
}

export function listEntries(root: string): { entries: Entry[]; errors: { file: string; message: string }[] } {
  const dir = entriesDir(root);
  if (!existsSync(dir)) return { entries: [], errors: [] };
  const entries: Entry[] = [];
  const errors: { file: string; message: string }[] = [];
  const names = readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  for (const name of names) {
    const id = name.slice(0, -'.md'.length);
    try {
      entries.push(parseFile(join(dir, name), id));
    } catch (e) {
      errors.push({ file: `.keelson/entries/${name}`, message: e instanceof Error ? e.message : String(e) });
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, errors };
}
