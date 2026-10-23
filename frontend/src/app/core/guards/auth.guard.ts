import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);

  if (authService.isLoggedIn()) {
    return true;
  }

  return authService.redirectToLogin(state.url);
};
