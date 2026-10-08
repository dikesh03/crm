import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { normalizePhone } from '@dct-crm/shared';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const COOKIE_NAME = 'cp_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};

type CPRequest = AuthRequest & { cp?: { id: string; tenantId: string; email: string; username: string; name: string } };

async function requireCP(req: CPRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, error: 'CP authentication required' });
  }

  let decoded: { accountId: string; tenantId: string; portal: string };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as typeof decoded;
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired CP session' });
  }
  if (decoded.portal !== 'cp') {
    return res.status(401).json({ success: false, error: 'Invalid CP session' });
  }

  try {
    const account = await prisma.cPPortalAccount.findFirst({
      where: { id: decoded.accountId, tenantId: decoded.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        tenantId: true,
        tenant: { select: { isActive: true, companyStartDate: true, companyExpiryDate: true } },
      },
    });
    if (!account) {
      return res.status(401).json({ success: false, error: 'Invalid CP session' });
    }
    const now = new Date();
    if (
      !account.tenant.isActive ||
      (account.tenant.companyStartDate && now < account.tenant.companyStartDate) ||
      (account.tenant.companyExpiryDate && now > account.tenant.companyExpiryDate)
    ) {
      return res.status(403).json({ success: false, error: 'CP account is unavailable' });
    }

    req.cp = {
      id: account.id,
      tenantId: account.tenantId,
      email: account.email,
      username: account.username,
      name: account.name,
    };
    req.tenantId = account.tenantId;
    next();
  } catch (error) {
    next(error);
  }
}

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().email().max(254).optional(),
  password: z.string().min(1).max(128),
}).refine((input) => Boolean(input.identifier || input.email), 'Enter a username or email');

router.post('/login', async (req: Request, res: Response) => {
  try {
    const input = loginSchema.parse(req.body);
    const identifier = input.identifier || input.email!;
    const { password } = input;
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'CRM authentication is not configured. Set JWT_SECRET in the local CRM environment.',
      });
    }
    const accounts = await prisma.cPPortalAccount.findMany({
      where: {
        isActive: true,
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      include: { tenant: { select: { isActive: true, companyStartDate: true, companyExpiryDate: true } } },
      take: 2,
    });
    const validAccounts = await Promise.all(accounts.map(async (account) =>
      await bcrypt.compare(password, account.passwordHash) ? account : null,
    ));
    const matchingAccounts = validAccounts.filter((account) => account !== null);
    if (matchingAccounts.length !== 1) {
      return res.status(401).json({ success: false, error: 'Invalid username, email, or password' });
    }
    const account = matchingAccounts[0]!;
    const now = new Date();
    if (
      !account.tenant.isActive ||
      (account.tenant.companyStartDate && now < account.tenant.companyStartDate) ||
      (account.tenant.companyExpiryDate && now > account.tenant.companyExpiryDate)
    ) {
      return res.status(403).json({ success: false, error: 'CP account is unavailable' });
    }
    const token = jwt.sign(
      { accountId: account.id, tenantId: account.tenantId, portal: 'cp' },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'] },
    );
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { id: account.id, email: account.email, username: account.username, name: account.name },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('CP login failed:', error);
    if (typeof error === 'object' && error && 'code' in error && ['P2021', 'P2022'].includes(String(error.code))) {
      return res.status(503).json({
        success: false,
        error: 'CP Portal account storage is not initialized. Ask a CRM administrator to apply the database schema update.',
      });
    }
    if (typeof error === 'object' && error && 'code' in error && String(error.code).startsWith('P10')) {
      return res.status(503).json({
        success: false,
        error: 'Unable to reach the CRM database. Check the CRM database configuration and try again.',
      });
    }
    if (error instanceof Error && error.message.includes('Environment variable not found: DATABASE_URL')) {
      return res.status(503).json({
        success: false,
        error: 'CRM database is not configured. Add DATABASE_URL to the local CRM environment before signing in.',
      });
    }
    if (error instanceof Error && error.message.includes('Authentication failed against database server')) {
      return res.status(503).json({
        success: false,
        error: 'PostgreSQL rejected the credentials in DATABASE_URL. Update the local CRM .env with the correct database password.',
      });
    }
    res.status(500).json({ success: false, error: 'Unable to sign in' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ success: true });
});

router.get('/me', requireCP, async (req: CPRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.cp!.id,
      username: req.cp!.username,
      email: req.cp!.email,
      name: req.cp!.name,
    },
  });
});

const leadInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().or(z.literal('')),
  secondaryEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(3).max(40),
  secondaryPhone: z.string().trim().max(40).optional().or(z.literal('')),
  projectId: z.string().min(1),
  budget: z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(0)),
  sqftRange: z.string().max(100).optional(),
  bhkSize: z.string().max(50).optional(),
  propertyType: z.string().max(100).optional(),
  stage: z.enum(['cold', 'warm', 'hot', 'lost']).default('cold'),
  remarks: z.string().max(4000).optional(),
});

