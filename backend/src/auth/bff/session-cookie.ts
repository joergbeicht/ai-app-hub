import type { CookieOptions, Request } from 'express';
import { LOGIN_TRANSACTION_LIFETIME_MS } from './bff.constants';

/** Strict: das Frontend ruft das Backend same-site auf; fremde Seiten bekommen die Sitzung nie mit. */
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: expiresAt };
}

/** Lax: der Rücksprung von Keycloak ist eine Top-Level-Navigation, ggf. von einer anderen Site. */
export function loginTransactionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: LOGIN_TRANSACTION_LIFETIME_MS,
  };
}

export function clearedCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: true, path: '/' };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
