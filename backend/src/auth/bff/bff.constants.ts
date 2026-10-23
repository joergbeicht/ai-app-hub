/** `__Host-`: nur über HTTPS, ohne Domain-Attribut, Pfad `/` - kein Überschreiben durch Subdomains. */
export const SESSION_COOKIE = '__Host-hub_session';
export const LOGIN_TRANSACTION_COOKIE = '__Host-hub_login';

export const CSRF_HEADER = 'x-csrf-token';

/** Entspricht `ssoSessionMaxLifespan` bzw. `ssoSessionIdleTimeout` im Realm `axora`. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 10 * 60 * 60 * 1000;
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

/** Spart einen DB-Schreibzugriff pro Request; die Idle-Grenze verschiebt sich höchstens um eine Minute. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export const LOGIN_TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;

export const OIDC_SCOPES = 'openid profile email';
export const OIDC_CLOCK_TOLERANCE_SECONDS = 5;

/** Vorlauf, mit dem das Access-Token vor Ablauf erneuert wird (Uhrabweichung, Laufzeit zur IAM). */
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 30 * 1000;

/** So lange gelten die IAM-Rechte einer Sitzung, bevor sie neu abgefragt werden (ADR-20). */
export const ACCESS_RECHECK_INTERVAL_MS = 30 * 1000;

export const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