function statusFilter(stage: string | undefined) {
  if (!stage || stage === 'all') return {};
  if (stage === 'lost') return { status: 'LOST' as const };
  const rating = stage.toUpperCase();
  if (rating === 'HOT' || rating === 'WARM' || rating === 'COLD') {
    return { rating: rating as 'HOT' | 'WARM' | 'COLD' };
  }
  return {};
}

function leadWhere(req: CPRequest, filters: { from?: string; to?: string; projectId?: string }) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
  return {
    tenantId: req.cp!.tenantId,
    cpPortalAccountId: req.cp!.id,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
}

router.get('/leads', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const stage = String(req.query.stage || 'all').toLowerCase();
    const projectId = String(req.query.projectId || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const baseWhere = leadWhere(req, { projectId, from, to });
    const searchTerms = search.split(/\s+/).filter(Boolean);
    const where = {
      ...baseWhere,
      ...statusFilter(stage),
      ...(searchTerms.length ? {
        AND: searchTerms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' as const } },
            { lastName: { contains: term, mode: 'insensitive' as const } },
            { email: { contains: term, mode: 'insensitive' as const } },
            { secondaryEmail: { contains: term, mode: 'insensitive' as const } },
            { project: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        })),
      } : {}),
    };
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        siteVisits: { select: { id: true, status: true, completedAt: true }, orderBy: { scheduledAt: 'desc' }, take: 1 },
        bookings: { select: { id: true, status: true, payments: { select: { id: true } } } },
        activities: {
          where: { type: 'NOTE' },
          select: { id: true, subject: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        cpPortalNotes: { select: { id: true, category: true, text: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    res.json({ success: true, data: leads });
  } catch (error) {
    console.error('CP leads retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load leads' });
  }
});

router.post('/leads', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = leadInputSchema.parse(req.body);
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, tenantId: req.cp!.tenantId, isActive: true },
      select: { id: true },
    });
    if (!project) return res.status(400).json({ success: false, error: 'Select a valid project' });

    const leadCreator = await prisma.user.findFirst({
      where: { tenantId: req.cp!.tenantId, isActive: true, profile: { isAdmin: true } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!leadCreator) {
      return res.status(503).json({ success: false, error: 'No active CRM administrator is available to record this lead' });
    }

    const phone = normalizePhone(input.phone);
    const [phoneCandidates, duplicateByEmail] = await Promise.all([
      prisma.lead.findMany({
        where: { tenantId: req.cp!.tenantId, phone: { not: null } },
        select: { id: true, phone: true },
      }),
      input.email
        ? prisma.lead.findFirst({
            where: { tenantId: req.cp!.tenantId, email: { equals: input.email, mode: 'insensitive' } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (
      duplicateByEmail ||
      phoneCandidates.some((candidate) => candidate.phone && normalizePhone(candidate.phone) === phone)
    ) {
      return res.status(409).json({ success: false, duplicate: true, message: 'Lead Exists on the System Already' });
    }

    const nameParts = input.fullName.trim().split(/\s+/);
    const lead = await prisma.$transaction(async (tx) => {
      const sequence = await tx.sequence.upsert({
        where: { tenantId_type: { tenantId: req.cp!.tenantId, type: 'LEAD' } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId: req.cp!.tenantId, type: 'LEAD', nextValue: 1 },
      });
      const created = await tx.lead.create({
        data: {
          tenantId: req.cp!.tenantId,
          creatorId: leadCreator.id,
          cpPortalAccountId: req.cp!.id,
          leadNumber: `LN${String(sequence.nextValue).padStart(6, '0')}`,
          firstName: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : undefined,
          lastName: nameParts[nameParts.length - 1],
          company: req.cp!.name || 'Channel Partner',
          source: 'CHANNEL_PARTNER',
          secondarySource: 'CP Portal',
          tertiarySource: req.cp!.name,
          status: input.stage === 'lost' ? 'LOST' : 'NEW',
          rating: input.stage === 'lost' ? undefined : input.stage.toUpperCase() as 'COLD' | 'WARM' | 'HOT',
          phone,
          email: input.email || undefined,
          secondaryEmail: input.secondaryEmail || undefined,
          secondaryPhone: input.secondaryPhone || undefined,
          projectId: project.id,
          budget: input.budget,
          sqftRange: input.sqftRange || undefined,
          bhkSize: input.bhkSize || undefined,
          propertyType: input.propertyType || undefined,
          description: input.remarks || undefined,
        },
      });
      const noteText = input.remarks?.trim() || 'Enquiry created successfully';
      await tx.cPPortalNote.create({
        data: {
          tenantId: req.cp!.tenantId,
          leadId: created.id,
          cpPortalAccountId: req.cp!.id,
          category: 'Initial Remarks',
          text: noteText,
        },
      });
      return created;
    });
    res.status(201).json({ success: true, data: lead, message: 'Lead Registered Successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, duplicate: true, message: 'Lead Exists on the System Already' });
    }
    console.error('CP lead creation failed:', error);
    res.status(500).json({ success: false, error: 'Unable to register lead' });
  }
});

router.get('/dashboard', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const leads = await prisma.lead.findMany({
      where: leadWhere(req, { projectId, from, to }),
      select: {
        id: true,
        status: true,
        rating: true,
        isRegistered: true,
        cancelledAfterBooking: true,
        invoiceRaised: true,
        siteVisits: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
      },
    });
    const stats = {
      totalLeads: leads.length,
      lostLeads: leads.filter((lead) => lead.status === 'LOST').length,
      siteVisits: leads.filter((lead) => lead.siteVisits.length > 0).length,
      qualifiedLeads: leads.filter((lead) => lead.rating === 'HOT' || lead.rating === 'WARM').length,
      bookedLeads: leads.filter((lead) => lead.status === 'BOOKED').length,
      commissionPaid: leads.filter((lead) => lead.status === 'BOOKED').length * 125000,
      registeredLeads: leads.filter((lead) => lead.isRegistered).length,
      commissionPending: leads.filter((lead) => lead.rating === 'HOT' || lead.rating === 'WARM').length * 75000,
      cancelledAfterBooking: leads.filter((lead) => lead.cancelledAfterBooking).length,
      invoicesRaised: leads.filter((lead) => lead.invoiceRaised).length,
    };
    const recentLeads = await prisma.lead.findMany({
      where: leadWhere(req, { projectId, from, to }),
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, leadNumber: true, firstName: true, lastName: true, status: true, createdAt: true, project: { select: { name: true } } },
    });
    res.json({ success: true, data: { stats, recentLeads } });
  } catch (error) {
    console.error('CP dashboard retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load dashboard' });
  }
});

router.get('/projects', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { tenantId: req.cp!.tenantId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        units: { select: { status: true } },
        _count: { select: { units: true } },
      },
    });
    res.json({
      success: true,
      data: projects.map(({ units, _count, ...project }) => ({
        ...project,
        availableUnits: units.filter((unit) => unit.status === 'AVAILABLE').length,
        totalUnits: project.totalUnits ?? _count.units,
      })),
    });
  } catch (error) {
    console.error('CP projects retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load projects' });
  }
});

