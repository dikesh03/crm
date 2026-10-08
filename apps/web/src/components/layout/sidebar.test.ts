import { describe, expect, it } from 'vitest';
import { getNavigationByProfile } from './sidebar';

describe('getNavigationByProfile', () => {
  it('does not grant all CRM modules to an admin profile without matching effective permissions', () => {
    const nav = getNavigationByProfile('Sales Executive', [], () => false, false, true);

    expect(nav.some((item) => item.href === '/setup')).toBe(true);
    expect(nav.some((item) => item.href === '/leads')).toBe(false);
    expect(nav.some((item) => item.href === '/bookings')).toBe(false);
    expect(nav.some((item) => item.href === '/reports')).toBe(true);
  });

  it('grants module access only when the required effective permission exists', () => {
    const nav = getNavigationByProfile('Sales Executive', [], (perm) => perm === 'LEAD_READ' || perm === 'REPORT_VIEW', false, false);

    expect(nav.some((item) => item.href === '/leads')).toBe(true);
    expect(nav.some((item) => item.href === '/reports')).toBe(true);
    expect(nav.some((item) => item.href === '/opportunities')).toBe(false);
  });
});

describe('role-based sidebar matrix', () => {
  const withPerms = (...perms: string[]) => (perm: string) => perms.includes(perm);

  const presalesPerms = ['LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ'];
  const salesPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'OPPORTUNITY_READ', 'QUOTATION_READ', 'BOOKING_READ', 'PAYMENT_READ', 'PROJECT_READ',
  ];
  const crmPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'OPPORTUNITY_READ', 'QUOTATION_READ', 'BOOKING_READ', 'PAYMENT_READ',
    'PROJECT_READ', 'TASK_READ',
  ];
  const allPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'OPPORTUNITY_READ', 'QUOTATION_READ',
    'BOOKING_READ', 'PAYMENT_READ', 'PROJECT_READ', 'TASK_READ', 'UNIT_READ',
    'FOLLOW_UP_READ', 'REPORT_VIEW',
  ];

  it('Presales sees Home, Leads, Site Visits, and Reports', () => {
    const nav = getNavigationByProfile('Presales', [], withPerms(...presalesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Reports']);
  });

  it('SVC sees Home, Leads, Site Visits, and Reports', () => {
    const nav = getNavigationByProfile('SVC', [], withPerms(...presalesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Reports']);
  });

  it('Sales sees Leads, Site Visits, Opportunities, Quotations, Bookings, Payments, and Reports', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...salesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments',
      'Reports',
    ]);
  });

  it('CRM sees the Sales modules plus Projects and Tasks, and Reports', () => {
    const nav = getNavigationByProfile('CRM', [], withPerms(...crmPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments',
      'Projects', 'Tasks', 'Reports',
    ]);
  });

  it('Admin keeps the original module list with Pre Sales, Sales, and SVC added', () => {
    const nav = getNavigationByProfile('Admin', [], withPerms(...allPerms), false, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments',
      'Projects', 'Tasks', 'Pre Sales', 'Sales', 'SVC', 'Reports', 'Setup Home',
    ]);
    expect(nav.some((item) => item.title === 'CP Portal Accounts')).toBe(false);
    expect(nav.some((item) => item.title === 'Pre Sales' && item.href === '/profiles/pre-sales')).toBe(true);
    expect(nav.some((item) => item.title === 'Sales' && item.href === '/profiles/sales')).toBe(true);
    expect(nav.some((item) => item.title === 'SVC' && item.href === '/profiles/svc')).toBe(true);
  });

  it('Non-admin profiles keep the required modules without showing Units and without affecting admin behavior', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...allPerms), false, false);
    expect(nav.some((item) => item.title === 'Home')).toBe(true);
    expect(nav.some((item) => item.title === 'Units')).toBe(false);
    expect(nav.some((item) => item.title === 'Reports')).toBe(true);
    expect(nav.some((item) => item.title === 'Leads')).toBe(true);
    expect(nav.some((item) => item.title === 'Tasks')).toBe(true);
    expect(nav.some((item) => item.title === 'Followups')).toBe(true);
    expect(nav.some((item) => item.title === 'Setup Home')).toBe(false);
  });

  it('Superadmin sees Companies and every module plus Setup Home', () => {
    const nav = getNavigationByProfile(undefined, [], withPerms(...allPerms), true, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Companies', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings',
      'Payments', 'Projects', 'Tasks', 'Reports', 'Setup Home',
    ]);
    expect(nav.some((item) => item.title === 'CP Portal Accounts')).toBe(false);
  });
});