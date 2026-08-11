import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';

interface BadgeLookupResult {
  userPrincipalName: string;
}

/**
 * Löst einen gescannten Mitarbeiterausweis-Barcode in einen Benutzernamen auf (siehe ADR-7,
 * "Weg A"). Bewusst OHNE Access Token - der Aufruf passiert VOR dem eigentlichen Login (siehe
 * `msalInterceptorConfigFactory`, das `/badge-login/*` deshalb nicht abdeckt).
 */
@Injectable({ providedIn: 'root' })
export class BadgeLoginService {
  private readonly http = inject(HttpClient);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  lookupByBadgeCode(badgeCode: string): Observable<string> {
    return this.http
      .get<BadgeLookupResult>(`${this.backendApiUrl}/badge-login/${encodeURIComponent(badgeCode)}`)
      .pipe(map((result) => result.userPrincipalName));
  }
}
