/**
 * RBAC service — manages roles and permission assignments.
 * Currently uses the built-in DEFAULT_ROLE_PERMISSIONS map.
 * In production, this would be backed by a roles/permissions database table
 * so tenant admins can define custom roles.
 */

import { Injectable } from '@nestjs/common';
import { DEFAULT_ROLE_PERMISSIONS } from '@wrike-clone/shared';

@Injectable()
export class RbacService {
  getPermissionsForRole(role: string): string[] {
    return DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS['member'] || [];
  }

  getAllRoles(): string[] {
    return Object.keys(DEFAULT_ROLE_PERMISSIONS);
  }

  getAllPermissions(): string[] {
    const all = new Set<string>();
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const p of perms) {
        if (p !== '*') all.add(p);
      }
    }
    return [...all].sort();
  }

  roleHasPermission(role: string, permission: string): boolean {
    const perms = DEFAULT_ROLE_PERMISSIONS[role];
    if (!perms) return false;
    return perms.includes('*') || perms.includes(permission);
  }
}
