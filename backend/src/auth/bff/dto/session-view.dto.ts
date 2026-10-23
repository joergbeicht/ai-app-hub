/**
 * Antwort von `GET /auth/session`: wer angemeldet ist, in welcher Organisation, mit welchen
 * Axora-IAM-Permissions (`hub.*`, `iam.*`) und welches CSRF-Token mitzusenden ist. Die
 * Permissions steuern nur die Oberfläche; entschieden wird serverseitig (Hub bzw. IAM).
 */
export interface SessionViewDto {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    roles: string[];
  };
  organization: { id: string; name: string };
  permissions: string[];
  csrfToken: string;
  /** Keycloak-Kontoverwaltung, Bereich „Anmelden“: Passkeys einrichten und entfernen (ADR-21). */
  accountSecurityUrl: string;
}

/** Antwort von `POST /auth/logout`: der Browser navigiert danach zum Keycloak-Logout. */
export interface LogoutResponseDto {
  logoutUrl: string;
}
