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
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import type { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LocalePreferencesService } from '../../core/services/locale-preferences.service';
import { TabletAuthService } from '../../core/services/tablet-auth.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';

/** Fehlerzustände beim Ausweis-Scan/PIN-Login (siehe ADR-12) - Übersetzungs-Keys unter `login.*`. */
type BadgeScanError = 'notFound' | 'cameraError';
type PinError = 'wrongPin' | 'notAllowed' | 'rateLimited' | 'notFound' | 'unknownError';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
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
      } @else if (mode() === 'badge-scan') {
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
      } @else {
        <form class="pin-entry" (ngSubmit)="submitPin()">
          <p class="pin-entry-prompt">{{ 'login.tabletLogin.pinPrompt' | transloco: {} : lang }}</p>

          <mat-form-field>
            <mat-label>{{ 'login.tabletLogin.pinLabel' | transloco: {} : lang }}</mat-label>
            <input
              matInput
              type="password"
              inputmode="numeric"
              maxlength="4"
              autocomplete="off"
              [(ngModel)]="pin"
              name="pin"
            />
          </mat-form-field>

          @if (pinError(); as errorKey) {
            <p class="pin-entry-error">
              {{ 'login.tabletLogin.' + errorKey | transloco: {} : lang }}
            </p>
          }

          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="pin.length !== 4 || submitting()"
          >
            {{ 'login.tabletLogin.submit' | transloco: {} : lang }}
          </button>
          <button mat-button type="button" (click)="cancelBadgeScan()">
            {{ 'login.tabletLogin.cancel' | transloco: {} : lang }}
          </button>
        </form>
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
      .badge-scan-error,
      .pin-entry-error {
        margin: 0;
        color: var(--mat-sys-error, #b3261e);
      }
      .pin-entry {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        gap: 0.5rem;
      }
      .pin-entry-prompt {
        margin: 0;
        color: var(--text-secondary);
      }
      .pin-entry mat-form-field {
        width: 160px;
      }
      .pin-entry input {
        text-align: center;
        letter-spacing: 0.5rem;
        font-size: 1.25rem;
      }
    `,
  ],
})
export class LoginPageComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tabletAuthService = inject(TabletAuthService);
  private readonly barcodeScannerService = inject(BarcodeScannerService);
  private readonly injector = inject(Injector);
  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;

  private readonly scannerVideo = viewChild<ElementRef<HTMLVideoElement>>('scannerVideo');
  private scanSubscription: Subscription | undefined;
  private pendingBadgeCode: string | null = null;

  readonly mode = signal<'default' | 'badge-scan' | 'pin-entry'>('default');
  readonly scanError = signal<BadgeScanError | null>(null);
  readonly pinError = signal<PinError | null>(null);
  readonly submitting = signal(false);

  /** Plain (kein Signal): `[(ngModel)]` unterstützt kein direktes Zwei-Wege-Binding auf Signals. */
  pin = '';

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

  /** Startet den Kamera-Scan für den Mitarbeiterausweis (siehe ADR-12). */
  startBadgeScan(): void {
    this.scanError.set(null);
    this.mode.set('badge-scan');
    // `<video>` existiert erst nach dem nächsten Render-Zyklus (siehe `@if` im Template).
    afterNextRender(() => this.beginScanning(), { injector: this.injector });
  }

  cancelBadgeScan(): void {
    this.scanSubscription?.unsubscribe();
    this.scanSubscription = undefined;
    this.pendingBadgeCode = null;
    this.pin = '';
    this.pinError.set(null);
    this.mode.set('default');
    this.scanError.set(null);
  }

  /**
   * Sendet den eingegebenen PIN an `TabletAuthService` (siehe ADR-12) - bei Erfolg direkt zur
   * App, ohne MSAL-Redirect. Der Backend-Status-Code entscheidet über die angezeigte
   * Fehlermeldung (401 = falscher PIN, 403 = nicht freigeschaltet/gesperrt, 429 = zu viele
   * Versuche pro IP, alles andere = generischer Fehler).
   */
  submitPin(): void {
    const badgeCode = this.pendingBadgeCode;
    if (!badgeCode || this.pin.length !== 4) {
      return;
    }
    this.submitting.set(true);
    this.pinError.set(null);
    this.tabletAuthService.loginWithPin(badgeCode, this.pin).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.pin = '';
        this.pinError.set(this.mapPinError(error));
      },
    });
  }

  private mapPinError(error: HttpErrorResponse): PinError {
    switch (error.status) {
      case 401:
        return 'wrongPin';
      case 403:
        return 'notAllowed';
      case 404:
        return 'notFound';
      case 429:
        return 'rateLimited';
      default:
        return 'unknownError';
    }
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

  /**
   * Nach dem Scan zunächst versuchen, ohne PIN einzuloggen (gültiges Device-Token für diesen
   * Badge-Code auf diesem Tablet, siehe ADR-12) - erst wenn das nicht klappt (kein oder
   * abgelaufenes Device-Token), die PIN-Eingabe anzeigen. Ob der Badge-Code überhaupt einem
   * Tablet-Benutzer zugeordnet ist, prüft das Backend erst beim tatsächlichen PIN-Submit
   * (`submitPin()`) - ein unbekannter Badge-Code zeigt also zunächst ganz normal die
   * PIN-Eingabe, meldet den Fehler (`notFound`) aber spätestens beim Abschicken.
   */
  private handleScannedBadgeCode(badgeCode: string): void {
    // Erster Treffer reicht - weitere Frames aus derselben Kamera-Session sollen keine parallelen
    // Versuche mehr auslösen, während wir bereits auf die Antwort warten.
    this.scanSubscription?.unsubscribe();
    this.pendingBadgeCode = badgeCode;

    this.tabletAuthService.tryRenewFromDeviceToken(badgeCode).subscribe((session) => {
      if (session) {
        void this.router.navigateByUrl('/');
        return;
      }
      this.pin = '';
      this.pinError.set(null);
      this.mode.set('pin-entry');
    });
  }
}
