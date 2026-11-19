import { describe, expect, test } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, loadConfig } from '../../src/store/config.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

describe('config', () => {
  test('loadConfig returns defaults when file absent', () => {
    const repo = tmpRepo();
    expect(loadConfig(repo.root)).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({ formatVersion: 1, rootIndexTokens: 1500, hypothesisExpirySessions: 5, deny: [], trustedAuthors: [] });
  });

  test('loadConfig merges partial file with defaults', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ deny: ['secrets/**'], trustedAuthors: ['a@example.com'] }));
    expect(loadConfig(repo.root)).toEqual({ ...DEFAULT_CONFIG, deny: ['secrets/**'], trustedAuthors: ['a@example.com'] });
  });

  test('loadConfig accepts a UTF-8 BOM', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', '﻿{"rootIndexTokens": 900}');
    expect(loadConfig(repo.root).rootIndexTokens).toBe(900);
  });

  test('loadConfig throws ConfigError on invalid JSON', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', '{ not json');
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
  });

  test('loadConfig throws ConfigError on wrong types or unknown formatVersion', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ rootIndexTokens: 'many' }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
    repo.write('.keelson/config.json', JSON.stringify({ formatVersion: 2 }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
  });
});
