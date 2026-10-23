/**
 * Wer den Browser authentifiziert (ADR-19): `entra` ist der Bestand (MSAL + Bearer-Token,
 * ADR-2/6), `keycloak` das Zielbild aus dem Axora-IAM-Konzept (BFF + Session-Cookie). Ohne
 * Angabe bleibt `entra`, damit bestehende Cluster ohne neue Helm-Werte unverändert laufen.
 */
export const AUTH_MODES = ['entra', 'keycloak'] as const;

export type AuthMode = (typeof AUTH_MODES)[number];

export const DEFAULT_AUTH_MODE: AuthMode = 'entra';

export function resolveAuthMode(raw: string | undefined): AuthMode {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return DEFAULT_AUTH_MODE;
  }
  const mode = AUTH_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new Error(`Unsupported AUTH_MODE "${raw}" (expected one of: ${AUTH_MODES.join(', ')})`);
  }
  return mode;
}
