# DCT-CRM

Enterprise Multi-Tenant CRM with dynamic object management, role-based access control, and permission-based authorization.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), shadcn/ui, TypeScript
- **Backend:** Express.js, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Auth:** JWT (HTTP-only cookies)

## Features

- Multi-tenant architecture with Super Admin
- Super Admin can create shared profiles that are visible and assignable across tenant companies
- Dynamic Object Manager (create custom objects/fields at runtime)
- Role-based access control (RBAC) with profiles, permission sets, and direct permissions
- 100 granular permissions across 20 modules
- Standard Lead fields (27 fields with picklists)
- Dynamic forms, tables, and detail views
- CRM workflow engine with status transitions
- Audit logging and activity tracking

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
cd packages/db
npx prisma db push
npx ts-node src/seed-super-admin.ts
npx ts-node src/seed.ts
npx ts-node src/seed-lead-fields.ts

# Start API server
cd apps/api
npm run dev

# Start Web server
cd apps/web
npm run dev
```

For existing databases, apply `packages/db/migrations/add-global-profiles.sql` before deploying the updated API.

## Login Credentials

| Email                   | Password    | Role        |
| ----------------------- | ----------- | ----------- |
| superadmin@dctcrm.com   | password123 | Super Admin |
| admin@dctcrm.com        | password123 | Admin       |
| salesmanager@dctcrm.com | password123 | Manager     |
| priya@dctcrm.com        | password123 | Sales       |
| amit@dctcrm.com         | password123 | Sales       |
| neha@dctcrm.com         | password123 | Presales    |
| finance@dctcrm.com      | password123 | Finance     |

## Test Users

The profile seed command creates or reuses these local test users in the
`dct-re` tenant. The password is hashed in the database and is intended only
for local testing.

| Profile | Username | Password |
|---|---|---|
| Admin | admin.test1@dctcrm.com | DctTest@123 |
| Admin | admin.test2@dctcrm.com | DctTest@123 |
| Admin | admin.test3@dctcrm.com | DctTest@123 |
| Presales | presales.test1@dctcrm.com | DctTest@123 |
| Presales | presales.test2@dctcrm.com | DctTest@123 |
| Presales | presales.test3@dctcrm.com | DctTest@123 |
| SVC | svc.test1@dctcrm.com | DctTest@123 |
| SVC | svc.test2@dctcrm.com | DctTest@123 |
| SVC | svc.test3@dctcrm.com | DctTest@123 |
| Sales | sales.test1@dctcrm.com | DctTest@123 |
| Sales | sales.test2@dctcrm.com | DctTest@123 |
| Sales | sales.test3@dctcrm.com | DctTest@123 |
| CRM | crm.test1@dctcrm.com | DctTest@123 |
| CRM | crm.test2@dctcrm.com | DctTest@123 |
| CRM | crm.test3@dctcrm.com | DctTest@123 |
| Finance | finance.test1@dctcrm.com | DctTest@123 |
| Finance | finance.test2@dctcrm.com | DctTest@123 |
| Finance | finance.test3@dctcrm.com | DctTest@123 |
| Manager | manager.test1@dctcrm.com | DctTest@123 |
| Manager | manager.test2@dctcrm.com | DctTest@123 |
| Manager | manager.test3@dctcrm.com | DctTest@123 |
| Recovery | recovery.test1@dctcrm.com | DctTest@123 |
| Recovery | recovery.test2@dctcrm.com | DctTest@123 |
| Recovery | recovery.test3@dctcrm.com | DctTest@123 |

## Test Login

1. Start the application with `npm run dev`.
2. Open `http://localhost:3000/login`.
3. Use a profile-specific test user above.
4. Verify the displayed profile and test its effective permissions.

Local service URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- AI: `http://localhost:8001`

## Channel Partner Portal

The standalone CP Portal UI is available at `http://localhost:3002/login`.
It has its own routes, navigation and `cp_token` HTTP-only session cookie; signing
out of the portal does not clear the CRM `token` cookie. CP Portal accounts are
standalone records and do not require or share CRM user credentials. Each account
has its own Channel Partner name, username, email, and password; passwords are
stored as hashes and never returned from the CRM management API. The API derives
the partner identity from the authenticated CP account and scopes lead reads,
notes, dashboard results and exports to that account's leads.

CRM administrators can create, edit, disable, and reset these credentials from
**Setup Home → CP Portal Accounts**. Create one record per Channel Partner; the
API prevents duplicate usernames and email addresses within a tenant. CP users
can sign in with either their portal username or email. The current password is
intentionally not readable; save a new password to replace it.

CP Portal fields and partner notes add columns and a table to the existing CRM
Prisma schema. After pulling these changes, update the existing database and
generate the Prisma client:

```bash
npm run db:push
npm run db:generate
```

Run the existing CRM API and web workspaces (`npm run dev:api` and
`npm run dev:web`, or `npm run dev`), then start the separate CP Portal site
with `npm run dev:cp`. Open the CP Portal URL above. Its same-origin API proxy
forwards to the CRM backend using `BACKEND_URL` (default
`http://localhost:3001`); the backend uses the existing `DATABASE_URL` and
`JWT_SECRET` settings.

Before database-backed sign-in, configure `DATABASE_URL` and `JWT_SECRET` in
the CRM's local `.env`, run the schema commands above, and create a standalone
CP Portal account from the admin page. Do not paste database credentials into
source control.

### Lead API test users

Lead creation is allowed for:

- `admin.test1@dctcrm.com`
- `admin.test2@dctcrm.com`
- `admin.test3@dctcrm.com`
- `presales.test1@dctcrm.com`
- `presales.test2@dctcrm.com`
- `presales.test3@dctcrm.com`

Lead creation is denied for negative API tests using:

- `sales.test1@dctcrm.com`
- `svc.test1@dctcrm.com`
- `crm.test1@dctcrm.com`
- `finance.test1@dctcrm.com`
- `manager.test1@dctcrm.com`
- `recovery.test1@dctcrm.com`

## Project Structure

```
dct-crm/
├── apps/
│   ├── api/          # Express.js backend
│   ├── cp-portal/    # Independent Channel Partner website
│   └── web/          # Next.js frontend
├── packages/
│   ├── db/           # Prisma schema & migrations
│   └── shared/       # Shared Zod schemas
```
