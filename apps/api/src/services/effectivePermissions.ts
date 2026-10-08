import { prisma } from '@dct-crm/db';

export interface EffectivePermission {
  name: string;
  module: string;
  action: string;
  source: 'PROFILE' | 'PERMISSION_SET' | 'PERMISSION_SET_GROUP' | 'DIRECT' | 'ROLE';
  sourceName: string;
}

export interface EffectiveFieldPermission {
  fieldId: string;
  fieldName: string;
  canRead: boolean;
  canEdit: boolean;
  source: 'PROFILE' | 'PERMISSION_SET' | 'ROLE';
  sourceName: string;
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  permissions: string[];
  effectivePermissions: EffectivePermission[];
}

const FULL_SYSTEM_ACCESS = 'FULL_SYSTEM_ACCESS';

type PermissionCacheBag = Map<string, Promise<EffectivePermission[]>>;

export class EffectivePermissionService {
  /**
   * Request-scoped permission cache. Keyed by a per-request owner object
   * (e.g. Express `req.user`), so multiple permission checks for the same
   * subject collapse into a single computation without introducing any
   * cross-request staleness.
   */
  private static readonly requestCaches = new WeakMap<object, PermissionCacheBag>();

  static getEffectivePermissionsCached(owner: object, userId: string): Promise<EffectivePermission[]> {
    let bag = this.requestCaches.get(owner);
    if (!bag) {
      bag = new Map();
      this.requestCaches.set(owner, bag);
    }
    let pending = bag.get(userId);
    if (!pending) {
      pending = this.getEffectivePermissions(userId);
      bag.set(userId, pending);
    }
    return pending;
  }

  static hasPermissionIn(perms: EffectivePermission[], permissionName: string): boolean {
    return perms.some((p) => p.name === permissionName) || perms.some((p) => p.name === FULL_SYSTEM_ACCESS);
  }

