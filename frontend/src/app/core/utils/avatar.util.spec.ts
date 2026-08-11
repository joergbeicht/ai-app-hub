import { getUserAvatarColor, getUserInitials } from './avatar.util';

describe('avatar.util', () => {
  describe('getUserInitials', () => {
    it('uses the first letter of the first two words for multi-word names', () => {
      expect(getUserInitials('Alex Admin')).toBe('AA');
      expect(getUserInitials('Sam Nutzer')).toBe('SN');
    });

    it('falls back to the first two characters for a single word', () => {
      expect(getUserInitials('Cursor')).toBe('CU');
    });

    it('returns "?" for an empty or blank name', () => {
      expect(getUserInitials('')).toBe('?');
      expect(getUserInitials('   ')).toBe('?');
    });

    it('collapses extra whitespace between words', () => {
      expect(getUserInitials('  Jamie   Gast  ')).toBe('JG');
    });
  });

  describe('getUserAvatarColor', () => {
    it('returns a deterministic theme token for the same name', () => {
      const first = getUserAvatarColor('Alex Admin');
      const second = getUserAvatarColor('Alex Admin');

      expect(first).toBe(second);
      expect(first).toMatch(/^var\(--avatar-color-[1-8]\)$/);
    });

    it('resolves to a CSS custom property, never a hardcoded hex value', () => {
      expect(getUserAvatarColor('Sam Nutzer')).not.toMatch(/#[0-9a-f]{3,6}/i);
    });
  });
});
