import { HttpErrorResponse } from '@angular/common/http';
import { iamErrorKey } from './iam-error';

describe('iamErrorKey', () => {
  it('maps known IAM problem codes to their translation key', () => {
    const error = new HttpErrorResponse({
      status: 403,
      error: { code: 'SELF_MODIFICATION_FORBIDDEN', detail: 'nope' },
    });

    expect(iamErrorKey(error, 'fallback')).toBe('settings.iam.errors.SELF_MODIFICATION_FORBIDDEN');
  });

  it('falls back for unknown codes, plain errors and non-HTTP failures', () => {
    expect(iamErrorKey(new HttpErrorResponse({ status: 500, error: { code: 'INTERNAL' } }), 'fallback')).toBe('fallback');
    expect(iamErrorKey(new HttpErrorResponse({ status: 0, error: 'offline' }), 'fallback')).toBe('fallback');
    expect(iamErrorKey(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
