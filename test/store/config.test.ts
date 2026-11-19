import { describe, expect, test } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, loadConfig } from '../../src/store/config.js';
import { tmpRepo } from '../helpers/tmp-repo.js';

describe('config', () => {
  test('loadConfig returns defaults when file absent', () => {
    const repo = tmpRepo();
    expect(loadConfig(repo.root)).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({ formatVersion: 1, rootIndexTokens: 1500, hypothesisExpirySessions: 5, deny: [], trustedAuthors: [], areas: {} });
  });

  test('loadConfig merges partial file with defaults', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ deny: ['secrets/**'], trusted_authors: ['a@example.com'] }));
    expect(loadConfig(repo.root)).toEqual({ ...DEFAULT_CONFIG, deny: ['secrets/**'], trustedAuthors: ['a@example.com'] });
  });

  test('loadConfig reads every snake_case key', () => {
    const repo = tmpRepo();
    repo.write(
      '.keelson/config.json',
      JSON.stringify({ format_version: 1, root_index_tokens: 900, hypothesis_expiry_sessions: 3, deny: [], trusted_authors: [] }),
    );
    expect(loadConfig(repo.root)).toEqual({ ...DEFAULT_CONFIG, rootIndexTokens: 900, hypothesisExpirySessions: 3 });
  });

  test('loadConfig rejects camelCase keys', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ trustedAuthors: ['a@example.com'] }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
  });

  test('loadConfig accepts a UTF-8 BOM', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', '﻿{"root_index_tokens": 900}');
    expect(loadConfig(repo.root).rootIndexTokens).toBe(900);
  });

  test('loadConfig throws ConfigError on invalid JSON', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', '{ not json');
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
  });

  test('loadConfig throws ConfigError on wrong types or unknown formatVersion', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ root_index_tokens: 'many' }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
    repo.write('.keelson/config.json', JSON.stringify({ format_version: 2 }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
  });
  test('loadConfig reads areas with descriptions', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ areas: { auth: { description: 'Login and sessions.' }, ui: {} } }));
    expect(loadConfig(repo.root).areas).toEqual({ auth: { description: 'Login and sessions.' }, ui: {} });
  });

  test('loadConfig rejects area descriptions over 200 characters or with line breaks', () => {
    const repo = tmpRepo();
    repo.write('.keelson/config.json', JSON.stringify({ areas: { auth: { description: 'x'.repeat(201) } } }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
    repo.write('.keelson/config.json', JSON.stringify({ areas: { auth: { description: 'a' + String.fromCharCode(10) + 'b' } } }));
    expect(() => loadConfig(repo.root)).toThrow(ConfigError);
    repo.write('.keelson/config.json', JSON.stringify({ areas: { auth: { description: 'x'.repeat(200) } } }));
    expect(loadConfig(repo.root).areas['auth']?.description).toHaveLength(200);
  });
});
