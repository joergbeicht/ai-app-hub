import { toIamPathAndQuery } from './iam-proxy-path';

describe('toIamPathAndQuery', () => {
  it('strips the proxy prefix and keeps the query', () => {
    expect(toIamPathAndQuery('/iam/v1/organizations/3f2a-1b/users?q=ada&limit=20')).toBe(
      'organizations/3f2a-1b/users?q=ada&limit=20',
    );
  });

  it('accepts a path without query', () => {
    expect(toIamPathAndQuery('/iam/v1/me')).toBe('me');
  });

  it.each([
    ['dot segments', '/iam/v1/../health'],
    ['encoded dots', '/iam/v1/%2e%2e/health'],
    ['encoded slashes', '/iam/v1/organizations%2F..%2Fhealth'],
    ['an empty path', '/iam/v1/'],
    ['double slashes', '/iam/v1/organizations//users'],
    ['a trailing slash', '/iam/v1/me/'],
    ['a foreign prefix', '/hub-apps'],
  ])('rejects %s', (_label, url) => {
    expect(toIamPathAndQuery(url)).toBeNull();
  });
});
