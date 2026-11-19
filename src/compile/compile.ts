import { authorsTrusted, effectiveStatus, estimateTokens } from '../memory/lifecycle.js';
import { verifyAll } from '../memory/verify.js';
import { entryAuthors } from '../store/authors.js';
import { loadConfig } from '../store/config.js';
import { buildIndex, ROOT_INDEX, type IndexRow } from './index-levels.js';
import { buildAreas, universalRules } from './model.js';
import { SKILL_ROOTS, type Output } from './outputs.js';
import { renderAgentsBlock, renderSkill } from './render.js';

export class CompileError extends Error {
  override name = 'CompileError';
}

export type CompileReport = { areas: number; skills: number; levels: number; indexTokens: number; budget: number; descriptionTokens: number };

export type CompileResult = { files: Output[]; agentsBlock: string; report: CompileReport };

/** Skill copy the index links to; the other roots hold identical copies. */
const INDEX_SKILL_ROOT = '.agents/skills';

function depth(path: string): number {
  if (path === ROOT_INDEX) return 1;
  const name = path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
  return 1 + name.split('-').length;
}

/**
 * Everything `compile` would write, computed without touching disk. Anchors
 * are re-verified in memory only: compile never rewrites entry files, so
 * whoever runs it never becomes an author of someone else's entry.
 */
export function compileRepo(root: string): CompileResult {
  const config = loadConfig(root);
  const authors = entryAuthors(root);
  const { results, errors } = verifyAll(root, { persist: false });
  if (errors.length > 0) {
    throw new CompileError(`cannot compile with unreadable entries: ${errors.map((e) => `${e.file}: ${e.message}`).join('; ')}`);
  }

  const model = results.map((r) => {
    const by = authors.get(r.entry.id) ?? [];
    return { entry: r.entry, status: effectiveStatus(r.entry, by, config), trusted: authorsTrusted(by, config) };
  });
  const areas = buildAreas(model, config);

  const skills: Output[] = [];
  const rows: IndexRow[] = [];
  for (const area of areas) {
    const content = renderSkill(area);
    for (const skillRoot of SKILL_ROOTS) skills.push({ path: `${skillRoot}/keelson-${area.slug}/SKILL.md`, content });
    rows.push({
      label: area.display,
      loadWhen: area.loadWhen,
      tokens: estimateTokens(content),
      summary: area.description,
      freshness: area.freshness,
      target: `${INDEX_SKILL_ROOT}/keelson-${area.slug}/SKILL.md`,
    });
  }

  const index = buildIndex(rows, config.rootIndexTokens);
  const indexTokens = index[0]?.tokens ?? 0;
  return {
    files: [...index.map((f) => ({ path: f.path, content: f.content })), ...skills],
    agentsBlock: renderAgentsBlock(universalRules(model), { path: ROOT_INDEX, tokens: indexTokens }),
    report: {
      areas: areas.length,
      skills: skills.length,
      levels: Math.max(...index.map((f) => depth(f.path))),
      indexTokens,
      budget: config.rootIndexTokens,
      descriptionTokens: areas.reduce((s, a) => s + estimateTokens(a.description), 0),
    },
  };
}
