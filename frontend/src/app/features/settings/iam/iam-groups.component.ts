import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import {
  IAM_PERMISSIONS,
  type IamGroup,
  type IamGroupDetail,
  type IamRole,
  type IamUser,
} from '../../../core/models/iam.model';
import { IamAccessService } from '../../../core/services/iam-access.service';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { LocalePreferencesService } from '../../../core/services/locale-preferences.service';
import { IAM_ADMIN_STYLES } from './iam-admin.styles';
import { iamErrorKey } from './iam-error';

const GROUP_NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const SNACKBAR_SUCCESS_MS = 2500;
const SNACKBAR_ERROR_MS = 4000;

/**
 * Gruppen der Organisation über Axora IAM (ADR-20): anlegen, löschen, Mitglieder pflegen und
 * Rollen an Gruppen vergeben. Externe (föderierte) Gruppen sind nur lesbar.
 */
@Component({
  selector: 'app-iam-groups',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <p class="tab-subtitle">{{ 'settings.iam.groups.subtitle' | transloco: {} : lang }}</p>

    @if (canManage()) {
      <div class="toolbar">
        <button mat-raised-button color="primary" type="button" (click)="createOpen.set(!createOpen())">
          <mat-icon>group_add</mat-icon>
          {{ 'settings.iam.groups.create' | transloco: {} : lang }}
        </button>
      </div>
    }

    @if (createOpen()) {
      <form class="panel" [formGroup]="createForm" (ngSubmit)="create()">
        <p class="panel-title">{{ 'settings.iam.groups.createTitle' | transloco: {} : lang }}</p>
        <div class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'settings.iam.groups.name' | transloco: {} : lang }}</mat-label>
            <input matInput formControlName="name" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'settings.iam.groups.description' | transloco: {} : lang }}</mat-label>
            <input matInput formControlName="description" autocomplete="off" />
          </mat-form-field>
        </div>
        <div class="form-actions">
          <button mat-raised-button color="primary" type="submit" [disabled]="createForm.invalid || saving()">
            <mat-icon>save</mat-icon>
            {{ 'settings.save' | transloco: {} : lang }}
          </button>
          <button mat-button type="button" (click)="createOpen.set(false)">
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
        <span>{{ (errorKey() ?? '') | transloco: {} : lang }}</span>
        <button mat-stroked-button type="button" (click)="load()">
          {{ 'settings.iam.retry' | transloco: {} : lang }}
        </button>
      </div>
    } @else {
      <div class="list">
        @for (group of groups(); track group.id) {
          <div class="row">
            <div class="row-main">
              <div class="row-info">
                <span class="row-title">{{ group.name }}</span>
                <span class="row-meta">
                  {{ 'settings.iam.groups.memberCount' | transloco: { count: group.memberCount } : lang }}
                  @if (group.description) {
                    · {{ group.description }}
                  }
                </span>
              </div>
              @if (group.source === 'EXTERNAL') {
                <span class="badge badge--muted">{{ 'settings.iam.groups.external' | transloco: {} : lang }}</span>
              }
              <div class="row-actions">
                @if (confirmDeleteId() === group.id) {
                  <span class="row-meta">{{ 'settings.iam.groups.confirmDelete' | transloco: {} : lang }}</span>
                  <button mat-stroked-button color="warn" type="button" (click)="remove(group)">
                    {{ 'settings.iam.groups.delete' | transloco: {} : lang }}
                  </button>
                  <button mat-button type="button" (click)="confirmDeleteId.set(null)">
                    {{ 'settings.cancel' | transloco: {} : lang }}
                  </button>
                } @else {
                  @if (canManage() && group.source === 'LOCAL') {
                    <button mat-icon-button color="warn" type="button" (click)="confirmDeleteId.set(group.id)"
                      [attr.aria-label]="'settings.iam.groups.delete' | transloco: {} : lang">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                  <button mat-icon-button type="button" (click)="toggle(group)"
                    [attr.aria-expanded]="expandedId() === group.id"
                    [attr.aria-label]="'settings.iam.groups.details' | transloco: {} : lang">
                    <mat-icon>{{ expandedId() === group.id ? 'expand_less' : 'expand_more' }}</mat-icon>
                  </button>
                }
              </div>
            </div>
            @if (group.roleAssignments.length > 0) {
              <div class="badges">
                @for (assignment of group.roleAssignments; track assignment.id) {
                  <span class="badge"><mat-icon>badge</mat-icon>{{ assignment.roleDisplayName }}</span>
                }
              </div>
            }

            @if (expandedId() === group.id) {
              <div class="detail">
                @if (detail(); as current) {
                  <p class="detail-section-title">{{ 'settings.iam.groups.members' | transloco: {} : lang }}</p>
                  <div class="badges">
                    @for (member of current.members; track member.principalId) {
                      <span class="badge badge--muted">
                        {{ member.displayName }}
                        @if (canEditMembers(current)) {
                          <button type="button" (click)="removeMember(current, member.principalId)"
                            [attr.aria-label]="'settings.remove' | transloco: {} : lang">
                            <mat-icon>close</mat-icon>
                          </button>
                        }
                      </span>
                    } @empty {
                      <span class="row-meta">{{ 'settings.iam.groups.noMembers' | transloco: {} : lang }}</span>
                    }
                  </div>
                  @if (canEditMembers(current) && candidateMembers().length > 0) {
                    <div class="inline-form">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>{{ 'settings.iam.groups.addMember' | transloco: {} : lang }}</mat-label>
                        <mat-select [formControl]="memberControl">
                          @for (user of candidateMembers(); track user.id) {
                            <mat-option [value]="user.id">{{ user.displayName }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <button mat-stroked-button type="button" [disabled]="!memberControl.value || saving()"
                        (click)="addMember(current)">
                        <mat-icon>add</mat-icon>
                        {{ 'settings.iam.add' | transloco: {} : lang }}
                      </button>
                    </div>
                  }

                  <p class="detail-section-title">{{ 'settings.iam.groups.roles' | transloco: {} : lang }}</p>
                  <div class="badges">
                    @for (assignment of current.roleAssignments; track assignment.id) {
                      <span class="badge">
                        {{ assignment.roleDisplayName }}
                        @if (canAssignRoles()) {
                          <button type="button" (click)="revokeRole(current, assignment.id)"
                            [attr.aria-label]="'settings.remove' | transloco: {} : lang">
                            <mat-icon>close</mat-icon>
                          </button>
                        }
                      </span>
                    } @empty {
                      <span class="row-meta">{{ 'settings.iam.groups.noRoles' | transloco: {} : lang }}</span>
                    }
                  </div>
                  @if (canAssignRoles() && roles().length > 0) {
                    <div class="inline-form">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>{{ 'settings.iam.groups.addRole' | transloco: {} : lang }}</mat-label>
                        <mat-select [formControl]="roleControl">
                          @for (role of roles(); track role.id) {
                            <mat-option [value]="role.id">{{ role.applicationName }} · {{ role.displayName }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <button mat-stroked-button type="button" [disabled]="!roleControl.value || saving()"
                        (click)="assignRole(current)">
                        <mat-icon>add</mat-icon>
                        {{ 'settings.iam.add' | transloco: {} : lang }}
                      </button>
                    </div>
                  }
                } @else {
                  <div class="state-row">
                    <mat-spinner diameter="20"></mat-spinner>
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="tab-subtitle">{{ 'settings.iam.groups.empty' | transloco: {} : lang }}</p>
        }
      </div>
    }
  `,
  styles: [IAM_ADMIN_STYLES],
})
export class IamGroupsComponent implements OnInit {
  private readonly iamAdmin = inject(IamAdminService);
  private readonly access = inject(IamAccessService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;
  readonly groups = signal<IamGroup[]>([]);
  readonly loading = signal(true);
  readonly errorKey = signal<string | null>(null);
  readonly saving = signal(false);
  readonly createOpen = signal(false);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly detail = signal<IamGroupDetail | null>(null);
  readonly users = signal<IamUser[]>([]);
  readonly roles = signal<IamRole[]>([]);

  readonly memberControl = new FormControl('', { nonNullable: true });
  readonly roleControl = new FormControl('', { nonNullable: true });

  readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(GROUP_NAME_MAX_LENGTH)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]],
  });

  /** Nur Benutzer, die noch nicht in der geöffneten Gruppe sind. */
  readonly candidateMembers = computed(() => {
    const memberIds = new Set(this.detail()?.members.map((member) => member.principalId) ?? []);
    return this.users().filter((user) => !memberIds.has(user.id));
  });

  canManage(): boolean {
    return this.access.can(IAM_PERMISSIONS.groupManage);
  }

  canAssignRoles(): boolean {
    return this.access.can(IAM_PERMISSIONS.roleAssign) && this.access.can(IAM_PERMISSIONS.roleRead);
  }

  canEditMembers(group: IamGroup): boolean {
    return this.canManage() && group.source === 'LOCAL';
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.iamAdmin.listGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorKey.set(iamErrorKey(error, 'settings.iam.loadError'));
        this.loading.set(false);
      },
    });
  }

  toggle(group: IamGroup): void {
    if (this.expandedId() === group.id) {
      this.expandedId.set(null);
      this.detail.set(null);
      return;
    }
    this.expandedId.set(group.id);
    this.detail.set(null);
    this.loadPickerOptions();
    this.iamAdmin.getGroup(group.id).subscribe({
      next: (detail) => this.detail.set(detail),
      error: (error: unknown) => {
        this.expandedId.set(null);
        this.notify(iamErrorKey(error, 'settings.iam.loadError'), SNACKBAR_ERROR_MS);
      },
    });
  }

  create(): void {
    if (this.createForm.invalid) {
      return;
    }
    const { name, description } = this.createForm.getRawValue();
    this.run(this.iamAdmin.createGroup({ name, ...(description ? { description } : {}) }), (group) => {
      this.groups.update((list) => [...list, group].sort((a, b) => a.name.localeCompare(b.name)));
      this.createOpen.set(false);
      this.createForm.reset();
    }, 'settings.iam.groups.created');
  }

  remove(group: IamGroup): void {
    this.run(this.iamAdmin.deleteGroup(group.id), () => {
      this.groups.update((list) => list.filter((item) => item.id !== group.id));
      this.confirmDeleteId.set(null);
      if (this.expandedId() === group.id) {
        this.expandedId.set(null);
        this.detail.set(null);
      }
    }, 'settings.iam.groups.deleted');
  }

  addMember(group: IamGroupDetail): void {
    const principalId = this.memberControl.value;
    this.run(this.iamAdmin.addGroupMember(group.id, principalId), (updated) => {
      this.memberControl.reset();
      this.applyDetail(updated);
    }, 'settings.iam.saved');
  }

  removeMember(group: IamGroupDetail, principalId: string): void {
    this.run(this.iamAdmin.removeGroupMember(group.id, principalId), (updated) => {
      this.applyDetail(updated);
    }, 'settings.iam.saved');
  }

  assignRole(group: IamGroupDetail): void {
    const roleId = this.roleControl.value;
    this.run(this.iamAdmin.assignRole({ roleId, groupId: group.id }), () => {
      this.roleControl.reset();
      this.reloadDetail(group.id);
    }, 'settings.iam.saved');
  }

  revokeRole(group: IamGroupDetail, assignmentId: string): void {
    this.run(this.iamAdmin.revokeRoleAssignment(assignmentId), () => {
      this.reloadDetail(group.id);
    }, 'settings.iam.saved');
  }

  private loadPickerOptions(): void {
    if (this.users().length === 0 && this.canManage() && this.access.can(IAM_PERMISSIONS.userRead)) {
      this.iamAdmin.listUsers().subscribe({ next: (users) => this.users.set(users) });
    }
    if (this.roles().length === 0 && this.canAssignRoles()) {
      this.iamAdmin.listRoles().subscribe({ next: (roles) => this.roles.set(roles) });
    }
  }

  private reloadDetail(groupId: string): void {
    this.iamAdmin.getGroup(groupId).subscribe({ next: (detail) => this.applyDetail(detail) });
  }

  /** Detail und Listeneintrag (Mitgliederzahl, Rollen) gleichzeitig aktualisieren. */
  private applyDetail(detail: IamGroupDetail): void {
    this.detail.set(detail);
    const summary: IamGroup = {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      source: detail.source,
      memberCount: detail.memberCount,
      roleAssignments: detail.roleAssignments,
    };
    this.groups.update((list) => list.map((item) => (item.id === detail.id ? summary : item)));
  }

  private run<T>(request: Observable<T>, onSuccess: (result: T) => void, successKey: string): void {
    this.saving.set(true);
    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        onSuccess(result);
        this.notify(successKey, SNACKBAR_SUCCESS_MS);
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
