import './loadEnv';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { authRoutes as authRouter } from './routes/auth';
import { leadRoutes as leadRouter } from './routes/leads';
import siteVisitRouter from './routes/siteVisits';
import opportunityRouter from './routes/opportunities';
import quotationRouter from './routes/quotations';
import bookingRouter from './routes/bookings';
import paymentRouter from './routes/payments';
import projectRouter from './routes/projects';
import unitRouter from './routes/units';
import { taskRoutes as taskRouter } from './routes/tasks';
import { followUpRoutes as followUpRouter } from './routes/followUps';
import { activityRoutes as activityRouter } from './routes/activities';
import { userRoutes as userRouter } from './routes/users';
import { roleRoutes as roleRouter } from './routes/roles';
import { profileRoutes as profileRouter } from './routes/profiles';
import reportRouter, { reportFolderRouter, reportMetadataRouter } from './routes/reports';
import { dashboardRoutes as dashboardRouter } from './routes/dashboards';
import { homepageRoutes as homepageRouter } from './routes/homepages';
import { searchRoutes as searchRouter } from './routes/search';
import { analyticsRoutes as analyticsRouter } from './routes/analytics';
import { aiRoutes as aiRouter } from './routes/ai';
import { adminRoutes as adminRouter } from './routes/admin';
import { auditRoutes as auditRouter } from './routes/audit';
import { notificationRoutes as notificationRouter } from './routes/notifications';
import { objectDefinitionRoutes as objectDefinitionRouter } from './routes/objectDefinitions';
import { fieldDefinitionRoutes as fieldDefinitionRouter } from './routes/fieldDefinitions';
import { picklistValueRoutes as picklistValueRouter } from './routes/picklistValues';
import { pageLayoutRoutes as pageLayoutRouter } from './routes/pageLayouts';
import { objectPermissionRoutes as objectPermissionRouter } from './routes/objectPermissions';
import { fieldPermissionRoutes as fieldPermissionRouter } from './routes/fieldPermissions';
import { dynamicCrudRoutes as dynamicCrudRouter } from './routes/dynamicCrud';
import { permissionCatalogRoutes as permissionCatalogRouter } from './routes/permissionCatalog';
import { newPermissionSetRoutes as newPermissionSetRouter } from './routes/permissionSets';
import { userPermissionRoutes as userPermissionRouter } from './routes/userPermissions';
import { effectivePermissionRoutes as effectivePermissionRouter } from './routes/effectivePermissions';
import { profilePermissionRoutes as profilePermissionRouter } from './routes/profilePermissions';
import { permissionSetGroupRoutes, userPermissionSetGroupRoutes } from './routes/permissionSetGroups';
import { dataAdministrationRoutes as dataAdministrationRouter } from './routes/dataAdministration';
import { companyRoutes as companyRouter } from './routes/companies';
import setupUsersRouter from './routes/setup/users';
import setupCompanySettingsRouter from './routes/setup/company-settings';
import setupPersonalSettingsRouter from './routes/setup/personal-settings';
import profileSecurityRouter from './routes/profileSecurity';
import rrQueueRouter from './routes/rrQueues';
import cpPortalRouter from './routes/cpPortal';
import cpPortalAccountsRouter from './routes/cpPortalAccounts';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan('combined'));

  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'DCT CRM API', timestamp: new Date().toISOString() });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/cp-portal', cpPortalRouter);
  app.use('/api/cp-portal-accounts', cpPortalAccountsRouter);
  app.use('/api/leads', leadRouter);
  app.use('/api/site-visits', siteVisitRouter);
  app.use('/api/opportunities', opportunityRouter);
  app.use('/api/quotations', quotationRouter);
  app.use('/api/bookings', bookingRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/units', unitRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/follow-ups', followUpRouter);
  app.use('/api/activities', activityRouter);
  app.use('/api/users', userRouter);
  app.use('/api/setup/users', setupUsersRouter);
  app.use('/api/setup/company-settings', setupCompanySettingsRouter);
  app.use('/api/setup/personal-settings', setupPersonalSettingsRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/profiles', profileRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/report-folders', reportFolderRouter);
  app.use('/api/report-metadata', reportMetadataRouter);
  app.use('/api/dashboards', dashboardRouter);
  app.use('/api/homepages', homepageRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/super-admin', companyRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/objects', objectDefinitionRouter);
  app.use('/api/setup/modules', objectDefinitionRouter);
  app.use('/api/fields', fieldDefinitionRouter);
  app.use('/api/setup/fields', fieldDefinitionRouter);
  app.use('/api/picklist-values', picklistValueRouter);
  app.use('/api/layouts', pageLayoutRouter);
  app.use('/api/setup/layouts', pageLayoutRouter);
  app.use('/api/object-permissions', objectPermissionRouter);
  app.use('/api/field-permissions', fieldPermissionRouter);
  app.use('/api/records', dynamicCrudRouter);
  app.use('/api/permissions', permissionCatalogRouter);
  app.use('/api/new-permission-sets', newPermissionSetRouter);
  app.use('/api/user-permissions', userPermissionRouter);
  app.use('/api/permission-set-groups', permissionSetGroupRoutes);
  app.use('/api/user-permission-set-groups', userPermissionSetGroupRoutes);
  app.use('/api/effective-permissions', effectivePermissionRouter);
  app.use('/api/profile-permissions', profilePermissionRouter);
  app.use('/api/data-administration', dataAdministrationRouter);
  app.use('/api/profile-security', profileSecurityRouter);
  app.use('/api/rrqueues', rrQueueRouter);

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    void req;
    void next;
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error', detail: err?.message });
    }
  });

  return app;
};

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`DCT CRM API server running on port ${PORT}`);
  });
}

export default app;