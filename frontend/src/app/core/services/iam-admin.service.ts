import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { RUNTIME_CONFIG } from '../runtime-config';
import type {
  AssignRoleRequest,
  CreateGroupRequest,
  IamGroup,
  IamGroupDetail,
  IamRole,
  IamRoleAssignment,
  IamUser,
  InviteUserRequest,
} from '../models/iam.model';
import { IamAccessService } from './iam-access.service';

/**
 * Verwaltung von Benutzern, Gruppen und Rollen über die Axora IAM API (ADR-20). Der Browser
 * spricht nur mit dem Hub-Backend (`/iam/v1/*`, Cookie + CSRF); das Backend hängt das Token an.
 * Alle Pfade sind auf die Organisation der Sitzung gescopet.
 */
@Injectable({ providedIn: 'root' })
export class IamAdminService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(IamAccessService);
  private readonly baseUrl = `${inject(RUNTIME_CONFIG).backendApiUrl}/iam/v1`;

  listUsers(query = ''): Observable<IamUser[]> {
    const params = query.trim() ? new HttpParams().set('q', query.trim()) : undefined;
    return this.http.get<IamUser[]>(this.orgUrl('users'), { params });
  }

  inviteUser(request: InviteUserRequest): Observable<IamUser> {
    return this.http.post<IamUser>(this.orgUrl('users/invitations'), request);
  }

  suspendUser(principalId: string): Observable<IamUser> {
    return this.http.post<IamUser>(this.orgUrl(`users/${principalId}/suspend`), {});
  }

  reactivateUser(principalId: string): Observable<IamUser> {
    return this.http.post<IamUser>(this.orgUrl(`users/${principalId}/reactivate`), {});
  }

  listGroups(): Observable<IamGroup[]> {
    return this.http.get<IamGroup[]>(this.orgUrl('groups'));
  }

  getGroup(groupId: string): Observable<IamGroupDetail> {
    return this.http.get<IamGroupDetail>(this.orgUrl(`groups/${groupId}`));
  }

  createGroup(request: CreateGroupRequest): Observable<IamGroupDetail> {
    return this.http.post<IamGroupDetail>(this.orgUrl('groups'), request);
  }

  deleteGroup(groupId: string): Observable<void> {
    return this.http.delete<void>(this.orgUrl(`groups/${groupId}`));
  }

  addGroupMember(groupId: string, principalId: string): Observable<IamGroupDetail> {
    return this.http.post<IamGroupDetail>(this.orgUrl(`groups/${groupId}/members`), { principalId });
  }

  removeGroupMember(groupId: string, principalId: string): Observable<IamGroupDetail> {
    return this.http.delete<IamGroupDetail>(this.orgUrl(`groups/${groupId}/members/${principalId}`));
  }

  listRoles(): Observable<IamRole[]> {
    return this.http.get<IamRole[]>(this.orgUrl('roles'));
  }

  listRoleAssignments(): Observable<IamRoleAssignment[]> {
    return this.http.get<IamRoleAssignment[]>(this.orgUrl('role-assignments'));
  }

  assignRole(request: AssignRoleRequest): Observable<IamRoleAssignment> {
    return this.http.post<IamRoleAssignment>(this.orgUrl('role-assignments'), request);
  }

  revokeRoleAssignment(assignmentId: string): Observable<void> {
    return this.http.delete<void>(this.orgUrl(`role-assignments/${assignmentId}`));
  }

  private orgUrl(path: string): string {
    const organization = this.access.organization();
    if (!organization) {
      throw new Error('No Axora organization in the current session');
    }
    return `${this.baseUrl}/organizations/${organization.id}/${path}`;
  }
}
