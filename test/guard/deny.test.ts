import { describe, expect, test } from 'vitest';
import { DEFAULT_DENY, isDenied } from '../../src/guard/deny.js';
import { DEFAULT_CONFIG, type Config } from '../../src/store/config.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

const config = (deny: string[] = []): Config => ({ ...DEFAULT_CONFIG, deny });

describe('deny', () => {
  test('default list matches the documented globs', () => {
    expect([...DEFAULT_DENY]).toEqual([
      '.env*',
      '.dev.vars*',
      '*.pem',
      '*.key',
      'certificate.json',
      'deployment-info.json',
      'backups/**',
      '.claude/settings.local.json',
    ]);
  });

  test('denies .env, .env.local, nested/certificate.json, backups/x.sql, a.pem', () => {
    const repo = tmpRepo();
    for (const p of ['.env', '.env.local', 'apps/web/.env.production', 'nested/certificate.json', 'backups/x.sql', 'backups/deep/y.dump', 'a.pem', 'keys/server.key', '.dev.vars', 'deployment-info.json', '.claude/settings.local.json']) {
      expect(isDenied(repo.root, p, config()), p).toBe(true);
    }
  });

  test('deny matching ignores case', () => {
    const repo = tmpRepo();
    expect(isDenied(repo.root, '.ENV', config())).toBe(true);
    expect(isDenied(repo.root, 'Certs/A.PEM', config())).toBe(true);
  });

  test('denies path ignored by .gitignore in tmp repo', () => {
    const repo = tmpRepo();
    repo.write('.gitignore', 'generated/\n*.log\n');
    expect(isDenied(repo.root, 'generated/out.ts', config())).toBe(true);
    expect(isDenied(repo.root, 'debug.log', config())).toBe(true);
  });

  test('allows src/app.ts', () => {
    const repo = tmpRepo();
    repo.write('.gitignore', 'generated/\n');
    expect(isDenied(repo.root, 'src/app.ts', config())).toBe(false);
    expect(isDenied(repo.root, 'docs/environment.md', config())).toBe(false);
  });

  test('config.deny extends defaults and cannot remove them', () => {
    const repo = tmpRepo();
    expect(isDenied(repo.root, 'private/notes.md', config(['private/**']))).toBe(true);
    expect(isDenied(repo.root, '.env', config(['!.env']))).toBe(true);
    expect(isDenied(repo.root, 'src/app.ts', config(['!.env']))).toBe(false);
  });
});
