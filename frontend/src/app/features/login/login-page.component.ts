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
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
        <div class="pin-entry">
          <p class="pin-entry-prompt">{{ 'login.tabletLogin.pinPrompt' | transloco: {} : lang }}</p>

          <div class="pin-dots" aria-hidden="true">
            @for (slot of pinSlots; track slot) {
              <span class="pin-dot" [class.pin-dot--filled]="slot < pin.length"></span>
            }
          </div>

          @if (pinError(); as errorKey) {
            <p class="pin-entry-error">
              {{ 'login.tabletLogin.' + errorKey | transloco: {} : lang }}
            </p>
          }

          <!-- Fester Zahlenblock statt Systemtastatur (siehe ADR-12) - auf geteilten Tablets ist
               ein grosses, immer gleich aussehendes Tippfeld verlaesslicher als die je nach
               Geraet/Browser unterschiedliche virtuelle Tastatur. Sendet automatisch ab, sobald
               4 Ziffern eingegeben sind. -->
          <div
            class="pin-keypad"
            role="group"
            [attr.aria-label]="'login.tabletLogin.pinLabel' | transloco: {} : lang"
          >
            @for (digit of keypadDigits; track digit) {
              <button
                mat-flat-button
                type="button"
                class="pin-key"
                [disabled]="submitting()"
                (click)="pressDigit(digit)"
              >
                {{ digit }}
              </button>
            }
            <span class="pin-key pin-key--spacer" aria-hidden="true"></span>
            <button
              mat-flat-button
              type="button"
              class="pin-key"
              [disabled]="submitting()"
              (click)="pressDigit('0')"
            >
              0
            </button>
            <button
              mat-icon-button
              type="button"
              class="pin-key pin-key--backspace"
              [disabled]="submitting() || pin.length === 0"
              [attr.aria-label]="'login.tabletLogin.backspace' | transloco: {} : lang"
              (click)="pressBackspace()"
            >
              <mat-icon>backspace</mat-icon>
            </button>
          </div>

          <button mat-button type="button" (click)="cancelBadgeScan()">
            {{ 'login.tabletLogin.cancel' | transloco: {} : lang }}
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
        gap: 1rem;
      }
      .pin-entry-prompt {
        margin: 0;
        color: var(--text-secondary);
      }
      .pin-dots {
        display: flex;
        gap: 1rem;
      }
      .pin-dot {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid var(--border-primary);
        background: transparent;
        transition: background-color 0.15s ease;
      }
      .pin-dot--filled {
        background: var(--primary-400);
        border-color: var(--primary-400);
      }
      .pin-keypad {
        display: grid;
        grid-template-columns: repeat(3, 72px);
        gap: 0.75rem;
        justify-content: center;
      }
      .pin-key {
        width: 72px;
        height: 72px;
        min-width: 0;
        border-radius: 50%;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .pin-key--spacer {
        pointer-events: none;
      }
      .pin-key--backspace {
        width: 72px;
        height: 72px;
        font-size: 1.5rem;
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

  /** Für `@for` über die 4 Punkte/Tasten - keine Signals nötig, ändert sich nie zur Laufzeit. */
  readonly pinSlots = [0, 1, 2, 3];
  readonly keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  /** Plain (kein Signal): wird per Tastendruck aus dem Zahlenblock direkt gesetzt/gelesen. */
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

  /** Ziffern-Taste des Zahlenblocks - sendet automatisch ab, sobald der 4. PIN eingegeben ist. */
  pressDigit(digit: string): void {
    if (this.submitting() || this.pin.length >= 4) {
      return;
    }
    this.pin += digit;
    this.pinError.set(null);
    if (this.pin.length === 4) {
      this.submitPin();
    }
  }

  pressBackspace(): void {
    if (this.submitting() || this.pin.length === 0) {
      return;
    }
    this.pin = this.pin.slice(0, -1);
    this.pinError.set(null);
  }

  /**
   * Sendet den eingegebenen PIN an `TabletAuthService` (siehe ADR-12) - bei Erfolg direkt zur
   * App, ohne MSAL-Redirect. Der Backend-Status-Code entscheidet über die angezeigte
   * Fehlermeldung (401 = falscher PIN, 403 = nicht freigeschaltet/gesperrt, 429 = zu viele
   * Versuche pro IP, alles andere = generischer Fehler).
   */
  private submitPin(): void {
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
