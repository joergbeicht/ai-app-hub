import { TestBed, getTestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { UserManagementComponent } from './user-management.component';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { AuthService } from '../../../core/services/auth.service';
import type { ManagedUser } from '../../../core/models/managed-user.model';

describe('UserManagementComponent', () => {
  const users: ManagedUser[] = [
    { id: 'u1', displayName: 'Sam Nutzer', email: 'sam@axora.local', role: 'Guest' },
    { id: 'u2', displayName: 'Jörg Beicht', email: 'joerg@axora.local', role: 'Administrator' },
  ];

  let userAdminServiceSpy: jasmine.SpyObj<UserAdminService>;

  beforeEach(async () => {
    userAdminServiceSpy = jasmine.createSpyObj('UserAdminService', ['listUsers', 'updateRole']);
    userAdminServiceSpy.listUsers.and.returnValue(of(users));

    await TestBed.configureTestingModule({
      imports: [
        UserManagementComponent,
        TranslocoTestingModule.forRoot({ langs: { de: {} }, translocoConfig: { availableLangs: ['de'], defaultLang: 'de' } }),
      ],
      providers: [
        { provide: UserAdminService, useValue: userAdminServiceSpy },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ id: 'x', displayName: 'Jörg', role: 'Administrator', email: 'joerg@axora.local' }) },
        },
      ],
    }).compileComponents();
  });

  it('loads users on init', () => {
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();

    expect(userAdminServiceSpy.listUsers).toHaveBeenCalled();
    expect(fixture.componentInstance.users()).toEqual(users);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('flags an error when loading fails', () => {
    userAdminServiceSpy.listUsers.and.returnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('updates the role list after a successful role change', () => {
    const updated: ManagedUser = { ...users[0], role: 'User' };
    userAdminServiceSpy.updateRole.and.returnValue(of(updated));
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();

    fixture.componentInstance.onRoleChange(users[0], 'User');

    expect(userAdminServiceSpy.updateRole).toHaveBeenCalledWith('u1', 'User');
    expect(fixture.componentInstance.users()[0].role).toBe('User');
    expect(fixture.componentInstance.savingUserId()).toBeNull();
  });

  it('identifies the current user by email', () => {
    const fixture = TestBed.createComponent(UserManagementComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isCurrentUser(users[1])).toBe(true);
    expect(fixture.componentInstance.isCurrentUser(users[0])).toBe(false);
  });

  afterEach(() => {
    getTestBed().resetTestingModule();
  });
});
