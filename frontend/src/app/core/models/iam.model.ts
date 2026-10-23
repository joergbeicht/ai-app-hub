/**
 * Ausschnitt der Axora IAM API (`/api/iam/v1`, ADR-20), den die Verwaltungsseiten nutzen.
 * Der Hub ruft sie über seinen Proxy `/iam/v1/*` auf; die Typen folgen den IAM-DTOs.
 */

export const IAM_PERMISSIONS = {
  userRead: 'iam.user.read',
  userManage: 'iam.user.manage',
  groupRead: 'iam.group.read',
  groupManage: 'iam.group.manage',
  roleRead: 'iam.role.read',
  roleAssign: 'iam.role.assign',
} as const;

export type IamPermission = (typeof IAM_PERMISSIONS)[keyof typeof IAM_PERMISSIONS];

export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';

export interface IamRoleAssignmentRef {
  id: string;
  roleId: string;
  roleKey: string;
  roleDisplayName: string;
  applicationKey: string;
}

export interface IamUser {
  id: string;
  displayName: string;
  email: string | null;
  principalStatus: string;
  membershipStatus: MembershipStatus;
  invitedAt: string | null;
  joinedAt: string | null;
  suspendedAt: string | null;
  groups: { id: string; name: string }[];
  roleAssignments: IamRoleAssignmentRef[];
}

export interface InviteUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  groupIds?: string[];
}

export interface IamGroup {
  id: string;
  name: string;
  description: string | null;
  source: 'LOCAL' | 'EXTERNAL';
  memberCount: number;
  roleAssignments: IamRoleAssignmentRef[];
}

export interface IamGroupMember {
  principalId: string;
  displayName: string;
  email: string | null;
}

export interface IamGroupDetail extends IamGroup {
  members: IamGroupMember[];
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface IamRole {
  id: string;
  roleKey: string;
  displayName: string;
  description: string | null;
  applicationKey: string;
  applicationName: string;
  isSystemTemplate: boolean;
  permissions: { key: string; description: string }[];
}

export interface IamRoleAssignment extends IamRoleAssignmentRef {
  principalId: string | null;
  groupId: string | null;
  targetName: string;
  expiresAt: string | null;
  createdAt: string;
}

/** Genau eines von `principalId` und `groupId`. */
export type AssignRoleRequest =
  | { roleId: string; principalId: string; groupId?: never }
  | { roleId: string; groupId: string; principalId?: never };

/** Stabile Fehlercodes der IAM (RFC 9457 Problem Details, Feld `code`). */
export const IAM_PROBLEM_CODES = [
  'FORBIDDEN',
  'ENTITLEMENT_REQUIRED',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'ALREADY_MEMBER',
  'SELF_MODIFICATION_FORBIDDEN',
  'IDP_UNAVAILABLE',
] as const;

export type IamProblemCode = (typeof IAM_PROBLEM_CODES)[number];
