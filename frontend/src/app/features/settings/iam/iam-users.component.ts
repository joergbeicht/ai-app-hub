import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import {
  IAM_PERMISSIONS,
  type IamGroup,
  type IamUser,
  type InviteUserRequest,
} from '../../../core/models/iam.model';
import { IamAccessService } from '../../../core/services/iam-access.service';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { LocalePreferencesService } from '../../../core/services/locale-preferences.service';
import { IAM_ADMIN_STYLES } from './iam-admin.styles';
import { iamErrorKey } from './iam-error';

const NAME_MAX_LENGTH = 100;
const SNACKBAR_SUCCESS_MS = 2500;
const SNACKBAR_ERROR_MS = 4000;

/**
 * Benutzer der Organisation über Axora IAM (ADR-20): suchen, per E-Mail einladen (Keycloak
 * schickt den Link zum Passwort-Setzen), sperren und reaktivieren. Die Einladung kann die
 * Person direkt in Gruppen aufnehmen; ohne Gruppe fehlt ihr `hub.catalog.read` und der
 * Login endet ohne Berechtigung. Rollen werden im Tab Rollen gepflegt.
 */
@Component({
  selector: 'app-iam-users',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <p class="tab-subtitle">{{ 'settings.iam.users.subtitle' | transloco: {} : lang }}</p>

    <div class="toolbar">
      <mat-form-field appearance="outline" class="toolbar-search" subscriptSizing="dynamic">
        <mat-label>{{ 'settings.iam.users.search' | transloco: {} : lang }}</mat-label>
        <input matInput #search (keyup.enter)="load(search.value)" />
        <button
          matSuffix
          mat-icon-button
          type="button"
          (click)="load(search.value)"
          [attr.aria-label]="'settings.iam.users.search' | transloco: {} : lang"
        >
          <mat-icon>search</mat-icon>
        </button>
      </mat-form-field>
      @if (canManage()) {
        <button
          mat-raised-button
          color="primary"
          type="button"
          (click)="inviteOpen.set(!inviteOpen())"
        >
          <mat-icon>person_add</mat-icon>
          {{ 'settings.iam.users.invite' | transloco: {} : lang }}
        </button>
      }
    </div>

    @if (inviteOpen()) {
      <form class="panel" [formGroup]="inviteForm" (ngSubmit)="invite()">
        <p class="panel-title">{{ 'settings.iam.users.inviteTitle' | transloco: {} : lang }}</p>
        <div class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'settings.iam.users.email' | transloco: {} : lang }}</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'settings.iam.users.firstName' | transloco: {} : lang }}</mat-label>
            <input matInput formControlName="firstName" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'settings.iam.users.lastName' | transloco: {} : lang }}</mat-label>
            <input matInput formControlName="lastName" autocomplete="off" />
          </mat-form-field>
        </div>
        @if (groups().length > 0) {
          <div class="invite-groups">
            <span class="invite-groups-label">{{
              'settings.iam.users.groups' | transloco: {} : lang
            }}</span>
            @for (group of groups(); track group.id) {
              <mat-checkbox
                [checked]="groupSelected(group.id)"
                (change)="toggleGroup(group.id, $event.checked)"
              >
                {{ group.name }}
              </mat-checkbox>
            }
          </div>
        }
        @if (groupsError()) {
          <p class="row-meta">{{ 'settings.iam.loadError' | transloco: {} : lang }}</p>
        }
        <p class="row-meta">{{ 'settings.iam.users.inviteHint' | transloco: {} : lang }}</p>
        <div class="form-actions">
          <button
            mat-raised-button
            color="primary"
            type="submit"
            [disabled]="inviteForm.invalid || inviting()"
          >
            <mat-icon>send</mat-icon>
            {{ 'settings.iam.users.sendInvite' | transloco: {} : lang }}
          </button>
          <button mat-button type="button" (click)="inviteOpen.set(false)">
            {{ 'settings.cancel' | transloco: {} : lang }}
          </button>
        </div>
      </form>
    }

    @if (loading()) {
      <div class="state-row">
        <mat-spinner diameter="28"></mat-spinner>
        <span>{{ 'settings.iam.loading' | transloco: {} : lang }}</span>
      </div>
    } @else if (errorKey()) {
      <div class="state-row state-row--error">
        <mat-icon>error_outline</mat-icon>
        <span>{{ errorKey() ?? '' | transloco: {} : lang }}</span>
        <button mat-stroked-button type="button" (click)="load(search.value)">
          {{ 'settings.iam.retry' | transloco: {} : lang }}
        </button>
      </div>
    } @else {
      <div class="list">
        @for (user of users(); track user.id) {
          <div class="row">
            <div class="row-main">
              <div class="row-info">
                <span class="row-title">{{ user.displayName }}</span>
                @if (user.email) {
                  <span class="row-meta">{{ user.email }}</span>
                }
              </div>
              <span
                class="badge"
                [class.badge--muted]="user.membershipStatus === 'INVITED'"
                [class.badge--warn]="user.membershipStatus === 'SUSPENDED'"
              >
                {{ 'settings.iam.status.' + user.membershipStatus | transloco: {} : lang }}
              </span>
              @if (canManage() && !isCurrentUser(user)) {
                <div class="row-actions">
                  @if (busyId() === user.id) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else if (user.membershipStatus === 'SUSPENDED') {
                    <button mat-stroked-button type="button" (click)="reactivate(user)">
                      {{ 'settings.iam.users.reactivate' | transloco: {} : lang }}
                    </button>
                  } @else {
                    <button mat-stroked-button color="warn" type="button" (click)="suspend(user)">
                      {{ 'settings.iam.users.suspend' | transloco: {} : lang }}
                    </button>
                  }
                </div>
              }
            </div>
            @if (user.groups.length > 0 || user.roleAssignments.length > 0) {
              <div class="badges">
                @for (group of user.groups; track group.id) {
                  <span class="badge badge--muted"><mat-icon>group</mat-icon>{{ group.name }}</span>
                }
                @for (assignment of user.roleAssignments; track assignment.id) {
                  <span class="badge"
                    ><mat-icon>badge</mat-icon>{{ assignment.roleDisplayName }}</span
                  >
                }
              </div>
            }
          </div>
        } @empty {
          <p class="tab-subtitle">{{ 'settings.iam.users.empty' | transloco: {} : lang }}</p>
        }
      </div>
    }
  `,
  styles: [
    IAM_ADMIN_STYLES,
    `
      .invite-groups {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 1.25rem;
        margin-bottom: 0.75rem;
      }
      .invite-groups-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary, #9ba6b4);
      }
    `,
  ],
})
export class IamUsersComponent implements OnInit {
  private readonly iamAdmin = inject(IamAdminService);
  private readonly access = inject(IamAccessService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;
  readonly users = signal<IamUser[]>([]);
  readonly loading = signal(true);
  readonly errorKey = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly inviteOpen = signal(false);
  readonly inviting = signal(false);
  readonly groups = signal<IamGroup[]>([]);
  readonly groupsError = signal(false);

  readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    lastName: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    groupIds: [[] as string[]],
  });

  canManage(): boolean {
    return this.access.can(IAM_PERMISSIONS.userManage);
  }

  /** Reine UX: die IAM verweigert Selbstsperre ohnehin (`SELF_MODIFICATION_FORBIDDEN`). */
  isCurrentUser(user: IamUser): boolean {
    return this.access.isCurrentUser(user.email);
  }

  /** Gruppenliste nur für die Einladung; ohne Leserecht bleibt die Auswahl ausgeblendet. */
  canPickGroups(): boolean {
    return this.canManage() && this.access.can(IAM_PERMISSIONS.groupRead);
  }

  ngOnInit(): void {
    this.load();
    this.loadGroups();
  }

  load(query = ''): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.iamAdmin.listUsers(query).subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorKey.set(iamErrorKey(error, 'settings.iam.loadError'));
        this.loading.set(false);
      },
    });
  }

  groupSelected(groupId: string): boolean {
    return this.inviteForm.controls.groupIds.value.includes(groupId);
  }

  toggleGroup(groupId: string, selected: boolean): void {
    const current = this.inviteForm.controls.groupIds.value;
    this.inviteForm.controls.groupIds.setValue(
      selected ? [...current, groupId] : current.filter((id) => id !== groupId),
    );
  }

  invite(): void {
    if (this.inviteForm.invalid) {
      return;
    }
    const { email, firstName, lastName, groupIds } = this.inviteForm.getRawValue();
    const request: InviteUserRequest = { email, firstName, lastName };
    if (groupIds.length > 0) {
      request.groupIds = groupIds;
    }
    this.inviting.set(true);
    this.iamAdmin.inviteUser(request).subscribe({
      next: (user) => {
        this.users.update((list) => [user, ...list.filter((existing) => existing.id !== user.id)]);
        this.inviting.set(false);
        this.inviteOpen.set(false);
        this.inviteForm.reset();
        this.notify('settings.iam.users.invited', SNACKBAR_SUCCESS_MS);
      },
      error: (error: unknown) => {
        this.inviting.set(false);
        this.notify(iamErrorKey(error, 'settings.iam.saveError'), SNACKBAR_ERROR_MS);
      },
    });
  }

  suspend(user: IamUser): void {
    this.changeStatus(user, this.iamAdmin.suspendUser(user.id), 'settings.iam.users.suspended');
  }

  reactivate(user: IamUser): void {
    this.changeStatus(
      user,
      this.iamAdmin.reactivateUser(user.id),
      'settings.iam.users.reactivated',
    );
  }

  private loadGroups(): void {
    if (!this.canPickGroups()) {
      return;
    }
    this.iamAdmin.listGroups().subscribe({
      next: (groups) => this.groups.set(groups),
      error: () => this.groupsError.set(true),
    });
  }

  private changeStatus(user: IamUser, request: Observable<IamUser>, successKey: string): void {
    this.busyId.set(user.id);
    request.subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        this.busyId.set(null);
        this.notify(successKey, SNACKBAR_SUCCESS_MS);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.notify(iamErrorKey(error, 'settings.iam.saveError'), SNACKBAR_ERROR_MS);
      },
    });
  }

  private notify(key: string, duration: number): void {
    this.snackBar.open(this.transloco.translate(key), undefined, { duration });
  }
}
