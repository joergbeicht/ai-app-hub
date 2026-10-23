import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Globales Sicherheitsnetz (siehe `clean-code.mdc`: "zentrale Exception Filters statt
 * verstreuter try/catch"). Ohne diesen Filter kann ein Fehler aus einer Drittanbieter-Bibliothek
 * mit einer nicht-validen `statusCode`-Eigenschaft (z. B. der Microsoft-Graph-SDK-Konvention
 * `statusCode: -1` bei reinen Netzwerkfehlern ohne HTTP-Antwort) NestJS' eigenen
 * `BaseExceptionFilter` zum Absturz bringen (`res.writeHead(-1, ...)` wirft eine unbehandelte
 * `RangeError` und beendet den ganzen Node-Prozess) - dadurch wäre der gesamte Hub (auch
 * unabhängige Endpunkte wie `/hub-apps`) für alle Nutzer offline, nur weil z. B. ein einzelner
 * Graph-Aufruf für die Benutzerverwaltung fehlschlägt.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toSafeResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(this.describe(exception), (exception as Error)?.stack);
    } else {
      this.logger.warn(this.describe(exception));
    }

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  private toSafeResponse(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body =
        typeof res === 'object' && res !== null ? res : { statusCode: status, message: res };
      return { status, body: body as Record<string, unknown> };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
    };
  }

  private describe(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }
    return String(exception);
  }
}
