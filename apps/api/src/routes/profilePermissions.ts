import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();
router.use(authenticate);

const setProfilePermissionsSchema = z.object({
  permissionIds: z.array(z.string()),
});

router.get('/:profileId/permissions', requirePermission('PROFILE_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.profileId, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const profilePerms = await prisma.userProfilePermission.findMany({
      where: { profileId: req.params.profileId },
      include: { permission: true },
      orderBy: { permission: { module: 'asc' } },
    });

    res.json({ success: true, data: profilePerms });
  } catch (error) {
    console.error('Get profile permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile permissions' });
  }
});

router.put('/:profileId/permissions', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.profileId, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    if (profile.isGlobal && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can modify shared profile permissions' });
    }

    const data = setProfilePermissionsSchema.parse(req.body);
    const permissionIds = [...new Set(data.permissionIds)];

    const validPermissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds }, isActive: true },
    });

    if (validPermissions.length !== permissionIds.length) {
      return res.status(422).json({ success: false, error: 'One or more invalid permission IDs' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userProfilePermission.deleteMany({ where: { profileId: req.params.profileId } });

      if (permissionIds.length > 0) {
        await tx.userProfilePermission.createMany({
          data: permissionIds.map((permissionId) => ({ profileId: req.params.profileId, permissionId })),
        });
      }
    });

    const updated = await prisma.userProfilePermission.findMany({
      where: { profileId: req.params.profileId },
      include: { permission: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'ProfilePermissions',
        objectId: req.params.profileId,
        newValues: { permissionCount: permissionIds.length },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Set profile permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile permissions' });
  }
});

router.post('/:profileId/permissions', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.profileId, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    if (profile.isGlobal && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can modify shared profile permissions' });
    }

    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      return res.status(400).json({ success: false, error: 'permissionIds array is required' });
    }

    const uniquePermissionIds = [...new Set(permissionIds.filter((id: unknown): id is string => typeof id === 'string'))];
    if (uniquePermissionIds.length !== permissionIds.length) {
      return res.status(400).json({ success: false, error: 'permissionIds must contain only strings' });
    }

    const validCount = await prisma.permission.count({ where: { id: { in: uniquePermissionIds }, isActive: true } });
    if (validCount !== uniquePermissionIds.length) {
      return res.status(422).json({ success: false, error: 'One or more invalid permission IDs' });
    }

    const existing = await prisma.userProfilePermission.findMany({
      where: { profileId: req.params.profileId, permissionId: { in: uniquePermissionIds } },
      select: { permissionId: true },
    });

    const existingIds = new Set(existing.map((e) => e.permissionId));
    const newIds = uniquePermissionIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return res.status(409).json({ success: false, error: 'All permissions already assigned' });
    }

    const created = await prisma.userProfilePermission.createMany({
      data: newIds.map((permissionId: string) => ({ profileId: req.params.profileId, permissionId })),
    });

    res.status(201).json({ success: true, data: { added: created.count } });
  } catch (error) {
    console.error('Add profile permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to add profile permissions' });
  }
});

router.delete('/:profileId/permissions/:permissionId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.profileId, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
      select: { id: true, isGlobal: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    if (profile.isGlobal && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can modify shared profile permissions' });
    }

    const deleted = await prisma.userProfilePermission.deleteMany({
      where: { profileId: req.params.profileId, permissionId: req.params.permissionId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ success: false, error: 'Profile permission not found' });
    }

    res.json({ success: true, message: 'Permission removed from profile' });
  } catch (error) {
    console.error('Remove profile permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove profile permission' });
  }
});

export { router as profilePermissionRoutes };