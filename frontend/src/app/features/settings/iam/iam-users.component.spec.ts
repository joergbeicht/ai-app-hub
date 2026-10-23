import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import type { IamUser } from '../../../core/models/iam.model';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { IamUsersComponent } from './iam-users.component';
import { IAM_ADMIN_METHODS, iamTestProviders, problem, transloco } from './iam-testing';

function user(overrides: Partial<IamUser> = {}): IamUser {
  return {
    id: 'p-1',
    displayName: 'Ada Lovelace',
    email: 'ada@axora.local',
    principalStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    invitedAt: null,
    joinedAt: null,
    suspendedAt: null,
    groups: [],
    roleAssignments: [],
    ...overrides,
  };
}

describe('IamUsersComponent', () => {
  let iamAdmin: jasmine.SpyObj<IamAdminService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  async function create(permissions: Parameters<typeof iamTestProviders>[2]) {
    await TestBed.configureTestingModule({
      imports: [IamUsersComponent, transloco],
      providers: iamTestProviders(iamAdmin, snackBar, permissions),
    }).compileComponents();
    const fixture = TestBed.createComponent(IamUsersComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    iamAdmin = jasmine.createSpyObj<IamAdminService>('IamAdminService', [...IAM_ADMIN_METHODS]);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    iamAdmin.listUsers.and.returnValue(of([user(), user({ id: 'p-2', email: 'admin@axora.local' })]));
  });

  it('loads the users of the organization', async () => {
    const fixture = await create(['iam.user.read']);

    expect(iamAdmin.listUsers).toHaveBeenCalledWith('');
    expect(fixture.componentInstance.users().length).toBe(2);
    expect(fixture.componentInstance.canManage()).toBeFalse();
  });

  it('shows the IAM error when loading fails', async () => {
    iamAdmin.listUsers.and.returnValue(throwError(() => problem('FORBIDDEN', 403)));
    const fixture = await create(['iam.user.read']);

    expect(fixture.componentInstance.errorKey()).toBe('settings.iam.errors.FORBIDDEN');
  });

  it('invites a person and puts them on top of the list', async () => {
    const invited = user({ id: 'p-3', email: 'bob@axora.local', membershipStatus: 'INVITED' });
    iamAdmin.inviteUser.and.returnValue(of(invited));
    const fixture = await create(['iam.user.read', 'iam.user.manage']);
    const component = fixture.componentInstance;

    component.inviteForm.setValue({ email: 'bob@axora.local', firstName: 'Bob', lastName: 'Builder' });
    component.invite();

    expect(iamAdmin.inviteUser).toHaveBeenCalledWith({
      email: 'bob@axora.local',
      firstName: 'Bob',
      lastName: 'Builder',
    });
    expect(component.users()[0]).toEqual(invited);
    expect(component.inviteOpen()).toBeFalse();
  });

  it('does not submit an invalid invitation', async () => {
    const fixture = await create(['iam.user.read', 'iam.user.manage']);

    fixture.componentInstance.inviteForm.setValue({ email: 'no-mail', firstName: 'B', lastName: 'B' });
    fixture.componentInstance.invite();

    expect(iamAdmin.inviteUser).not.toHaveBeenCalled();
  });

  it('suspends a user and reports IAM refusals', async () => {
    iamAdmin.suspendUser.and.returnValue(of(user({ membershipStatus: 'SUSPENDED' })));
    const fixture = await create(['iam.user.read', 'iam.user.manage']);
    const component = fixture.componentInstance;

    component.suspend(component.users()[0]);
    expect(component.users()[0].membershipStatus).toBe('SUSPENDED');

    iamAdmin.reactivateUser.and.returnValue(throwError(() => problem('SELF_MODIFICATION_FORBIDDEN', 403)));
    component.reactivate(component.users()[0]);
    expect(snackBar.open).toHaveBeenCalledWith(
      'settings.iam.errors.SELF_MODIFICATION_FORBIDDEN',
      undefined,
      jasmine.any(Object),
    );
    expect(component.busyId()).toBeNull();
  });

  it('never offers to suspend the current user', async () => {
    const fixture = await create(['iam.user.read', 'iam.user.manage']);
    const [other, self] = fixture.componentInstance.users();

    expect(fixture.componentInstance.isCurrentUser(other)).toBeFalse();
    expect(fixture.componentInstance.isCurrentUser(self)).toBeTrue();
  });
});
