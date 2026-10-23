import { loadRuntimeConfig, type RuntimeConfig } from './runtime-config';

const config: RuntimeConfig = {
  clusterName: 'axora-confessio-test-aks',
  azureTenantId: 'tenant-1',
  azureClientId: 'client-1',
  backendApiUrl: 'https://backend.example.com',
  authMode: 'keycloak',
};

describe('loadRuntimeConfig', () => {
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
  });

  it('fetches runtime-config.json with a cache-busting query and no-store', async () => {
    fetchSpy.and.resolveTo(new Response(JSON.stringify(config), { status: 200 }));

    const result = await loadRuntimeConfig();

    expect(result).toEqual(config);
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toMatch(/^runtime-config\.json\?v=\d+$/);
    expect(init.cache).toBe('no-store');
  });

  // Real (short) timers instead of fakeAsync/tick - the retry delay itself is the behaviour under
  // test, and mixing fakeAsync with a native rejected Promise from the spy proved flaky.
  it('retries a transient failure and succeeds on a later attempt', async () => {
    fetchSpy.and.returnValues(
      Promise.reject(new TypeError('network error')),
      Promise.resolve(new Response(JSON.stringify(config), { status: 200 })),
    );

    const result = await loadRuntimeConfig();

    expect(result).toEqual(config);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps the MSAL legacy auth mode when authMode is missing or empty', async () => {
    const legacyConfig = {
      clusterName: config.clusterName,
      azureTenantId: config.azureTenantId,
      azureClientId: config.azureClientId,
      backendApiUrl: config.backendApiUrl,
    };
    fetchSpy.and.returnValues(
      Promise.resolve(new Response(JSON.stringify(legacyConfig), { status: 200 })),
      Promise.resolve(new Response(JSON.stringify({ ...legacyConfig, authMode: '' }), { status: 200 })),
    );

    expect((await loadRuntimeConfig()).authMode).toBe('entra');
    expect((await loadRuntimeConfig()).authMode).toBe('entra');
  });

  it('throws after exhausting all retry attempts', async () => {
    fetchSpy.and.resolveTo(new Response(null, { status: 404 }));

    await expectAsync(loadRuntimeConfig()).toBeRejectedWithError(/404/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
