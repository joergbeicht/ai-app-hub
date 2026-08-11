import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/services/auth.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { MANAGED_APP_ROLES, type ManagedAppRole, type ManagedUser } from '../../../core/models/managed-user.model';

/**
 * Rollenverwaltung ohne Azure Portal (siehe ADR-6): Liste aller Tenant-Nutzer + Rollen-Dropdown,
 * ruft `app-hub-backend` über `UserAdminService` auf. Nur sichtbar/aufrufbar für `Administrator`
 * (Tab-Sichtbarkeit in `settings-page.component.ts`) - die eigentliche Durchsetzung passiert
 * serverseitig (`RolesGuard`), diese Komponente ist reine UX.
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = translocoService.getActiveLang();
    <p class="tab-subtitle">{{ 'settings.users.subtitle' | transloco: {} : lang }}</p>

    @if (loading()) {
      <div class="state-row">
        <mat-spinner diameter="28"></mat-spinner>
        <span>{{ 'settings.users.loading' | transloco: {} : lang }}</span>
      </div>
    } @else if (error()) {
      <div class="state-row state-row--error">
        <mat-icon>error_outline</mat-icon>
        <span>{{ error() }}</span>
        <button mat-stroked-button type="button" (click)="load()">
          {{ 'settings.users.retry' | transloco: {} : lang }}
        </button>
      </div>
    } @else {
      <div class="user-list">
        @for (user of users(); track user.id) {
          <div class="user-row">
            <div class="user-info">
              <span class="user-name">{{ user.displayName }}</span>
              @if (user.email) {
                <span class="user-email">{{ user.email }}</span>
              }
              @if (isCurrentUser(user)) {
                <span class="user-badge">{{ 'settings.users.you' | transloco: {} : lang }}</span>
              }
            </div>
            <mat-select
              class="role-select"
              [value]="user.role"
              [disabled]="savingUserId() === user.id"
              (selectionChange)="onRoleChange(user, $event.value)"
            >
              @for (role of roles; track role) {
                <mat-option [value]="role">{{
                  'settings.users.role.' + role | transloco: {} : lang
                }}</mat-option>
              }
            </mat-select>
            @if (savingUserId() === user.id) {
              <mat-spinner diameter="20"></mat-spinner>
            }
          </div>
        } @empty {
          <p class="tab-subtitle">{{ 'settings.users.empty' | transloco: {} : lang }}</p>
        }
      </div>
    }
  `,
  styles: [
    `
      .tab-subtitle {
        margin: 0 0 1.25rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
      .state-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-secondary);
      }
      .state-row--error {
        color: var(--error-500, #d32f2f);
      }
      .user-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .user-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
        border: 1px solid var(--border-primary);
      }
      .user-info {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
      }
      .user-name {
        font-weight: 500;
      }
      .user-email {
        color: var(--text-secondary);
        font-size: 0.85rem;
      }
      .user-badge {
        margin-top: 0.25rem;
        align-self: flex-start;
        font-size: 0.75rem;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--primary-500) 16%, transparent);
        color: var(--primary-400);
      }
      .role-select {
        width: 180px;
        flex: 0 0 auto;
      }
    `,
  ],
})
export class UserManagementComponent implements OnInit {
  private readonly userAdminService = inject(UserAdminService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly translocoService = inject(TranslocoService);

  readonly roles = MANAGED_APP_ROLES;
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly savingUserId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userAdminService.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translocoService.translate('settings.users.loadError'));
        this.loading.set(false);
      },
    });
  }

  onRoleChange(user: ManagedUser, role: ManagedAppRole): void {
    if (role === user.role) {
      return;
    }
    this.savingUserId.set(user.id);
    this.userAdminService.updateRole(user.id, role).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.savingUserId.set(null);
        this.snackBar.open(this.translocoService.translate('settings.users.saved'), undefined, {
          duration: 2000,
        });
      },
      error: () => {
        this.savingUserId.set(null);
        this.snackBar.open(this.translocoService.translate('settings.users.saveError'), undefined, {
          duration: 3000,
        });
      },
    });
  }

  /** Vergleicht über die E-Mail statt der ID: `HubUser.id` (MSAL `homeAccountId`) und
   * `ManagedUser.id` (Graph-Object-ID) haben unterschiedliche Formate. Reine UX-Warnung, keine
   * Sicherheitsprüfung. */
  isCurrentUser(user: ManagedUser): boolean {
    const currentEmail = this.authService.currentUser()?.email;
    return !!currentEmail && !!user.email && currentEmail.toLowerCase() === user.email.toLowerCase();
  }
}