router.get('/projects/:id/brochure', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: req.cp!.tenantId, isActive: true },
      select: { brochureUrl: true },
    });
    if (!project?.brochureUrl) return res.status(404).json({ success: false, error: 'Brochure not found' });
    res.json({ success: true, data: { url: project.brochureUrl } });
  } catch (error) {
    console.error('CP brochure retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to retrieve brochure' });
  }
});

router.get('/leads/:id/notes', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const leadWhereClause = { id: req.params.id, tenantId: req.cp!.tenantId, cpPortalAccountId: req.cp!.id };
    const lead = await prisma.lead.findFirst({ where: leadWhereClause, select: { id: true } });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const [cpNotes, crmNotes] = await Promise.all([
      prisma.cPPortalNote.findMany({
        where: { tenantId: req.cp!.tenantId, leadId: lead.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activity.findMany({
        where: { tenantId: req.cp!.tenantId, leadId: lead.id, type: 'NOTE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, subject: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    res.json({ success: true, data: { cpNotes, crmNotes } });
  } catch (error) {
    console.error('CP notes retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load lead notes' });
  }
});

router.post('/leads/:id/notes', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = z.object({
      category: z.string().trim().min(1).max(80),
      text: z.string().trim().min(1).max(4000),
    }).parse(req.body);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.cp!.tenantId, cpPortalAccountId: req.cp!.id },
      select: { id: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const note = await prisma.cPPortalNote.create({
      data: {
        tenantId: req.cp!.tenantId,
        leadId: lead.id,
        cpPortalAccountId: req.cp!.id,
        ...input,
      },
    });
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('CP note creation failed:', error);
    res.status(500).json({ success: false, error: 'Unable to add note' });
  }
});

router.post('/reset-password', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = z.object({
      email: z.string().trim().email(),
      newPassword: z.string().min(8).max(128),
    }).parse(req.body);
    if (input.email.toLowerCase() !== req.cp!.email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'You can only reset the password for your CP account' });
    }
    await prisma.cPPortalAccount.update({
      where: { id: req.cp!.id },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12) },
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('CP password reset failed:', error);
    res.status(500).json({ success: false, error: 'Unable to reset password' });
  }
});

export default router;
