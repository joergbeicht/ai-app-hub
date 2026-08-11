import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * Frontend läuft lokal per HTTPS (mkcert, siehe `scripts/setup-ssl.sh`) - eine HTTPS-Seite kann
 * `http://`-APIs nicht zuverlässig aufrufen (Mixed Content), also nutzt das Backend im lokalen
 * Docker-Setup dieselben Zertifikate (Volume-Mount `frontend/ssl` → `backend/ssl`, siehe
 * `docker-compose.yml`). Fehlen sie (z. B. `npm run start:dev` ohne Docker), startet der Server
 * einfach über HTTP - kein Hard-Fail, damit Hot Reload/lokales Arbeiten nie blockiert wird.
 */
function loadHttpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  const keyPath = process.env['SSL_KEY_PATH'] ?? 'ssl/local-key.pem';
  const certPath = process.env['SSL_CERT_PATH'] ?? 'ssl/local.pem';
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    return undefined;
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

async function bootstrap(): Promise<void> {
  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    httpsOptions,
  });

  // Same-Origin fürs Frontend über die Runtime-Config (`RUNTIME_CONFIG.backendApiUrl`) -
  // erlaubte Origins kommen aus ENV, nicht hartcodiert (jeder Kunden-Cluster hat seine eigene
  // Frontend-URL, siehe `deployment.mdc`/`platform-architecture.mdc`).
  const corsOrigins = (process.env['CORS_ORIGIN'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = Number(process.env['PORT'] ?? 6055);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `listening on port ${port} (${httpsOptions ? 'https' : 'http'})`,
  );
}

void bootstrap();
