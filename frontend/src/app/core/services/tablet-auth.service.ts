import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';

interface TabletAuthResult {
  sessionToken: string;
  deviceToken: string;
  expiresIn: number;
  displayName: string;
  userPrincipalName: string;
  roles: string[];
}

/** Aktive Sitzung eines Tablet-Benutzers (siehe ADR-12) - unabhängig von MSAL/Entra-Tokens im Browser. */
export interface TabletSession {
  sessionToken: string;
  displayName: string;
  userPrincipalName: string;
  roles: string[];
  expiresAt: number;
}

/**
 * PIN+ROPC-Login für Tablet-Benutzer (siehe ADR-12) - ersetzt für diese Zielgruppe den
 * MSAL-Redirect mit echtem Entra-Passwort (ADR-7, "Weg A"). Das Frontend bekommt das echte
 * Entra-Passwort nie zu Gesicht, nur das vom Backend selbst ausgestellte Session-/Device-Token.
 *
 * Das Device-Token wird pro Badge-Code in `localStorage` gehalten (nicht pro Gerät oder Browser-
 * Sitzung) - genau das ermöglicht den "1 Jahr keinen PIN mehr abfragen"-Flow auf einem geteilten
 * Tablet: Wer diesen Ausweis das nächste Mal an diesem Gerät scannt, kommt ohne PIN wieder herein.
 */
@Injectable({ providedIn: 'root' })
export class TabletAuthService {
  private readonly http = inject(HttpClient);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  private readonly _session = signal<TabletSession | null>(null);
  readonly session = this._session.asReadonly();

  loginWithPin(badgeCode: string, pin: string): Observable<TabletSession> {
    return this.http
      .post<TabletAuthResult>(`${this.backendApiUrl}/tablet-auth/login`, { badgeCode, pin })
      .pipe(map((result) => this.applyResult(badgeCode, result)));
  }

  /**
   * Versucht eine Sitzung ohne PIN zu bekommen, falls für diesen Badge-Code lokal noch ein
   * gültiges Device-Token gespeichert ist - liefert `null` (kein Fehler), wenn keins vorhanden
   * ist oder das Backend es ablehnt (z. B. abgelaufen), damit der Aufrufer einfach auf die
   * PIN-Eingabe zurückfallen kann.
   */
  tryRenewFromDeviceToken(badgeCode: string): Observable<TabletSession | null> {
    const deviceToken = this.readDeviceToken(badgeCode);
    if (!deviceToken) {
      return of(null);
    }
    return this.http
      .post<TabletAuthResult>(`${this.backendApiUrl}/tablet-auth/renew`, { deviceToken })
      .pipe(
        map((result) => this.applyResult(badgeCode, result)),
        catchError(() => {
          this.clearDeviceToken(badgeCode);
          return of(null);
        }),
      );
  }

  /**
   * Beendet nur die aktuelle Sitzung - das Device-Token bleibt bewusst erhalten (siehe
   * Klassenkommentar): Ein Logout soll den "1 Jahr"-Skip-PIN-Vorteil für den nächsten Login mit
   * demselben Ausweis an diesem Tablet nicht zunichtemachen.
   */
  logout(): void {
    this._session.set(null);
  }

  private applyResult(badgeCode: string, result: TabletAuthResult): TabletSession {
    this.writeDeviceToken(badgeCode, result.deviceToken);
    const session: TabletSession = {
      sessionToken: result.sessionToken,
      displayName: result.displayName,
      userPrincipalName: result.userPrincipalName,
      roles: result.roles,
      expiresAt: Date.now() + result.expiresIn * 1000,
    };
    this._session.set(session);
    return session;
  }

  private deviceTokenKey(badgeCode: string): string {
    return `tabletDeviceToken:${badgeCode}`;
  }

  private readDeviceToken(badgeCode: string): string | null {
    return localStorage.getItem(this.deviceTokenKey(badgeCode));
  }

  private writeDeviceToken(badgeCode: string, token: string): void {
    localStorage.setItem(this.deviceTokenKey(badgeCode), token);
  }

  private clearDeviceToken(badgeCode: string): void {
    localStorage.removeItem(this.deviceTokenKey(badgeCode));
  }
}
