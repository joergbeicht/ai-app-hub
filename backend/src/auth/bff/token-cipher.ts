import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

export const TOKEN_CIPHER = Symbol('TOKEN_CIPHER');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';

/**
 * Verschlüsselt die Keycloak-Tokens der Sitzung (ADR-20). Format `v1.<iv>.<tag>.<ciphertext>`
 * (base64url); das Versionspräfix erlaubt später einen Schlüsselwechsel ohne Datenmigration.
 */
export class TokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new Error(`SESSION_TOKEN_KEY must decode to ${KEY_BYTES} bytes`);
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [FORMAT_VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split('.');
    if (version !== FORMAT_VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unsupported token format');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** `SESSION_TOKEN_KEY`: 32 Byte, base64-kodiert (`openssl rand -base64 32`). */
export function createTokenCipher(config: ConfigService): TokenCipher {
  return new TokenCipher(Buffer.from(config.getOrThrow<string>('SESSION_TOKEN_KEY'), 'base64'));
}
