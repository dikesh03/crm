import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

function isCRMAdmin(req: AuthRequest) {
  return Boolean(req.user?.isSuperAdmin || req.user?.isAdmin);
}

function authorizeCRMAdmin(req: AuthRequest, res: Response) {
  if (isCRMAdmin(req)) return true;
  res.status(403).json({ success: false, error: 'Administrator access required' });
  return false;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1).max(254).transform((value) => value.toLowerCase()),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  if (!authorizeCRMAdmin(req, res)) return;
  try {
    const accounts = await prisma.cPPortalAccount.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ success: true, data: { accounts } });
  } catch (error) {
    console.error('CP Portal account listing failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load CP Portal accounts' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  if (!authorizeCRMAdmin(req, res)) return;
  try {
    const input = createSchema.parse(req.body);
    const existing = await prisma.cPPortalAccount.findFirst({
      where: {
        tenantId: req.tenantId!,
        OR: [
          { email: { equals: input.email, mode: 'insensitive' } },
          { username: { equals: input.username, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A CP Portal account already uses this username or email',
      });
    }

    const account = await prisma.cPPortalAccount.create({
      data: {
        tenantId: req.tenantId!,
        name: input.name,
        username: input.username,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
      select: { id: true, name: true, username: true, email: true, category: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ success: true, data: account, message: 'CP Portal account created' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'A CP Portal account already uses this username or email' });
    }
    console.error('CP Portal account creation failed:', error);
    res.status(500).json({ success: false, error: 'Unable to create CP Portal account' });
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  username: z.string().trim().min(1).max(254).transform((value) => value.toLowerCase()).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(8).max(128).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

router.put('/:id', async (req: AuthRequest, res: Response) => {
  if (!authorizeCRMAdmin(req, res)) return;
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.cPPortalAccount.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'CP Portal account not found' });

    if (input.email || input.username) {
      const emailOwner = await prisma.cPPortalAccount.findFirst({
        where: {
          tenantId: req.tenantId!,
          id: { not: existing.id },
          OR: [
            ...(input.email ? [{ email: { equals: input.email, mode: 'insensitive' as const } }] : []),
            ...(input.username ? [{ username: { equals: input.username, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true },
      });
      if (emailOwner) return res.status(409).json({ success: false, error: 'A CP Portal account already uses this username or email' });
    }

    const account = await prisma.cPPortalAccount.update({
      where: { id: existing.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.username ? { username: input.username } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, name: true, username: true, email: true, category: true, isActive: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data: account, message: 'CP Portal account updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'A CP Portal account already uses this username or email' });
    }
    console.error('CP Portal account update failed:', error);
    res.status(500).json({ success: false, error: 'Unable to update CP Portal account' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  if (!authorizeCRMAdmin(req, res)) return;
  try {
    const account = await prisma.cPPortalAccount.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      select: {
        id: true,
        _count: { select: { leads: true } },
      },
    });
    if (!account) return res.status(404).json({ success: false, error: 'CP Portal account not found' });

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { tenantId: req.tenantId!, cpPortalAccountId: account.id },
        data: { cpPortalAccountId: null },
      }),
      prisma.cPPortalNote.updateMany({
        where: { tenantId: req.tenantId!, cpPortalAccountId: account.id },
        data: { cpPortalAccountId: null },
      }),
      prisma.cPPortalAccount.delete({ where: { id: account.id } }),
    ]);

    res.json({
      success: true,
      message: 'CP Portal account deleted',
      data: { unlinkedLeadCount: account._count.leads },
    });
  } catch (error) {
    console.error('CP Portal account deletion failed:', error);
    res.status(500).json({ success: false, error: 'Unable to delete CP Portal account' });
  }
});

export default router;
