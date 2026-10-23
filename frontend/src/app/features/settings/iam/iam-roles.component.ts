import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, of } from 'rxjs';
import {
  IAM_PERMISSIONS,
  type AssignRoleRequest,
  type IamGroup,
  type IamRole,
  type IamRoleAssignment,
  type IamUser,
} from '../../../core/models/iam.model';
import { IamAccessService } from '../../../core/services/iam-access.service';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { LocalePreferencesService } from '../../../core/services/locale-preferences.service';
import { IAM_ADMIN_STYLES } from './iam-admin.styles';
import { iamErrorKey } from './iam-error';

const SNACKBAR_SUCCESS_MS = 2500;
const SNACKBAR_ERROR_MS = 4000;

type TargetKind = 'user' | 'group';

interface TargetOption {
  id: string;
  label: string;
}

/**
 * Rollen und Rechte über Axora IAM (ADR-20): Rollen sind Vorlagen aus Permissions je App.
 * Zeigt den Katalog und alle Zuweisungen der Organisation; Zuweisungen an Personen oder
 * Gruppen können hier vergeben und entzogen werden.
 */
@Component({
  selector: 'app-iam-roles',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <p class="tab-subtitle">{{ 'settings.iam.roles.subtitle' | transloco: {} : lang }}</p>

    @if (loading()) {
      <div class="state-row">
        <mat-spinner diameter="28"></mat-spinner>
        <span>{{ 'settings.iam.loading' | transloco: {} : lang }}</span>
      </div>
    } @else if (errorKey()) {
      <div class="state-row state-row--error">
        <mat-icon>error_outline</mat-icon>
        <span>{{ (errorKey() ?? '') | transloco: {} : lang }}</span>
        <button mat-stroked-button type="button" (click)="load()">
          {{ 'settings.iam.retry' | transloco: {} : lang }}
        </button>
      </div>
    } @else {
      @if (canAssign()) {
        <form class="panel" [formGroup]="assignForm" (ngSubmit)="assign()">
          <p class="panel-title">{{ 'settings.iam.roles.assignTitle' | transloco: {} : lang }}</p>
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'settings.iam.roles.role' | transloco: {} : lang }}</mat-label>
              <mat-select formControlName="roleId">
                @for (role of roles(); track role.id) {
                  <mat-option [value]="role.id">{{ role.applicationName }} · {{ role.displayName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'settings.iam.roles.targetKind' | transloco: {} : lang }}</mat-label>
              <mat-select formControlName="targetKind">
                <mat-option value="user">{{ 'settings.iam.roles.targetUser' | transloco: {} : lang }}</mat-option>
                <mat-option value="group">{{ 'settings.iam.roles.targetGroup' | transloco: {} : lang }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'settings.iam.roles.target' | transloco: {} : lang }}</mat-label>
              <mat-select formControlName="targetId">
                @for (option of targetOptions(); track option.id) {
                  <mat-option [value]="option.id">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="form-actions">
            <button mat-raised-button color="primary" type="submit" [disabled]="assignForm.invalid || saving()">
              <mat-icon>add</mat-icon>
              {{ 'settings.iam.roles.assign' | transloco: {} : lang }}
            </button>
          </div>
        </form>
      }

      <p class="detail-section-title">{{ 'settings.iam.roles.assignments' | transloco: {} : lang }}</p>
      <div class="list">
        @for (assignment of assignments(); track assignment.id) {
          <div class="row">
            <div class="row-main">
              <mat-icon>{{ assignment.groupId ? 'group' : 'person' }}</mat-icon>
              <div class="row-info">
                <span class="row-title">{{ assignment.targetName }}</span>
                <span class="row-meta">{{ assignment.roleDisplayName }} · {{ assignment.applicationKey }}</span>
              </div>
              @if (canAssign()) {
                <button mat-icon-button color="warn" type="button" [disabled]="saving()" (click)="revoke(assignment)"
                  [attr.aria-label]="'settings.iam.roles.revoke' | transloco: {} : lang">
                  <mat-icon>remove_circle_outline</mat-icon>
                </button>
              }
            </div>
          </div>
        } @empty {
          <p class="tab-subtitle">{{ 'settings.iam.roles.noAssignments' | transloco: {} : lang }}</p>
        }
      </div>

      <p class="detail-section-title catalog-title">{{ 'settings.iam.roles.catalog' | transloco: {} : lang }}</p>
      <div class="list">
        @for (role of roles(); track role.id) {
          <div class="row">
            <div class="row-info">
              <span class="row-title">{{ role.displayName }}</span>
              <span class="row-meta">{{ role.applicationName }} · {{ role.roleKey }}</span>
              @if (role.description) {
                <span class="row-meta">{{ role.description }}</span>
              }
            </div>
            <div class="badges">
              @for (permission of role.permissions; track permission.key) {
                <span class="badge badge--muted" [title]="permission.description">{{ permission.key }}</span>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [
    IAM_ADMIN_STYLES,
    `
      .catalog-title {
        margin-top: 1.5rem;
      }
      .detail-section-title {
        margin-bottom: 0.5rem;
      }
    `,
  ],
})
export class IamRolesComponent implements OnInit {
  private readonly iamAdmin = inject(IamAdminService);
  private readonly access = inject(IamAccessService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;
  readonly roles = signal<IamRole[]>([]);
  readonly assignments = signal<IamRoleAssignment[]>([]);
  readonly users = signal<IamUser[]>([]);
  readonly groups = signal<IamGroup[]>([]);
  readonly loading = signal(true);
  readonly errorKey = signal<string | null>(null);
  readonly saving = signal(false);

  readonly assignForm = this.fb.nonNullable.group({
    roleId: ['', Validators.required],
    targetKind: ['user' as TargetKind, Validators.required],
    targetId: ['', Validators.required],
  });

  private readonly targetKind = toSignal(this.assignForm.controls.targetKind.valueChanges, {
    initialValue: this.assignForm.controls.targetKind.value,
  });

  readonly targetOptions = computed<TargetOption[]>(() =>
    this.targetKind() === 'group'
      ? this.groups().map((group) => ({ id: group.id, label: group.name }))
      : this.users().map((user) => ({
          id: user.id,
          label: user.email ? `${user.displayName} (${user.email})` : user.displayName,
        })),
  );

  constructor() {
    this.assignForm.controls.targetKind.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.assignForm.controls.targetId.reset());
  }

  canAssign(): boolean {
    return this.access.can(IAM_PERMISSIONS.roleAssign);
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    const canPickUsers = this.canAssign() && this.access.can(IAM_PERMISSIONS.userRead);
    const canPickGroups = this.canAssign() && this.access.can(IAM_PERMISSIONS.groupRead);
    forkJoin({
      roles: this.iamAdmin.listRoles(),
      assignments: this.iamAdmin.listRoleAssignments(),
      users: canPickUsers ? this.iamAdmin.listUsers() : of<IamUser[]>([]),
      groups: canPickGroups ? this.iamAdmin.listGroups() : of<IamGroup[]>([]),
    }).subscribe({
      next: ({ roles, assignments, users, groups }) => {
        this.roles.set(roles);
        this.assignments.set(assignments);
        this.users.set(users);
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorKey.set(iamErrorKey(error, 'settings.iam.loadError'));
        this.loading.set(false);
      },
    });
  }

  assign(): void {
    if (this.assignForm.invalid) {
      return;
    }
    const { roleId, targetKind, targetId } = this.assignForm.getRawValue();
    const request: AssignRoleRequest =
      targetKind === 'group' ? { roleId, groupId: targetId } : { roleId, principalId: targetId };
    this.saving.set(true);
    this.iamAdmin.assignRole(request).subscribe({
      next: (assignment) => {
        this.saving.set(false);
        this.assignments.update((list) => [...list, assignment]);
        this.assignForm.controls.targetId.reset();
        this.notify('settings.iam.saved', SNACKBAR_SUCCESS_MS);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify(iamErrorKey(error, 'settings.iam.saveError'), SNACKBAR_ERROR_MS);
      },
    });
  }

  revoke(assignment: IamRoleAssignment): void {
    this.saving.set(true);
    this.iamAdmin.revokeRoleAssignment(assignment.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.assignments.update((list) => list.filter((item) => item.id !== assignment.id));
        this.notify('settings.iam.saved', SNACKBAR_SUCCESS_MS);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify(iamErrorKey(error, 'settings.iam.saveError'), SNACKBAR_ERROR_MS);
      },
    });
  }

  private notify(key: string, duration: number): void {
    this.snackBar.open(this.transloco.translate(key), undefined, { duration });
  }
}
