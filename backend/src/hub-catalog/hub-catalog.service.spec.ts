import { HubCatalogService } from './hub-catalog.service';

describe('HubCatalogService', () => {
  const originalHost = process.env.KUBERNETES_SERVICE_HOST;
  let service: HubCatalogService;

  beforeEach(() => {
    service = new HubCatalogService();
  });

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.KUBERNETES_SERVICE_HOST;
    } else {
      process.env.KUBERNETES_SERVICE_HOST = originalHost;
    }
  });

  it('returns an empty map when not running inside a Kubernetes cluster', async () => {
    delete process.env.KUBERNETES_SERVICE_HOST;

    await expect(service.getCatalogUrls()).resolves.toEqual({});
  });

  it('returns an empty map instead of throwing when the Kubernetes API is unreachable', async () => {
    // Simuliert "läuft in einem Pod" (Guard-Klausel greift nicht mehr), aber es gibt in der
    // Testumgebung weder Service-Account-Token noch CA-Zertifikat unter /var/run/secrets/... -
    // der Fehler muss abgefangen werden, statt die Karten im Hub zu zerschießen.
    process.env.KUBERNETES_SERVICE_HOST = '127.0.0.1';

    await expect(service.getCatalogUrls()).resolves.toEqual({});
  });
});
