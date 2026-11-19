import { z } from 'zod';

export const FORMAT_VERSION = 1;
export const KINDS = ['rule', 'finding', 'discard', 'decision', 'hypothesis'] as const;
export const STATUSES = ['verified', 'hypothesis', 'disputed', 'stale', 'archived'] as const;
export const SUMMARY_MAX = 160;
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const HASH_RE = /^sha256:[0-9a-f]{64}$/;

export type Kind = (typeof KINDS)[number];
export type Status = (typeof STATUSES)[number];
export type Anchor = { path: string; range: [number, number]; hash: string };
export type Provenance = { created: string; agent?: string; model?: string; session?: string; author?: string };
export type Confirmation = { at: string; session?: string; author?: string };

export type Entry = {
  id: string;
  kind: Kind;
  status: Status;
  area: string;
  summary: string;
  loadWhen: string[];
  anchors: Anchor[];
  provenance: Provenance;
  confirmations: Confirmation[];
  contradicts: string[];
  supersedes: string[];
  resolvedBy: string | null;
  estTokens: number;
  body: string;
};

const id = z.string().regex(ULID_RE, 'id must be a ULID');
const line = z.number().int().min(1);

const anchorSchema = z.strictObject({
  path: z.string().min(1),
  range: z.tuple([line, line]).refine(([s, e]) => s <= e, 'range start must be <= end'),
  hash: z.string().regex(HASH_RE, 'hash must be sha256:<64 hex>'),
});

const provenanceSchema = z.strictObject({
  created: z.string().min(1),
  agent: z.string().optional(),
  model: z.string().optional(),
  session: z.string().optional(),
  author: z.string().optional(),
});

const confirmationSchema = z.strictObject({
  at: z.string().min(1),
  session: z.string().optional(),
  author: z.string().optional(),
});

/** Frontmatter as stored on disk (snake_case). */
export const diskFrontmatterSchema = z.strictObject({
  format_version: z.literal(FORMAT_VERSION),
  id,
  kind: z.enum(KINDS),
  status: z.enum(STATUSES),
  area: z.string().min(1),
  summary: z.string().min(1).max(SUMMARY_MAX),
  load_when: z.array(z.string().min(1)),
  anchors: z.array(anchorSchema),
  provenance: provenanceSchema,
  confirmations: z.array(confirmationSchema),
  contradicts: z.array(id),
  supersedes: z.array(id),
  resolved_by: z.string().min(1).nullable(),
  est_tokens: z.number().int().min(0),
});

export type DiskFrontmatter = z.infer<typeof diskFrontmatterSchema>;
