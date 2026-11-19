/**
 * Local, reviewable patterns for text that looks like a credential.
 * Prefixes are split so this file does not match its own patterns.
 * Order matters: the first match names the finding.
 */
const SECRET_WORDS = '(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|token)';

const PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['aws-access-key', new RegExp('\\b(?:AK' + 'IA|AS' + 'IA)[0-9A-Z]{16}\\b')],
  ['github-token', new RegExp('\\b(?:gh[pousr]_' + '[A-Za-z0-9]{30,}|github_pat_' + '[A-Za-z0-9_]{40,})')],
  ['api-key', new RegExp('\\b(?:sk|rk)[-_](?:live_|test_|proj-|ant-)?' + '[A-Za-z0-9_-]{20,}')],
  ['api-key', new RegExp('\\b(?:sb_secret_|sbp_|xox[abprs]-)' + '[A-Za-z0-9_-]{20,}')],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['database-url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/@]+:[^\s@$]+@[^\s]+/],
  [
    'secret-assignment',
    new RegExp(
      '\\b\\w*' + SECRET_WORDS + '\\w*["\']?\\s*[:=]\\s*' +
        '(?:"[^"\\s]{6,}"|\'[^\'\\s]{6,}\'|[A-Za-z0-9_+/!@#$%^&*-]{6,}(?![\\w.(]))',
      'i',
    ),
  ],
];

/** Returns the name of the first secret-like pattern found, or null. */
export function findSecret(text: string): string | null {
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}
