import { IamAccessDeniedError, IamClientService, IamUnavailableError } from './iam-client.service';

const BASE_URL = 'http://axora-iam-api:6061/api/iam/v1';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-1' },
  });
}

describe('IamClientService', () => {
  const client = new IamClientService({ baseUrl: BASE_URL });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('calls /me with the bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { principal: {}, organizations: [] }));

    await expect(client.getMe('access-token')).resolves.toEqual({ principal: {}, organizations: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/me`);
    expect(init.headers.authorization).toBe('Bearer access-token');
  });

  it.each([401, 403])('maps %s on /me to access denied', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status));

    await expect(client.getMe('access-token')).rejects.toBeInstanceOf(IamAccessDeniedError);
  });

  it('maps server errors and network failures to unavailable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503));
    await expect(client.getMe('access-token')).rejects.toBeInstanceOf(IamUnavailableError);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.getMe('access-token')).rejects.toBeInstanceOf(IamUnavailableError);
  });

  it('forwards a write with JSON body and returns the IAM answer unchanged', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { code: 'CONFLICT' }));

    const result = await client.forward({
      method: 'POST',
      pathAndQuery: 'organizations/org-1/groups',
      accessToken: 'access-token',
      body: { name: 'Team' },
      correlationId: 'corr-0',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/organizations/org-1/groups`);
    expect(init).toMatchObject({ method: 'POST', body: '{"name":"Team"}' });
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-correlation-id': 'corr-0',
    });
    expect(result.status).toBe(409);
    expect(result.correlationId).toBe('corr-1');
    expect(JSON.parse(result.body.toString())).toEqual({ code: 'CONFLICT' });
  });
});
