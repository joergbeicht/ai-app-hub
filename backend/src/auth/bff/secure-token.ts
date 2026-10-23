import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

/** 256 Bit Zufall, base64url - auch als PKCE-Verifier gültig (43 Zeichen, nur unreservierte Zeichen). */
export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
