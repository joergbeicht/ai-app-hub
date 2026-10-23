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

/** Ohne eine dieser Client-Rollen gibt es keine Sitzung (Default Deny, fehlendes Entitlement). */
export const HUB_ENTITLED_ROLES = ['Administrator', 'User'] as const;

export const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
