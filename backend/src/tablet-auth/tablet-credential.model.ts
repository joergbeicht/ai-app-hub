/**
 * Pro Tablet-Benutzer ein JSON-Secret in Azure Key Vault (siehe ADR-12), Secret-Name
 * `tablet-cred-<badgeCode>`. Enthält sowohl das echte Entra-Passwort (nur für den
 * ROPC-Austausch, verlässt das Backend nie in Richtung Browser) als auch den PIN-Hash und den
 * Lockout-Zustand - bewusst kein separates Speichersystem neben Key Vault/Graph (YAGNI, siehe
 * ADR-12 "kein eigenes Postgres").
 */
export interface TabletCredential {
  userPrincipalName: string;
  entraPassword: string;
  pinHash: string;
  failedAttempts: number;
  /** ISO-8601-Zeitstempel oder `null`, wenn aktuell keine Sperre aktiv ist. */
  lockedUntil: string | null;
}
