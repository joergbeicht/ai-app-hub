import { signal, type Provider } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { IamPermission } from '../../../core/models/iam.model';
import { IamAccessService } from '../../../core/services/iam-access.service';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { LocalePreferencesService } from '../../../core/services/locale-preferences.service';

export const IAM_ADMIN_METHODS = [
  'listUsers',
  'inviteUser',
  'suspendUser',
  'reactivateUser',
  'listGroups',
  'getGroup',
  'createGroup',
  'deleteGroup',
  'addGroupMember',
  'removeGroupMember',
  'listRoles',
  'listRoleAssignments',
  'assignRole',
  'revokeRoleAssignment',
] as const;

export const transloco = TranslocoTestingModule.forRoot({
  langs: { de: {} },
  translocoConfig: { availableLangs: ['de'], defaultLang: 'de' },
});

export function problem(code: string, status = 409): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code } });
}

/** Provider für Komponententests der IAM-Verwaltung mit gegebenen Permissions. */
export function iamTestProviders(
  iamAdmin: jasmine.SpyObj<IamAdminService>,
  snackBar: jasmine.SpyObj<MatSnackBar>,
  permissions: IamPermission[],
  currentEmail = 'admin@axora.local',
): Provider[] {
  const granted = new Set<string>(permissions);
  return [
    { provide: IamAdminService, useValue: iamAdmin },
    { provide: MatSnackBar, useValue: snackBar },
    { provide: LocalePreferencesService, useValue: { activeLanguage: signal('de') } },
    {
      provide: IamAccessService,
      useValue: {
        can: (permission: string) => granted.has(permission),
        isCurrentUser: (email: string | null) => email === currentEmail,
        organization: () => ({ id: 'org-1', name: 'Axora' }),
      },
    },
  ];
}
