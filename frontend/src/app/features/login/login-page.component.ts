import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import type { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LocalePreferencesService } from '../../core/services/locale-preferences.service';
import { BadgeLoginService } from '../../core/services/badge-login.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';

/** Fehlerzustände beim Ausweis-Scan (siehe ADR-7, "Weg A") - Übersetzungs-Keys unter `login.badgeLogin.*`. */
type BadgeScanError = 'notFound' | 'cameraError';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoPipe],
  providers: [provideTranslocoScope('login')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <div class="login-layout">
      <div class="login-header">
        <img class="login-logo" src="/favicon.svg" alt="" />
        <h1>{{ 'login.title' | transloco: {} : lang }}</h1>
        <p class="login-subline">{{ 'login.subline' | transloco: {} : lang }}</p>
      </div>

      @if (mode() === 'default') {
        <button mat-flat-button color="primary" class="login-button" (click)="login()">
          <mat-icon>login</mat-icon>
          {{ 'login.signIn' | transloco: {} : lang }}
        </button>

        <button mat-stroked-button class="badge-scan-toggle" (click)="startBadgeScan()">
          <mat-icon>badge</mat-icon>
          {{ 'login.badgeLogin.toggle' | transloco: {} : lang }}
        </button>
      } @else {
        <div class="badge-scan">
          <p class="badge-scan-instructions">
            {{ 'login.badgeLogin.instructions' | transloco: {} : lang }}
          </p>

          <video #scannerVideo class="badge-scan-video" autoplay muted playsinline></video>

          @if (scanError(); as errorKey) {
            <p class="badge-scan-error">
              {{ 'login.badgeLogin.' + errorKey | transloco: {} : lang }}
            </p>
          }

          <button mat-button class="badge-scan-cancel" (click)="cancelBadgeScan()">
            {{ 'login.badgeLogin.cancel' | transloco: {} : lang }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .login-layout {
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 420px;
        margin: 0 auto;
        padding: 3rem 1rem;
        text-align: center;
      }
      .login-header {
        margin-bottom: 2rem;
      }
      .login-logo {
        width: 48px;
        height: 48px;
        margin-bottom: 0.5rem;
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin: 0.25rem 0;
        color: var(--text-primary);
      }
      .login-subline {
        margin: 0;
        color: var(--text-secondary);
      }
      .login-button {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 1.5rem;
        height: 44px;
      }
      .badge-scan-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 1.5rem;
        height: 44px;
        margin-top: 0.75rem;
      }
      .badge-scan {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        gap: 0.75rem;
      }
      .badge-scan-instructions {
        margin: 0;
        color: var(--text-secondary);
      }
      .badge-scan-video {
        width: 100%;
        max-width: 360px;
        aspect-ratio: 4 / 3;
        border-radius: 8px;
        background: #000;
        object-fit: cover;
      }
      .badge-scan-error {
        margin: 0;
        color: var(--mat-sys-error, #b3261e);
      }
    `,
  ],
})
export class LoginPageComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly badgeLoginService = inject(BadgeLoginService);
  private readonly barcodeScannerService = inject(BarcodeScannerService);
  private readonly injector = inject(Injector);
  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;

  private readonly scannerVideo = viewChild<ElementRef<HTMLVideoElement>>('scannerVideo');
  private scanSubscription: Subscription | undefined;

  readonly mode = signal<'default' | 'badge-scan'>('default');
  readonly scanError = signal<BadgeScanError | null>(null);

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      void this.router.navigateByUrl('/');
    }
  }

  ngOnDestroy(): void {
    this.scanSubscription?.unsubscribe();
  }

  login(): void {
    this.authService.login();
  }

  /** Startet den Kamera-Scan für den Mitarbeiterausweis (siehe ADR-7, "Weg A"). */
  startBadgeScan(): void {
    this.scanError.set(null);
    this.mode.set('badge-scan');
    // `<video>` existiert erst nach dem nächsten Render-Zyklus (siehe `@if` im Template).
    afterNextRender(() => this.beginScanning(), { injector: this.injector });
  }

  cancelBadgeScan(): void {
    this.scanSubscription?.unsubscribe();
    this.scanSubscription = undefined;
    this.mode.set('default');
    this.scanError.set(null);
  }

  private beginScanning(): void {
    const video = this.scannerVideo()?.nativeElement;
    if (!video) {
      return;
    }
    this.scanSubscription = this.barcodeScannerService.startScanning(video).subscribe({
      next: (badgeCode) => this.handleScannedBadgeCode(badgeCode),
      error: () => this.scanError.set('cameraError'),
    });
  }

  private handleScannedBadgeCode(badgeCode: string): void {
    // Erster Treffer reicht - weitere Frames aus derselben Kamera-Session sollen keine parallelen
    // Lookups mehr auslösen, während wir bereits auf die Antwort warten.
    this.scanSubscription?.unsubscribe();

    this.badgeLoginService.lookupByBadgeCode(badgeCode).subscribe({
      next: (userPrincipalName) => this.authService.login(userPrincipalName),
      error: () => {
        this.scanError.set('notFound');
        this.beginScanning();
      },
    });
  }
}
