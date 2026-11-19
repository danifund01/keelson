import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export type Config = {
  formatVersion: 1;
  rootIndexTokens: number;
  hypothesisExpirySessions: number;
  deny: string[];
  trustedAuthors: string[];
  /** Human-written area settings; `description` becomes the index summary and skill trigger. */
  areas: Record<string, { description?: string }>;
};

export const DEFAULT_CONFIG: Config = {
  formatVersion: 1,
  rootIndexTokens: 1500,
  hypothesisExpirySessions: 5,
  deny: [],
  trustedAuthors: [],
  areas: {},
};

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** On disk the keys are snake_case, like the entry frontmatter. */
const configSchema = z.strictObject({
  format_version: z.literal(1).optional(),
  root_index_tokens: z.number().int().positive().optional(),
  hypothesis_expiry_sessions: z.number().int().positive().optional(),
  deny: z.array(z.string().min(1)).optional(),
  trusted_authors: z.array(z.string().min(1)).optional(),
  areas: z
    .record(
      z.string().min(1),
      z.strictObject({ description: z.string().min(1).max(200).regex(/^[^\r\n]*$/, 'description must be one line').optional() }),
    )
    .optional(),
});

export function configPath(root: string): string {
  return join(root, '.keelson', 'config.json');
}

export function loadConfig(root: string): Config {
  let text: string;
  try {
    text = readFileSync(configPath(root), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG, deny: [], trustedAuthors: [], areas: {} };
    throw e;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new ConfigError(`.keelson/config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ConfigError(`.keelson/config.json invalid at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? 'unknown error'}`);
  }
  const c = parsed.data;
  return {
    formatVersion: 1,
    rootIndexTokens: c.root_index_tokens ?? DEFAULT_CONFIG.rootIndexTokens,
    hypothesisExpirySessions: c.hypothesis_expiry_sessions ?? DEFAULT_CONFIG.hypothesisExpirySessions,
    deny: c.deny ?? [],
    trustedAuthors: c.trusted_authors ?? [],
    areas: c.areas ?? {},
  };
}
