"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Building2,
  ClipboardList,
  FileKey2,
  GitBranch,
  Globe,
  KeyRound,
  LayoutTemplate,
  Mail,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const groups = [
  {
    title: "General",
    description: "Manage people and organization details.",
    items: [
      { label: "Users", href: "/setup/general/users", icon: Users },
      { label: "Company Settings", href: "/setup/general/company-settings", icon: Building2 },
      { label: "Personal Settings", href: "/setup/general/personal-settings", icon: Settings },
    ],
  },
  {
    title: "Security Control",
    description: "Control access and review changes.",
    items: [
      { label: "Profiles", href: "/setup/security/profiles", icon: ShieldCheck },
      { label: "Permission Sets", href: "/setup/security/permission-sets", icon: KeyRound },
      { label: "Roles", href: "/setup/security/roles", icon: GitBranch },
    ],
  },
  {
    title: "Channel Partner Portal",
    description: "Manage Channel Partner Portal access and credentials.",
    items: [
      { label: "CP Portal Accounts", href: "/cp-portal-accounts", icon: KeyRound },
    ],
  },
  {
    title: "Sites",
    description: "Open connected portals.",
    items: [
      { label: "CP Portal", href: "http://localhost:3002/login", icon: Globe, external: true },
    ],
  },
  {
    title: "Customization",
    description: "Shape CRM data and user experiences.",
    items: [
      { label: "RRQueues", href: "/setup/customization/rrqueues", icon: GitBranch },
      { label: "Object Manager", href: "/admin/object-manager", icon: Boxes },
    ],
  },
  {
    title: "Data Administration",
    description: "Prepare the system for data operations.",
    items: [
      { label: "Data Import", href: "/setup/data/import", icon: ClipboardList },
      { label: "Data Export", href: "/setup/data/export", icon: ClipboardList },
      { label: "Duplicate Management", href: "/setup/data/duplicate-management", icon: ClipboardList },
      { label: "Recycle Bin", href: "/setup/data/recycle-bin", icon: ClipboardList },
    ],
  },
];

export default function SetupPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, isAdmin, isSuperAdmin } = useAuth();

  React.useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      router.replace(isAuthenticated ? "/home" : "/login?redirect=/setup");
    }
  }, [isAuthenticated, isAdmin, isLoading, router]);

  if (isLoading || !isAuthenticated || !isAdmin) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Setup</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Configure your CRM, manage access, and keep your organization secure.
          </p>
        </div>
        <Settings className="mt-1 h-8 w-8 text-muted-foreground" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => item.href !== "/admin/object-manager" || isSuperAdmin,
          );
          if (visibleItems.length === 0) return null;
          return (
          <section key={group.title} className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            <div className="mt-5 divide-y">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    target={"external" in item && item.external ? "_blank" : undefined}
                    rel={"external" in item && item.external ? "noopener noreferrer" : undefined}
                    className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-primary"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );
}