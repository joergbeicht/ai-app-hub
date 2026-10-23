/** Unter diesem Pfad reicht das Hub-Backend Anfragen an die Axora IAM API (`/api/iam/v1`) durch. */
export const IAM_PROXY_ROUTE = 'iam/v1';

const PROXY_PREFIX = `/${IAM_PROXY_ROUTE}/`;

/**
 * Nur Segmente aus Buchstaben, Ziffern, `-` und `_`: schließt `..`, kodierte Zeichen (`%2e`,
 * `%2f`) und damit jeden Ausbruch aus dem Versionspfad der IAM-API aus.
 */
const SAFE_PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export const IAM_PROXY_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const METHODS_WITH_BODY: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);

/** Pfad samt Query relativ zur IAM-API-Basis oder `null`, wenn der Pfad nicht zulässig ist. */
export function toIamPathAndQuery(originalUrl: string): string | null {
  if (!originalUrl.startsWith(PROXY_PREFIX)) {
    return null;
  }
  const remainder = originalUrl.slice(PROXY_PREFIX.length);
  const queryStart = remainder.indexOf('?');
  const path = queryStart === -1 ? remainder : remainder.slice(0, queryStart);
  if (!SAFE_PATH.test(path)) {
    return null;
  }
  return queryStart === -1 ? path : `${path}${remainder.slice(queryStart)}`;
}

export function forwardsBody(method: string): boolean {
  return METHODS_WITH_BODY.has(method);
}
