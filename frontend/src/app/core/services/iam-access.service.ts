import { Injectable, computed, inject } from '@angular/core';
import { BffSessionStore } from '../auth/bff-session.store';
import type { IamPermission } from '../models/iam.model';

/**
 * Axora-IAM-Rechte der aktuellen Sitzung (ADR-20). Steuert nur, was die Oberfläche anbietet -
 * entschieden wird serverseitig in der IAM. Im Entra-Modus gibt es keine IAM-Sitzung, alle
 * Prüfungen liefern dann `false`.
 */
@Injectable({ providedIn: 'root' })
export class IamAccessService {
  private readonly store = inject(BffSessionStore);
  private readonly permissions = computed(() => new Set(this.store.session()?.permissions ?? []));

  readonly organization = computed(() => this.store.session()?.organization ?? null);

  can(permission: IamPermission): boolean {
    return this.permissions().has(permission);
  }

  /** Vergleich über die E-Mail, weil die Sitzung die Keycloak-ID kennt, die IAM die Principal-ID. */
  isCurrentUser(email: string | null): boolean {
    const own = this.store.session()?.user.email;
    return !!own && !!email && own.toLowerCase() === email.toLowerCase();
  }
}
