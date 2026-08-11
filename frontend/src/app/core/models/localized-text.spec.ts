import {
  createLocalizedText,
  mergeLocalizedText,
  resolveLocalizedText,
  toLocalizedText,
} from './localized-text';

describe('localized-text helpers', () => {
  it('treats a plain string as German-only legacy content', () => {
    expect(toLocalizedText('Hallo')).toEqual({
      de: 'Hallo',
      en: '',
      es: '',
      fr: '',
      tr: '',
      it: '',
    });
  });

  it('resolves the active locale and falls back to German', () => {
    const text = createLocalizedText('Deutsch', 'de');
    text.en = 'English';

    expect(resolveLocalizedText(text, 'en')).toBe('English');
    expect(resolveLocalizedText(text, 'es')).toBe('Deutsch');
  });

  it('fills empty locales from a fallback map', () => {
    const merged = mergeLocalizedText(
      { de: 'Custom', en: '', es: '', fr: '' },
      {
        de: 'Asset DE',
        en: 'Asset EN',
        es: 'Asset ES',
        fr: 'Asset FR',
      },
    );

    expect(merged.de).toBe('Custom');
    expect(merged.en).toBe('Asset EN');
    expect(merged.es).toBe('Asset ES');
  });
});
