import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/hub/hub-page.component').then((m) => m.HubPageComponent) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page.component').then((m) => m.SettingsPageComponent) },
  { path: 'pitch-audi', loadComponent: () => import('./features/pitch/pitch-audi-slide.component').then((m) => m.PitchAudiSlideComponent) },
  { path: '**', redirectTo: '' },
];
