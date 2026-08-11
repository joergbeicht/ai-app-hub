import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    // Default-deny: every child route is protected without having to add `canActivate` again for
    // each new route. Only `login` (above) sits outside this guard.
    path: '',
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/hub/hub-page.component').then((m) => m.HubPageComponent),
      },
      {
        path: 'settings',
        pathMatch: 'full',
        redirectTo: 'settings/general',
      },
      {
        path: 'settings/:tab',
        loadComponent: () =>
          import('./features/settings/settings-page.component').then(
            (m) => m.SettingsPageComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
