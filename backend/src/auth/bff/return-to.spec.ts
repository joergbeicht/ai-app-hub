import { DEFAULT_RETURN_TO, sanitizeReturnTo } from './return-to';

describe('sanitizeReturnTo', () => {
  it.each(['/', '/settings', '/settings?tab=apps#top'])('keeps the relative path %s', (path) => {
    expect(sanitizeReturnTo(path)).toBe(path);
  });

  it.each([
    ['an absolute URL', 'https://evil.example/'],
    ['a protocol-relative URL', '//evil.example/'],
    ['a backslash host', '/\\evil.example/'],
    ['a path without leading slash', 'settings'],
    ['a control character', '/settings\n'],
    ['the DEL character', '/settings\u007f'],
    ['an empty string', ''],
    ['an overlong path', `/${'a'.repeat(600)}`],
  ])('falls back to the start page for %s', (_label, value) => {
    expect(sanitizeReturnTo(value)).toBe(DEFAULT_RETURN_TO);
  });

  it('falls back to the start page for non-string query values', () => {
    expect(sanitizeReturnTo(['/a', '/b'])).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO);
  });
});
