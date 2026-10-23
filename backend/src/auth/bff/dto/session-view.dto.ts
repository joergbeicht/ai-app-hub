/** Antwort von `GET /auth/session`: wer angemeldet ist und welches CSRF-Token mitzusenden ist. */
export interface SessionViewDto {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    roles: string[];
  };
  csrfToken: string;
}

/** Antwort von `POST /auth/logout`: der Browser navigiert danach zum Keycloak-Logout. */
export interface LogoutResponseDto {
  logoutUrl: string;
}
