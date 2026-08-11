import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';
import type { ManagedAppRole, ManagedUser } from '../models/managed-user.model';

/**
 * Rollenverwaltung über das `app-hub-backend` statt Azure Portal (siehe ADR-6). Die eigentliche
 * Berechtigungsprüfung (nur `Administrator`) passiert serverseitig (`RolesGuard`) - dieser Service
 * ruft nur die Endpunkte auf, der `MsalInterceptor` hängt das Access Token automatisch an
 * (siehe `msalInterceptorConfigFactory` in `core/auth/msal-config.ts`).
 */
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly backendApiUrl = inject(RUNTIME_CONFIG).backendApiUrl;

  listUsers(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.backendApiUrl}/users`);
  }

  updateRole(userId: string, role: ManagedAppRole): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.backendApiUrl}/users/${userId}/role`, { role });
  }
}