  static async getEffectivePermissions(userId: string): Promise<EffectivePermission[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profileId: true, tenantId: true, isActive: true, isSuperAdmin: true },
    });

    if (!user || !user.isActive) return [];

    if (user.isSuperAdmin) {
      return this.getAllSystemPermissions();
    }

    const [profilePerms, permSetPerms, groupPerms, directPerms, rolePerms] = await Promise.all([
      this.getProfilePermissions(user.profileId, user.tenantId),
      this.getPermissionSetPermissions(userId, user.tenantId),
      this.getPermissionSetGroupPermissions(userId, user.tenantId),
      this.getDirectPermissions(userId),
      this.getRolePermissions(userId, user.tenantId),
    ]);

    const allPerms = [...profilePerms, ...permSetPerms, ...groupPerms, ...directPerms, ...rolePerms];

    const deduplicated = this.deduplicatePermissions(allPerms);

    if (deduplicated.some((p) => p.name === FULL_SYSTEM_ACCESS)) {
      return this.getAllSystemPermissions();
    }

    return deduplicated;
  }

  static async getEffectiveFieldPermissions(userId: string, objectId: string): Promise<EffectiveFieldPermission[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profileId: true, tenantId: true, isActive: true, isSuperAdmin: true },
    });

    if (!user || !user.isActive) return [];

    if (user.isSuperAdmin) {
      const fields = await prisma.fieldDefinition.findMany({
        where: { objectId },
        select: { id: true, name: true },
      });

      return fields.map((field) => ({
        fieldId: field.id,
        fieldName: field.name,
        canRead: true,
        canEdit: true,
        source: 'PROFILE',
        sourceName: 'Full System Access',
      }));
    }

    const [profilePermissions, permissionSetAssignments, roleAssignments] = await Promise.all([
      user.profileId
        ? prisma.profileFieldPermission.findMany({
            where: {
              profileId: user.profileId,
              tenantId: user.tenantId,
              field: { objectId },
            },
            include: { field: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      prisma.userPermissionAssignment.findMany({
        where: {
          userId,
          permissionSet: { tenantId: user.tenantId, isActive: true },
        },
        include: {
          permissionSet: {
            include: {
              fieldPermissions: {
                where: { field: { objectId } },
                include: { field: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              fieldPerms: {
                where: { field: { objectId } },
                include: { field: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
    ]);

    const merged = new Map<string, EffectiveFieldPermission>();

    for (const permission of profilePermissions) {
      merged.set(permission.field.id, {
        fieldId: permission.field.id,
        fieldName: permission.field.name,
        canRead: permission.canRead,
        canEdit: permission.canEdit,
        source: 'PROFILE',
        sourceName: 'Profile',
      });
    }

    for (const assignment of permissionSetAssignments) {
      for (const permission of assignment.permissionSet.fieldPermissions) {
        const existing = merged.get(permission.field.id);
        const next: EffectiveFieldPermission = {
          fieldId: permission.field.id,
          fieldName: permission.field.name,
          canRead: (existing?.canRead ?? false) || permission.canRead,
          canEdit: (existing?.canEdit ?? false) || permission.canEdit,
          source: permission.canRead || permission.canEdit ? 'PERMISSION_SET' : existing?.source ?? 'PROFILE',
          sourceName: assignment.permissionSet.name,
        };
        merged.set(permission.field.id, next);
      }
    }

    for (const userRole of roleAssignments) {
      for (const permission of userRole.role.fieldPerms) {
        const existing = merged.get(permission.field.id);
        const next: EffectiveFieldPermission = {
          fieldId: permission.field.id,
          fieldName: permission.field.name,
          canRead: (existing?.canRead ?? false) || permission.canRead,
          canEdit: (existing?.canEdit ?? false) || permission.canEdit,
          source: existing?.source ?? 'ROLE',
          sourceName: existing?.sourceName ?? userRole.role.name,
        };
        merged.set(permission.field.id, next);
      }
    }

    return Array.from(merged.values()).sort((a, b) => a.fieldName.localeCompare(b.fieldName));
  }

  static async getProfilePermissions(profileId: string | null, tenantId?: string): Promise<EffectivePermission[]> {
    if (!profileId) return [];

    const [profilePerms, objectPerms] = await Promise.all([
      prisma.userProfilePermission.findMany({
        where: {
          profileId,
          permission: { isActive: true },
          ...(tenantId ? { profile: { is: { OR: [{ tenantId }, { isGlobal: true }] } } } : {}),
        },
        include: { permission: true },
      }),
      prisma.profileObjectPermission.findMany({
        where: { profileId, ...(tenantId ? { tenantId, object: { isActive: true } } : {}) },
        include: { object: { select: { name: true } } },
      }),
    ]);

    const namedPermissions = profilePerms.map((pp) => ({
      name: pp.permission.name,
      module: pp.permission.module,
      action: pp.permission.action,
      source: 'PROFILE' as const,
      sourceName: 'Profile',
    }));

    return [...namedPermissions, ...this.objectPermissionsToEffective(objectPerms, 'PROFILE', 'Profile')];
  }

  static async getPermissionSetPermissions(userId: string, tenantId?: string): Promise<EffectivePermission[]> {
    const assignments = await prisma.userPermissionAssignment.findMany({
      where: { userId, permissionSet: { isActive: true, ...(tenantId ? { tenantId } : {}) } },
      include: {
        permissionSet: {
          include: {
            items: {
              where: { permission: { isActive: true } },
              include: { permission: true },
            },
            objectPermissions: { include: { object: { select: { name: true, isActive: true } } } },
          },
        },
      },
    });

    const perms: EffectivePermission[] = [];
    for (const assignment of assignments) {
      for (const item of assignment.permissionSet.items) {
        perms.push({
          name: item.permission.name,
          module: item.permission.module,
          action: item.permission.action,
          source: 'PERMISSION_SET',
          sourceName: assignment.permissionSet.name,
        });
      }
    }
    for (const assignment of assignments) {
      perms.push(...this.objectPermissionsToEffective(
        assignment.permissionSet.objectPermissions.filter((item) => item.object.isActive),
        'PERMISSION_SET',
        assignment.permissionSet.name,
      ));
    }
    return perms;
  }

  static async getPermissionSetGroupPermissions(userId: string, tenantId?: string): Promise<EffectivePermission[]> {
    const assignments = await prisma.userPermissionSetGroup.findMany({
      where: { userId, group: { isActive: true, ...(tenantId ? { tenantId } : {}) } },
      include: {
        group: {
          include: {
            assignments: {
              include: {
                permissionSet: {
                  include: {
                    items: {
                      where: { permission: { isActive: true } },
                      include: { permission: true },
                    },
                    objectPermissions: { include: { object: { select: { name: true, isActive: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const perms: EffectivePermission[] = [];
    for (const assignment of assignments) {
      for (const groupItem of assignment.group.assignments) {
        if (!groupItem.permissionSet.isActive || (tenantId && groupItem.permissionSet.tenantId !== tenantId)) continue;
        for (const item of groupItem.permissionSet.items) {
          perms.push({
            name: item.permission.name,
            module: item.permission.module,
            action: item.permission.action,
            source: 'PERMISSION_SET_GROUP',
            sourceName: assignment.group.name,
          });
        }
        perms.push(...this.objectPermissionsToEffective(
          groupItem.permissionSet.objectPermissions.filter((item) => item.object.isActive),
          'PERMISSION_SET_GROUP',
          assignment.group.name,
        ));
      }
    }
    return perms;
  }

  private static objectPermissionsToEffective(
    objectPermissions: Array<{ object: { name: string }; canCreate: boolean; canRead: boolean; canUpdate: boolean; canDelete: boolean; viewAll: boolean; modifyAll: boolean }>,
    source: 'PROFILE' | 'PERMISSION_SET' | 'PERMISSION_SET_GROUP',
    sourceName: string,
  ): EffectivePermission[] {
    const actionMap = [
      ['canCreate', 'CREATE'],
      ['canRead', 'READ'],
      ['canUpdate', 'UPDATE'],
      ['canDelete', 'DELETE'],
      ['viewAll', 'VIEW_ALL'],
      ['modifyAll', 'MODIFY_ALL'],
    ] as const;

    return objectPermissions.flatMap((permission) => {
      const module = permission.object.name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
      return actionMap
        .filter(([key]) => permission[key])
        .map(([, action]) => ({ name: `${module}_${action}`, module, action, source, sourceName }));
    });
  }

  static async getRolePermissions(userId: string, tenantId?: string): Promise<EffectivePermission[]> {
    const userRoles = await prisma.userRole.findMany({
      where: { userId, ...(tenantId ? { role: { tenantId } } : {}) },
      include: {
        role: {
          include: {
            permissionSets: { include: { permissionSet: true } },
          },
        },
      },
    });

    const actionMap = [
      ['create', 'CREATE'],
      ['read', 'READ'],
      ['edit', 'UPDATE'],
      ['delete', 'DELETE'],
      ['viewAll', 'VIEW_ALL'],
      ['modifyAll', 'MODIFY_ALL'],
    ] as const;

    const perms: EffectivePermission[] = [];
    for (const userRole of userRoles) {
      for (const link of userRole.role.permissionSets) {
        const set = link.permissionSet;
        if (!set || (tenantId && set.tenantId !== tenantId) || !set.objectName) continue;
        const flags = (set.permissions ?? {}) as Record<string, boolean>;
        const module = set.objectName === 'AuditLog' ? 'AUDIT' : set.objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        for (const [key, action] of actionMap) {
          if (flags[key]) {
            perms.push({ name: `${module}_${action}`, module, action, source: 'ROLE', sourceName: userRole.role.name });
          }
        }
      }
    }
    return perms;
  }

  static async getDirectPermissions(userId: string): Promise<EffectivePermission[]> {
    const directPerms = await prisma.userDirectPermission.findMany({
      where: { userId, permission: { isActive: true } },
      include: { permission: true },
    });

    return directPerms.map((dp) => ({
      name: dp.permission.name,
      module: dp.permission.module,
      action: dp.permission.action,
      source: 'DIRECT',
      sourceName: 'Direct User Permission',
    }));
  }

  static deduplicatePermissions(perms: EffectivePermission[]): EffectivePermission[] {
    const seen = new Map<string, EffectivePermission>();
    const priority = { PROFILE: 0, PERMISSION_SET: 1, PERMISSION_SET_GROUP: 1, DIRECT: 2, ROLE: 0 };

    for (const perm of perms) {
      const existing = seen.get(perm.name);
      if (!existing || priority[perm.source] < priority[existing.source]) {
        seen.set(perm.name, perm);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.module.localeCompare(b.module) || a.action.localeCompare(b.action));
  }

  static async getAllSystemPermissions(): Promise<EffectivePermission[]> {
    const allPerms = await prisma.permission.findMany({ where: { isActive: true } });
    return allPerms.map((p) => ({
      name: p.name,
      module: p.module,
      action: p.action,
      source: 'PROFILE' as const,
      sourceName: 'Full System Access',
    }));
  }

  static async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    return this.hasPermissionIn(perms, permissionName);
  }

  static async hasAnyPermission(userId: string, permissionNames: string[]): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    if (perms.some((p) => p.name === FULL_SYSTEM_ACCESS)) return true;
    return permissionNames.some((name) => perms.some((p) => p.name === name));
  }

  static async requirePermission(userId: string, permissionName: string): Promise<{ allowed: boolean; error?: string }> {
    const has = await this.hasPermission(userId, permissionName);
    if (!has) {
      return { allowed: false, error: `Permission denied: ${permissionName} required` };
    }
    return { allowed: true };
  }

  static async getUserPermissionsSummary(userId: string) {
    const effective = await this.getEffectivePermissions(userId);

    const byModule: Record<string, EffectivePermission[]> = {};
    for (const perm of effective) {
      if (!byModule[perm.module]) byModule[perm.module] = [];
      byModule[perm.module].push(perm);
    }

    return {
      permissions: effective,
      byModule,
      total: effective.length,
      hasFullAccess: effective.some((p) => p.name === FULL_SYSTEM_ACCESS),
    };
  }
}