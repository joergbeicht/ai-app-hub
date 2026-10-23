import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  const state = { url: '/settings/apps' } as RouterStateSnapshot;

  function configure(isLoggedIn: boolean): void {
    authServiceSpy = jasmine.createSpyObj<AuthService>(
      'AuthService',
      ['login', 'logout', 'redirectToLogin'],
      { isLoggedIn: signal(isLoggedIn) },
    );
    authServiceSpy.redirectToLogin.and.returnValue(false);

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceSpy }],
    });
  }

  it('allows navigation when a user is logged in', () => {
    configure(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(result).toBe(true);
    expect(authServiceSpy.redirectToLogin).not.toHaveBeenCalled();
  });

  it('lets the auth implementation start the login with the requested URL', () => {
    configure(false);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(result).toBe(false);
    expect(authServiceSpy.redirectToLogin).toHaveBeenCalledWith('/settings/apps');
  });
});
