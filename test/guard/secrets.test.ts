import { describe, expect, test } from 'vitest';
import { findSecret } from '../../src/guard/secrets.js';

// Fixtures are assembled at runtime so this file does not look like it holds secrets.
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fake = {
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEow\n',
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  skKey: 's' + 'k-' + 'proj-' + 'a1B2c3D4e5F6g7H8i9J0k1L2',
  stripe: 's' + 'k_live_' + 'a1B2c3D4e5F6g7H8i9J0',
  github: 'gh' + 'p_' + 'a'.repeat(36),
  jwt: [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ role: 'anon', iss: 'x' }), 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.'),
  password: 'pass' + 'word = "hunter22x"',
  dbUrl: 'postgres://app:' + 'S3cretPw' + '@db.example.com:5432/app',
};

describe('findSecret', () => {
  test('findSecret detects PEM private key header, AKIA key, sk- style key, JWT, password= assignment', () => {
    expect(findSecret('see ' + fake.pem)).toBe('private-key');
    expect(findSecret('key ' + fake.aws + ' in config')).toBe('aws-access-key');
    expect(findSecret('token ' + fake.skKey)).toBe('api-key');
    expect(findSecret(fake.stripe)).toBe('api-key');
    expect(findSecret(fake.github)).toBe('github-token');
    expect(findSecret('Authorization: Bearer ' + fake.jwt)).toBe('jwt');
    expect(findSecret(fake.password)).toBe('secret-assignment');
    expect(findSecret('DB_PASSWORD: s3cr3tValue')).toBe('secret-assignment');
    expect(findSecret(fake.dbUrl)).toBe('database-url');
  });

  test('findSecret returns null for prose mentioning the word password', () => {
    expect(findSecret('The password field is validated with zod before hashing.')).toBeNull();
    expect(findSecret('Reset password: see docs')).toBeNull();
    expect(findSecret('password = process.env.DB_PASSWORD')).toBeNull();
    expect(findSecret('The api key lives in .dev.vars, never in code.')).toBeNull();
    expect(findSecret('function sk-ip() and task-list items')).toBeNull();
    expect(findSecret('')).toBeNull();
  });
});
