import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  function configure(isLoggedIn: boolean): Router {
    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'logout'], {
      isLoggedIn: signal(isLoggedIn),
    });

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceSpy }],
    });

    return TestBed.inject(Router);
  }

  it('allows navigation when a user is logged in', () => {
    configure(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('redirects to /login when nobody is logged in', () => {
    const router = configure(false);

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});
