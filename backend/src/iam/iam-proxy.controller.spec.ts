import {
  MethodNotAllowedException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { SessionRequest } from '../auth/bff/session-auth.guard';
import { IamUnavailableError, type IamClientService } from './iam-client.service';
import { IamProxyController } from './iam-proxy.controller';

function requestFor(method: string, originalUrl: string, body?: unknown): SessionRequest {
  return {
    method,
    originalUrl,
    body,
    headers: {},
    authSession: { accessToken: 'access-token' },
  } as unknown as SessionRequest;
}

function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return { res, asResponse: res as unknown as Response };
}

function createController() {
  const iam = {
    forward: jest.fn().mockResolvedValue({
      status: 201,
      contentType: 'application/json',
      correlationId: 'corr-1',
      body: Buffer.from('{"id":"g-1"}'),
    }),
  };
  return { controller: new IamProxyController(iam as unknown as IamClientService), iam };
}

describe('IamProxyController', () => {
  it('forwards writes with the session access token and returns the IAM answer', async () => {
    const { controller, iam } = createController();
    const { res, asResponse } = createResponse();

    await controller.forward(requestFor('POST', '/iam/v1/organizations/org-1/groups', { name: 'Team' }), asResponse);

    expect(iam.forward).toHaveBeenCalledWith({
      method: 'POST',
      pathAndQuery: 'organizations/org-1/groups',
      accessToken: 'access-token',
      body: { name: 'Team' },
      correlationId: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.type).toHaveBeenCalledWith('application/json');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('{"id":"g-1"}'));
  });

  it('sends no body for reads', async () => {
    const { controller, iam } = createController();

    await controller.forward(requestFor('GET', '/iam/v1/organizations/org-1/users?q=ada', {}), createResponse().asResponse);

    expect(iam.forward).toHaveBeenCalledWith(
      expect.objectContaining({ pathAndQuery: 'organizations/org-1/users?q=ada', body: undefined }),
    );
  });

  it('rejects paths that could leave the IAM API version', async () => {
    const { controller, iam } = createController();

    await expect(
      controller.forward(requestFor('GET', '/iam/v1/%2e%2e/health'), createResponse().asResponse),
    ).rejects.toThrow(NotFoundException);
    expect(iam.forward).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods', async () => {
    const { controller } = createController();

    await expect(
      controller.forward(requestFor('OPTIONS', '/iam/v1/me'), createResponse().asResponse),
    ).rejects.toThrow(MethodNotAllowedException);
  });

  it('answers 503 when IAM is unavailable', async () => {
    const { controller, iam } = createController();
    iam.forward.mockRejectedValue(new IamUnavailableError('timeout'));

    await expect(
      controller.forward(requestFor('GET', '/iam/v1/me'), createResponse().asResponse),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
