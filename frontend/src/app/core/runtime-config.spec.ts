import { loadRuntimeConfig, type RuntimeConfig } from './runtime-config';

const config: RuntimeConfig = {
  clusterName: 'axora-confessio-test-aks',
  azureTenantId: 'tenant-1',
  azureClientId: 'client-1',
  backendApiUrl: 'https://backend.example.com',
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

  it('throws when the response is not ok', async () => {
    fetchSpy.and.resolveTo(new Response(null, { status: 404 }));

    await expectAsync(loadRuntimeConfig()).toBeRejectedWithError(/404/);
  });
});
