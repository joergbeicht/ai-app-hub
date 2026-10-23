import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import type { IamGroup, IamRoleAssignment, IamUser } from '../../../core/models/iam.model';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { IamRolesComponent } from './iam-roles.component';
import { IAM_ADMIN_METHODS, iamTestProviders, problem, transloco } from './iam-testing';

const assignment: IamRoleAssignment = {
  id: 'a-1',
  roleId: 'r-1',
  roleKey: 'hub:user',
  roleDisplayName: 'Hub-Benutzer',
  applicationKey: 'ai-app-hub',
  principalId: null,
  groupId: 'g-1',
  targetName: 'Mitarbeitende',
  expiresAt: null,
  createdAt: '2026-10-23T12:00:00Z',
};

describe('IamRolesComponent', () => {
  let iamAdmin: jasmine.SpyObj<IamAdminService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  async function create(permissions: Parameters<typeof iamTestProviders>[2]) {
    await TestBed.configureTestingModule({
      imports: [IamRolesComponent, transloco],
      providers: iamTestProviders(iamAdmin, snackBar, permissions),
    }).compileComponents();
    const fixture = TestBed.createComponent(IamRolesComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    iamAdmin = jasmine.createSpyObj<IamAdminService>('IamAdminService', [...IAM_ADMIN_METHODS]);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    iamAdmin.listRoles.and.returnValue(of([]));
    iamAdmin.listRoleAssignments.and.returnValue(of([assignment]));
    iamAdmin.listUsers.and.returnValue(of([{ id: 'p-1', displayName: 'Ada', email: 'ada@axora.local' } as IamUser]));
    iamAdmin.listGroups.and.returnValue(of([{ id: 'g-1', name: 'Mitarbeitende' } as IamGroup]));
  });

  it('shows catalog and assignments without loading pickers for viewers', async () => {
    const fixture = await create(['iam.role.read']);

    expect(fixture.componentInstance.assignments()).toEqual([assignment]);
    expect(fixture.componentInstance.canAssign()).toBeFalse();
    expect(iamAdmin.listUsers).not.toHaveBeenCalled();
    expect(iamAdmin.listGroups).not.toHaveBeenCalled();
  });

  it('switches the target list between people and groups', async () => {
    const fixture = await create(['iam.role.read', 'iam.role.assign', 'iam.user.read', 'iam.group.read']);
    const component = fixture.componentInstance;

    expect(component.targetOptions()).toEqual([{ id: 'p-1', label: 'Ada (ada@axora.local)' }]);

    component.assignForm.controls.targetId.setValue('p-1');
    component.assignForm.controls.targetKind.setValue('group');

    expect(component.targetOptions()).toEqual([{ id: 'g-1', label: 'Mitarbeitende' }]);
    expect(component.assignForm.controls.targetId.value).toBe('');
  });

  it('assigns a role to a person', async () => {
    const created = { ...assignment, id: 'a-2', groupId: null, principalId: 'p-1', targetName: 'Ada' };
    iamAdmin.assignRole.and.returnValue(of(created));
    const fixture = await create(['iam.role.read', 'iam.role.assign', 'iam.user.read']);
    const component = fixture.componentInstance;

    component.assignForm.setValue({ roleId: 'r-1', targetKind: 'user', targetId: 'p-1' });
    component.assign();

    expect(iamAdmin.assignRole).toHaveBeenCalledWith({ roleId: 'r-1', principalId: 'p-1' });
    expect(component.assignments().map((item) => item.id)).toEqual(['a-1', 'a-2']);
  });

  it('keeps the assignment when IAM refuses to revoke it', async () => {
    iamAdmin.revokeRoleAssignment.and.returnValue(
      throwError(() => problem('SELF_MODIFICATION_FORBIDDEN', 403)),
    );
    const fixture = await create(['iam.role.read', 'iam.role.assign']);
    const component = fixture.componentInstance;

    component.revoke(assignment);

    expect(component.assignments()).toEqual([assignment]);
    expect(snackBar.open).toHaveBeenCalledWith(
      'settings.iam.errors.SELF_MODIFICATION_FORBIDDEN',
      undefined,
      jasmine.any(Object),
    );
  });
});
