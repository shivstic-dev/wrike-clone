import { ForbiddenException } from '@nestjs/common';
import type { DepartmentRole } from '../rbac/department-access.service';

export type ReportMode = 'self' | 'individual' | 'combined';

export interface ResolvedReportAudience {
  departmentId?: string;
  role: DepartmentRole;
  mode: ReportMode;
  userIds: string[] | null;
  includeUnassigned: boolean;
  allowedTargetUserIds: string[] | null;
}

export interface ReportDepartmentMember {
  userId: string;
  role: DepartmentRole;
  isDepartmentHead: boolean;
}

export function resolveReportMode(role: DepartmentRole, requested?: ReportMode): ReportMode {
  const mode = requested || (role === 'employee' ? 'self' : 'combined');
  if (role === 'employee' && mode !== 'self') {
    throw new ForbiddenException('Employees may only run reports for themselves');
  }
  return mode;
}

export function buildManagerAudience(
  currentUserId: string,
  members: ReportDepartmentMember[],
): Pick<ResolvedReportAudience, 'userIds' | 'includeUnassigned'> {
  return {
    userIds: [
      currentUserId,
      ...members
        .filter(
          (member) =>
            (member.role === 'employee' || member.role === 'manager') &&
            !member.isDepartmentHead &&
            member.userId !== currentUserId,
        )
        .map((member) => member.userId),
    ],
    includeUnassigned: true,
  };
}

export function buildExactAudience(
  userId: string,
): Pick<ResolvedReportAudience, 'userIds' | 'includeUnassigned'> {
  return { userIds: [userId], includeUnassigned: false };
}

export function buildUnrestrictedAudience(): Pick<
  ResolvedReportAudience,
  'userIds' | 'includeUnassigned'
> {
  return { userIds: null, includeUnassigned: true };
}
