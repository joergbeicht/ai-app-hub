import {
  All,
  Controller,
  MethodNotAllowedException,
  NotFoundException,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { HubAuthGuard } from '../auth/hub-auth.guard';
import type { SessionRequest } from '../auth/bff/session-auth.guard';
import { IamClientService, IamUnavailableError } from './iam-client.service';
import {
  IAM_PROXY_METHODS,
  IAM_PROXY_ROUTE,
  forwardsBody,
  toIamPathAndQuery,
} from './iam-proxy-path';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Verwaltungsoberfläche → Axora IAM (ADR-20). Der Browser spricht nur mit dem Hub (Cookie + CSRF),
 * das Backend hängt das Access-Token des Nutzers an. Autorisierung und Mandantenprüfung macht
 * ausschließlich die IAM; Antworten (inkl. Problem Details) gehen unverändert zurück.
 */
@Controller(IAM_PROXY_ROUTE)
@UseGuards(HubAuthGuard)
export class IamProxyController {
  constructor(private readonly iam: IamClientService) {}

  @All('*')
  async forward(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
    if (!IAM_PROXY_METHODS.has(req.method)) {
      throw new MethodNotAllowedException();
    }
    const pathAndQuery = toIamPathAndQuery(req.originalUrl);
    if (!pathAndQuery) {
      throw new NotFoundException();
    }
    const correlationId = req.headers[CORRELATION_HEADER];

    const result = await this.iam
      .forward({
        method: req.method,
        pathAndQuery,
        accessToken: req.authSession.accessToken,
        body: forwardsBody(req.method) ? (req.body ?? {}) : undefined,
        correlationId: typeof correlationId === 'string' ? correlationId : undefined,
      })
      .catch((error: unknown) => {
        throw error instanceof IamUnavailableError
          ? new ServiceUnavailableException('Authorization service unavailable')
          : error;
      });

    res.status(result.status);
    if (result.contentType) {
      res.type(result.contentType);
    }
    if (result.correlationId) {
      res.setHeader(CORRELATION_HEADER, result.correlationId);
    }
    res.send(result.body);
  }
}
