export const DEFAULT_RETURN_TO = '/';

const MAX_RETURN_TO_LENGTH = 512;
const FIRST_PRINTABLE_CHAR_CODE = 0x20;
const DELETE_CHAR_CODE = 0x7f;

/**
 * Nur relative Pfade der eigenen App, sonst Open Redirect über `/auth/login?returnTo=...`.
 * `//host` und `/\host` interpretieren Browser als fremden Host.
 */
export function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RETURN_TO_LENGTH) {
    return DEFAULT_RETURN_TO;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || hasForbiddenCharacter(raw)) {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}

function hasForbiddenCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < FIRST_PRINTABLE_CHAR_CODE || code === DELETE_CHAR_CODE || char === '\\';
  });
}
