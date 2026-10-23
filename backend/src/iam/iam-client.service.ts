import { Inject, Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export const IAM_CLIENT_CONFIG = Symbol('IAM_CLIENT_CONFIG');

const REQUEST_TIMEOUT_MS = 5000;
const JSON_CONTENT_TYPE = 'application/json';
const CORRELATION_HEADER = 'x-correlation-id';

export interface IamClientConfig {
  /** Basis der Axora IAM API inklusive Versionspfad, z. B. `http://axora-iam-api:6061/api/iam/v1`. */
  readonly baseUrl: string;
}

export function createIamClientConfig(config: ConfigService): IamClientConfig {
  return { baseUrl: config.getOrThrow<string>('IAM_API_URL').replace(/\/+$/, '') };
}

/** Ausschnitt von `GET /me` der Axora IAM API, den der Hub auswertet. */
export interface IamOrganization {
  id: string;
  slug: string;
  name: string;
  membershipStatus: string;
  applications: string[];
  permissions: string[];
}

export interface IamMe {
  principal: { id: string; displayName: string; email: string | null };
  organizations: IamOrganization[];
}

export interface IamForwardRequest {
  method: string;
  /** Pfad relativ zur API-Basis, ohne führenden Slash, inklusive Query. */
  pathAndQuery: string;
  accessToken: string;
  body?: unknown;
  correlationId?: string;
}

export interface IamForwardResponse {
  status: number;
  contentType: string | null;
  correlationId: string | null;
  body: Buffer;
}

/** IAM nicht erreichbar oder mit Serverfehler: Zugriff wird verweigert (fail closed). */
export class IamUnavailableError extends Error {}

/** IAM kennt den Principal nicht, er ist gesperrt oder das Token wurde abgelehnt. */
export class IamAccessDeniedError extends Error {
  constructor(readonly status: number) {
    super(`IAM denied access (${status})`);
  }
}

/**
 * HTTP-Client des Hub-Backends für die Axora IAM API (ADR-20). Das Access-Token des Nutzers
 * verlässt das Backend nur in Richtung IAM, nie zum Browser.
 */
@Injectable()
export class IamClientService {
  constructor(@Inject(IAM_CLIENT_CONFIG) private readonly config: IamClientConfig) {}

  async getMe(accessToken: string): Promise<IamMe> {
    const response = await this.send('GET', 'me', accessToken);
    if (response.status === 401 || response.status === 403) {
      throw new IamAccessDeniedError(response.status);
    }
    if (!response.ok) {
      throw new IamUnavailableError(`IAM /me answered ${response.status}`);
    }
    return (await response.json()) as IamMe;
  }

  /** Reicht eine Verwaltungsanfrage unverändert durch; die Autorisierung entscheidet die IAM. */
  async forward(request: IamForwardRequest): Promise<IamForwardResponse> {
    const response = await this.send(
      request.method,
      request.pathAndQuery,
      request.accessToken,
      request.body,
      request.correlationId,
    );
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      correlationId: response.headers.get(CORRELATION_HEADER),
      body: Buffer.from(await response.arrayBuffer()),
    };
  }

  private async send(
    method: string,
    pathAndQuery: string,
    accessToken: string,
    body?: unknown,
    correlationId?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
    if (body !== undefined) {
      headers['content-type'] = JSON_CONTENT_TYPE;
    }
    if (correlationId) {
      headers[CORRELATION_HEADER] = correlationId;
    }
    try {
      return await fetch(`${this.config.baseUrl}/${pathAndQuery}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new IamUnavailableError(error instanceof Error ? error.message : String(error));
    }
  }
}
