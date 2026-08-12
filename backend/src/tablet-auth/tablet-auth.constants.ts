/**
 * PIN-Format für den Tablet-Login (siehe ADR-12): bewusst genau 4 Ziffern - kurz genug, um auf
 * einem geteilten Tablet zumutbar zu sein, aber wegen des kleinen Zahlenraums zwingend mit
 * Lockout (siehe unten) kombiniert.
 */
export const PIN_PATTERN = /^\d{4}$/;

/** Fehlversuche, bevor ein Konto vorübergehend gesperrt wird (siehe ADR-12). */
export const MAX_FAILED_PIN_ATTEMPTS = 5;

/** Sperrdauer nach Erreichen von `MAX_FAILED_PIN_ATTEMPTS` (siehe ADR-12). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** Gültigkeit des kurzlebigen Session-Tokens - orientiert an einer Werkstatt-Arbeitsschicht. */
export const SESSION_TOKEN_TTL_SECONDS = 8 * 60 * 60;

/** Gültigkeit des "1 Jahr nicht erneut fragen"-Device-Tokens (siehe ADR-12). */
export const DEVICE_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

/** Aussteller-Claim unserer eigenen (nicht von Entra stammenden) Tablet-Tokens. */
export const TABLET_TOKEN_ISSUER = 'ai-app-hub-backend';

export type TabletTokenUse = 'tablet-session' | 'tablet-device';
