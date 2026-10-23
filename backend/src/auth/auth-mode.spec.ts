import { resolveAuthMode } from './auth-mode';

describe('resolveAuthMode', () => {
  it('keeps the Entra legacy mode when nothing is configured', () => {
    expect(resolveAuthMode(undefined)).toBe('entra');
    expect(resolveAuthMode('  ')).toBe('entra');
  });

  it('accepts known modes case-insensitively', () => {
    expect(resolveAuthMode('Keycloak')).toBe('keycloak');
    expect(resolveAuthMode(' entra ')).toBe('entra');
  });

  it('fails fast on unknown modes instead of silently falling back', () => {
    expect(() => resolveAuthMode('okta')).toThrow(/Unsupported AUTH_MODE/);
  });
});
