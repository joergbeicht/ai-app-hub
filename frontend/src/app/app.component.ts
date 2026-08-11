import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { APP_VERSION } from './core/app-version';
import { RUNTIME_CONFIG } from './core/runtime-config';
import type { AppLocale } from './core/models/locale.model';
import { AuthService } from './core/services/auth.service';
import { LocalePreferencesService } from './core/services/locale-preferences.service';
import { PwaUpdateService } from './core/services/pwa-update.service';
import { getUserAvatarColor, getUserInitials } from './core/utils/avatar.util';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    UpperCasePipe,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    TranslocoPipe,
  ],
  providers: [provideTranslocoScope('shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <div class="app-shell">
      @if (!isLoginPage()) {
        <mat-toolbar class="header-toolbar">
          <a
            class="toolbar-logo"
            routerLink="/"
            [attr.aria-label]="'shell.nav.home' | transloco: {} : lang"
          >
            <img class="toolbar-logo-img" src="assets/axora-logo.png" alt="" />
            <div class="toolbar-logo-divider" aria-hidden="true"></div>
            <mat-icon class="toolbar-title-icon" aria-hidden="true">apps</mat-icon>
            <span class="toolbar-title">{{ 'shell.title' | transloco: {} : lang }}</span>
            <span class="toolbar-version">v{{ appVersion }}</span>
          </a>
          <span class="spacer"></span>
          @if (isLoggedIn()) {
            <a
              mat-icon-button
              routerLink="/settings"
              [attr.aria-label]="'shell.nav.settings' | transloco: {} : lang"
            >
              <mat-icon>settings</mat-icon>
            </a>
            <button
              mat-button
              class="toolbar-lang-button"
              [matMenuTriggerFor]="langMenu"
              [attr.aria-label]="'shell.nav.language' | transloco: {} : lang"
            >
              <mat-icon>language</mat-icon>
              <span class="toolbar-lang-code">{{ lang | uppercase }}</span>
            </button>
            <mat-menu #langMenu="matMenu" class="toolbar-lang-menu">
              @for (locale of locales; track locale.code) {
                <button
                  mat-menu-item
                  [class.toolbar-lang-option--active]="locale.code === lang"
                  (click)="selectLanguage(locale.code)"
                >
                  <mat-icon>{{ locale.code === lang ? 'check' : '' }}</mat-icon>
                  <span>{{ locale.nativeLabel }}</span>
                </button>
              }
            </mat-menu>
            <button mat-button [matMenuTriggerFor]="userMenu" class="toolbar-user-button">
              <span class="toolbar-user-avatar" [style.background]="userAvatarColor()">
                {{ userInitials() }}
              </span>
              <span class="toolbar-user-name">{{ currentUser()?.displayName }}</span>
            </button>
            <mat-menu #userMenu="matMenu">
              <div class="user-menu-header" role="presentation" (click)="$event.stopPropagation()">
                <span class="user-menu-avatar" [style.background]="userAvatarColor()">
                  {{ userInitials() }}
                </span>
                <div class="user-menu-details">
                  <span class="user-menu-name">{{ currentUser()?.displayName }}</span>
                  <span class="user-menu-role">{{ currentUser()?.role }}</span>
                  @if (currentUser()?.email) {
                    <span class="user-menu-email">{{ currentUser()?.email }}</span>
                  }
                </div>
              </div>
              <div class="user-menu-cluster" role="presentation" (click)="$event.stopPropagation()">
                <mat-icon inline>dns</mat-icon>
                <span
                  >{{ 'shell.user.cluster' | transloco: {} : lang }}:
                  <strong>{{ clusterName }}</strong></span
                >
              </div>
              <button mat-menu-item (click)="logout()">
                <mat-icon>logout</mat-icon>
                <span>{{ 'shell.user.logout' | transloco: {} : lang }}</span>
              </button>
            </mat-menu>
          }
        </mat-toolbar>
      }
      <main class="main-content" [class.main-content--login]="isLoginPage()">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
      .app-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background-color: var(--bg-primary);
        color: var(--text-primary);
      }
      .header-toolbar {
        flex-shrink: 0;
        background-color: var(--bg-secondary) !important;
        color: var(--text-primary) !important;
        border-bottom: 1px solid var(--border-primary);
        min-height: 56px;
      }
      .toolbar-logo {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 56px;
        text-decoration: none;
        color: inherit;
        border-radius: 4px;
        outline-offset: 2px;
      }
      .toolbar-logo:hover .toolbar-title,
      .toolbar-logo:hover .toolbar-title-icon {
        color: var(--primary-300);
      }
      .toolbar-logo:focus-visible {
        outline: 2px solid var(--primary-400);
      }
      .toolbar-logo-img {
        display: block;
        height: 22px;
        width: auto;
        flex-shrink: 0;
        mix-blend-mode: lighten;
      }
      .toolbar-logo-divider {
        width: 1px;
        align-self: center;
        height: 28px;
        background: var(--primary-400);
        flex-shrink: 0;
      }
      .toolbar-title-icon {
        display: flex;
        align-items: center;
        font-size: 26px;
        width: 26px;
        height: 26px;
        color: var(--primary-400);
      }
      .toolbar-title {
        font-weight: 400;
        font-size: 1rem;
        color: var(--primary-400);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .toolbar-version {
        display: inline-flex;
        align-items: center;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--primary-200);
        background: color-mix(in srgb, var(--primary-500) 28%, transparent);
        border: 1px solid var(--primary-400);
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        letter-spacing: 0.05em;
        line-height: 1.2;
        flex-shrink: 0;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .toolbar-lang-button {
        min-width: auto;
        padding: 0 0.5rem;
        color: var(--text-primary) !important;
      }
      .toolbar-lang-button .mat-icon {
        margin-right: 0.15rem;
        color: var(--primary-400);
      }
      .toolbar-lang-code {
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        line-height: 1;
      }
      .toolbar-lang-option--active {
        color: var(--primary-400);
      }
      .toolbar-user-button {
        margin-left: 0.25rem;
        color: var(--text-primary) !important;
      }
      .toolbar-user-avatar,
      .user-menu-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 0.75rem;
        font-weight: 600;
        margin-right: 0.5rem;
      }
      .toolbar-user-name {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .user-menu-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        min-width: 220px;
      }
      .user-menu-avatar {
        width: 40px;
        height: 40px;
        font-size: 0.85rem;
        margin-right: 0;
        flex-shrink: 0;
      }
      .user-menu-details {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
      }
      .user-menu-name {
        font-weight: 600;
        color: var(--text-primary);
      }
      .user-menu-role,
      .user-menu-email,
      .user-menu-cluster {
        font-size: 0.75rem;
        color: var(--text-secondary);
      }
      .user-menu-cluster {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 1rem;
        border-top: 1px solid var(--border-primary);
        cursor: default;
      }
      .user-menu-cluster mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
      .user-menu-cluster strong {
        color: var(--text-primary);
      }
      .main-content {
        flex: 1;
        padding: 1rem;
        max-width: 100%;
      }
      .main-content--login {
        padding: 0;
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }
      @media (min-width: 600px) {
        .main-content:not(.main-content--login) {
          padding: 1.5rem;
        }
      }
      @media (max-width: 480px) {
        .toolbar-user-name {
          display: none;
        }
      }
    `,
  ],
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly localePreferences = inject(LocalePreferencesService);
  private readonly pwaUpdate = inject(PwaUpdateService);
  private readonly router = inject(Router);

  readonly appVersion = APP_VERSION;
  readonly clusterName = inject(RUNTIME_CONFIG).clusterName;
  readonly activeLanguage = this.localePreferences.activeLanguage;
  readonly locales = this.localePreferences.availableLocales;

  private readonly currentUrl = signal(this.router.url);

  readonly currentUser = this.authService.currentUser;
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoginPage = computed(() => this.currentUrl().startsWith('/login'));

  readonly userInitials = computed(() => {
    const user = this.currentUser();
    return user ? getUserInitials(user.displayName) : '';
  });

  readonly userAvatarColor = computed(() => {
    const user = this.currentUser();
    return user ? getUserAvatarColor(user.displayName) : '';
  });

  constructor() {
    this.pwaUpdate.init();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }

  /** Header language switch persists immediately (unlike settings preview). */
  selectLanguage(locale: AppLocale): void {
    this.localePreferences.saveDefaultLanguage(locale);
  }

  /** MSAL navigates away via full-page redirect to Azure's logout endpoint, then back – no local routing needed. */
  logout(): void {
    this.authService.logout();
  }
}
