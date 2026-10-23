import { randomBytes } from 'node:crypto';
import { TokenCipher } from './token-cipher';

describe('TokenCipher', () => {
  const cipher = new TokenCipher(randomBytes(32));

  it('round-trips a token without storing it in clear text', () => {
    const sealed = cipher.encrypt('eyJhbGciOiJSUzI1NiJ9.payload.signature');

    expect(sealed).not.toContain('payload');
    expect(cipher.decrypt(sealed)).toBe('eyJhbGciOiJSUzI1NiJ9.payload.signature');
  });

  it('uses a fresh IV for every encryption', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects tampered ciphertext', () => {
    const [version, iv, tag, data] = cipher.encrypt('token').split('.');
    const tampered = Buffer.from(data, 'base64url');
    tampered[0] ^= 0xff;

    expect(() => cipher.decrypt([version, iv, tag, tampered.toString('base64url')].join('.'))).toThrow();
  });

  it('rejects a different key', () => {
    const sealed = cipher.encrypt('token');

    expect(() => new TokenCipher(randomBytes(32)).decrypt(sealed)).toThrow();
  });

  it('requires a 256-bit key', () => {
    expect(() => new TokenCipher(randomBytes(16))).toThrow('32 bytes');
  });
});
