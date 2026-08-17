import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as https from 'https';

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
/** Jede Fach-App trägt ihre echte Ingress-URL selbst in eine ConfigMap in ihrem eigenen
 *  Namespace ein (siehe z. B. `ai-daten-orchestrator/helm/.../hub-catalog-configmap.yaml`) -
 *  dieses Label macht sie clusterweit auffindbar, ohne dass der Hub den jeweiligen Namespace
 *  kennen muss. */
const LABEL_SELECTOR = 'axora.io/hub-catalog=true';
/** Kurzes Caching, damit nicht jeder Hub-Seitenaufruf jedes Nutzers die Kubernetes-API trifft. */
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

interface ConfigMapListResponse {
  items?: Array<{ data?: Record<string, string> }>;
}

/**
 * Löst die echten Cluster-URLs der Fach-Apps auf (siehe ADR „Online-URLs im Hub“, axora-operation-
 * center PLAN.md Slice 8). Liest ausschließlich lesend über die In-Cluster-Kubernetes-API - ohne
 * Kubernetes (lokales Docker Compose) liefert der Service immer ein leeres Ergebnis, die Karten
 * behalten dann ihre in `konfiguration.json` hinterlegte Dev-URL.
 */
@Injectable()
export class HubCatalogService {
  private readonly logger = new Logger(HubCatalogService.name);
  private cache: { urls: Record<string, string>; expiresAt: number } | null = null;

  async getCatalogUrls(): Promise<Record<string, string>> {
    if (!process.env.KUBERNETES_SERVICE_HOST) {
      return {};
    }
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.urls;
    }
    try {
      const urls = await this.fetchCatalogUrls();
      this.cache = { urls, expiresAt: Date.now() + CACHE_TTL_MS };
      return urls;
    } catch (error) {
      this.logger.warn(`Konnte hub-catalog ConfigMaps nicht lesen: ${(error as Error).message}`);
      return {};
    }
  }

  private async fetchCatalogUrls(): Promise<Record<string, string>> {
    const items = await this.listLabeledConfigMaps();
    const urls: Record<string, string> = {};
    for (const item of items) {
      const catalogAppId = item.data?.['catalogAppId'];
      const url = item.data?.['url'];
      if (catalogAppId && url) {
        urls[catalogAppId] = url;
      }
    }
    return urls;
  }

  private listLabeledConfigMaps(): Promise<Array<{ data?: Record<string, string> }>> {
    const host = process.env.KUBERNETES_SERVICE_HOST;
    const port = process.env.KUBERNETES_SERVICE_PORT ?? '443';
    const token = readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, 'utf8').trim();
    const ca = readFileSync(`${SERVICE_ACCOUNT_DIR}/ca.crt`);
    const path = `/api/v1/configmaps?labelSelector=${encodeURIComponent(LABEL_SELECTOR)}`;

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host,
          port,
          path,
          method: 'GET',
          ca,
          headers: { Authorization: `Bearer ${token}` },
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Kubernetes API antwortete mit Status ${res.statusCode}`));
              return;
            }
            try {
              const parsed = JSON.parse(body) as ConfigMapListResponse;
              resolve(parsed.items ?? []);
            } catch (parseError) {
              reject(parseError as Error);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Kubernetes API Anfrage-Timeout')));
      req.end();
    });
  }
}
