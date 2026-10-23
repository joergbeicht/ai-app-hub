import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import type {
  IamGroup,
  IamGroupDetail,
  IamRoleAssignment,
  IamUser,
} from '../../../core/models/iam.model';
import { IamAdminService } from '../../../core/services/iam-admin.service';
import { IamGroupsComponent } from './iam-groups.component';
import { IAM_ADMIN_METHODS, iamTestProviders, problem, transloco } from './iam-testing';

const group: IamGroup = {
  id: 'g-1',
  name: 'Mitarbeitende',
  description: null,
  source: 'LOCAL',
  memberCount: 1,
  roleAssignments: [],
};

const detail: IamGroupDetail = {
  ...group,
  members: [{ principalId: 'p-1', displayName: 'Ada', email: 'ada@axora.local' }],
};

const users = [
  { id: 'p-1', displayName: 'Ada' },
  { id: 'p-2', displayName: 'Bob' },
] as IamUser[];

describe('IamGroupsComponent', () => {
  let iamAdmin: jasmine.SpyObj<IamAdminService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  async function create(permissions: Parameters<typeof iamTestProviders>[2]) {
    await TestBed.configureTestingModule({
      imports: [IamGroupsComponent, transloco],
      providers: iamTestProviders(iamAdmin, snackBar, permissions),
    }).compileComponents();
    const fixture = TestBed.createComponent(IamGroupsComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    iamAdmin = jasmine.createSpyObj<IamAdminService>('IamAdminService', [...IAM_ADMIN_METHODS]);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    iamAdmin.listGroups.and.returnValue(of([group]));
    iamAdmin.getGroup.and.returnValue(of(detail));
    iamAdmin.listUsers.and.returnValue(of(users));
    iamAdmin.listRoles.and.returnValue(of([]));
  });

  it('opens a group and offers only users who are not yet members', async () => {
    const fixture = await create(['iam.group.read', 'iam.group.manage', 'iam.user.read']);
    const component = fixture.componentInstance;

    component.toggle(group);

    expect(iamAdmin.getGroup).toHaveBeenCalledWith('g-1');
    expect(component.candidateMembers().map((user) => user.id)).toEqual(['p-2']);
  });

  it('does not load pickers for read-only admins', async () => {
    const fixture = await create(['iam.group.read']);

    fixture.componentInstance.toggle(group);

    expect(iamAdmin.listUsers).not.toHaveBeenCalled();
    expect(iamAdmin.listRoles).not.toHaveBeenCalled();
  });

  it('adds a member and updates the member count in the list', async () => {
    const updated: IamGroupDetail = {
      ...detail,
      memberCount: 2,
      members: [...detail.members, { principalId: 'p-2', displayName: 'Bob', email: null }],
    };
    iamAdmin.addGroupMember.and.returnValue(of(updated));
    const fixture = await create(['iam.group.read', 'iam.group.manage', 'iam.user.read']);
    const component = fixture.componentInstance;
    component.toggle(group);

    component.memberControl.setValue('p-2');
    component.addMember(detail);

    expect(iamAdmin.addGroupMember).toHaveBeenCalledWith('g-1', 'p-2');
    expect(component.groups()[0].memberCount).toBe(2);
    expect(component.detail()?.members.length).toBe(2);
  });

  it('creates a group without an empty description', async () => {
    iamAdmin.createGroup.and.returnValue(of({ ...detail, id: 'g-2', name: 'Admins', members: [] }));
    const fixture = await create(['iam.group.read', 'iam.group.manage']);
    const component = fixture.componentInstance;

    component.createForm.setValue({ name: 'Admins', description: '' });
    component.create();

    expect(iamAdmin.createGroup).toHaveBeenCalledWith({ name: 'Admins' });
    expect(component.groups().map((item) => item.name)).toEqual(['Admins', 'Mitarbeitende']);
  });

  it('removes a deleted group and reports conflicts from IAM', async () => {
    iamAdmin.deleteGroup.and.returnValue(of(undefined));
    const fixture = await create(['iam.group.read', 'iam.group.manage']);
    const component = fixture.componentInstance;

    component.remove(group);
    expect(component.groups()).toEqual([]);

    iamAdmin.createGroup.and.returnValue(throwError(() => problem('CONFLICT')));
    component.createForm.setValue({ name: 'Mitarbeitende', description: '' });
    component.create();
    expect(snackBar.open).toHaveBeenCalledWith('settings.iam.errors.CONFLICT', undefined, jasmine.any(Object));
  });

  it('assigns a role to the group and reloads the group', async () => {
    iamAdmin.assignRole.and.returnValue(of({ id: 'a-1' } as IamRoleAssignment));
    const fixture = await create(['iam.group.read', 'iam.role.read', 'iam.role.assign']);
    const component = fixture.componentInstance;
    component.toggle(group);

    component.roleControl.setValue('r-1');
    component.assignRole(detail);

    expect(iamAdmin.assignRole).toHaveBeenCalledWith({ roleId: 'r-1', groupId: 'g-1' });
    expect(iamAdmin.getGroup).toHaveBeenCalledTimes(2);
  });
});
