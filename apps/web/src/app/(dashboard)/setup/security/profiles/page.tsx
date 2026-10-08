"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Save, Search, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { permissionApi, profileApi, profileSecurityApi } from "@/lib/api";

type Scope = "OWN" | "TEAM" | "ALL";
type ObjectPermission = { objectId: string; canCreate: boolean; canRead: boolean; canUpdate: boolean; canDelete: boolean; viewAll: boolean; modifyAll: boolean };
type FieldPermission = { fieldId: string; canRead: boolean; canEdit: boolean };
type SecurityData = { profile: any; objects: any[]; objectPermissions: ObjectPermission[]; fieldPermissions: FieldPermission[]; permissions: any[]; recordAccess: Record<string, Scope> };

const modules = ["Lead", "Opportunity", "SiteVisit", "Quotation", "Booking", "Payment", "Project", "Unit", "Report", "Dashboard", "User", "Role"];
const actions = ["CREATE", "READ", "UPDATE", "DELETE"] as const;

export default function SetupProfilesPage() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const [profiles, setProfiles] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<any>(null);
  const [security, setSecurity] = React.useState<SecurityData | null>(null);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingSecurity, setLoadingSecurity] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState("overview");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createDescription, setCreateDescription] = React.useState("");
  const [createAdmin, setCreateAdmin] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const loadProfiles = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await profileApi.list({ limit: 100 });
      const data = response.data.data || [];
      setProfiles(data);
      if (!selected && data[0]) setSelected(data[0]);
    } catch (error: any) {
      toast({ title: "Unable to load profiles", description: error?.response?.data?.error || error.message, variant: "destructive" as any });
    } finally { setLoading(false); }
  }, [selected, toast]);

  React.useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  React.useEffect(() => {
    if (!selected) return;
    setLoadingSecurity(true);
    profileSecurityApi.get(selected.id)
      .then((response) => setSecurity(response.data.data))
      .catch((error: any) => toast({ title: "Unable to load profile security", description: error?.response?.data?.error || error.message, variant: "destructive" as any }))
      .finally(() => setLoadingSecurity(false));
  }, [selected, toast]);

  const getPermissionNameForObject = (objectName: string, permissionKey: keyof ObjectPermission) => {
    const normalized = objectName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
    const map: Record<string, string> = {
      canCreate: `${normalized}_CREATE`,
      canRead: `${normalized}_READ`,
      canUpdate: `${normalized}_UPDATE`,
      canDelete: `${normalized}_DELETE`,
      viewAll: `${normalized}_VIEW_ALL`,
      modifyAll: `${normalized}_MODIFY_ALL`,
    };
    return map[permissionKey as string] || "";
  };

  const filterPermissionIdsForObjectPermissions = (permissions: any[], objectPermissions: ObjectPermission[], objects: any[]) => {
    const disabledPermissionNames = new Set<string>();
    for (const objectPermission of objectPermissions) {
      const object = objects.find((item) => item.id === objectPermission.objectId);
      if (!object) continue;
      const actionMap: Record<string, string> = {
        canCreate: getPermissionNameForObject(object.name, "canCreate"),
        canRead: getPermissionNameForObject(object.name, "canRead"),
        canUpdate: getPermissionNameForObject(object.name, "canUpdate"),
        canDelete: getPermissionNameForObject(object.name, "canDelete"),
        viewAll: getPermissionNameForObject(object.name, "viewAll"),
        modifyAll: getPermissionNameForObject(object.name, "modifyAll"),
      };
      for (const [key, permissionName] of Object.entries(actionMap)) {
        if (!permissionName) continue;
        if (!objectPermission[key as keyof ObjectPermission]) disabledPermissionNames.add(permissionName);
      }
    }

    return permissions.filter((permission) => !disabledPermissionNames.has(permission.name));
  };

  const updateObject = (objectId: string, patch: Partial<ObjectPermission>) => {
    setSecurity((current) => {
      if (!current) return current;
      const existing = current.objectPermissions.find((item) => item.objectId === objectId) || { objectId, canCreate: false, canRead: false, canUpdate: false, canDelete: false, viewAll: false, modifyAll: false };
      const next = { ...existing, ...patch };
      const filteredPermissions = filterPermissionIdsForObjectPermissions(current.permissions, [...current.objectPermissions.filter((item) => item.objectId !== objectId), next], current.objects);
      return { ...current, objectPermissions: [...current.objectPermissions.filter((item) => item.objectId !== objectId), next], permissions: filteredPermissions };
    });
  };

  const toggleSystemPermission = (permissionId: string) => {
    setSecurity((current) => {
      if (!current) return current;
      const exists = current.permissions.some((permission) => permission.id === permissionId);
      return { ...current, permissions: exists ? current.permissions.filter((permission) => permission.id !== permissionId) : [...current.permissions, allPermissions.find((permission) => permission.id === permissionId)].filter(Boolean) };
    });
  };

  const [allPermissions, setAllPermissions] = React.useState<any[]>([]);
  React.useEffect(() => { permissionApi.list({ limit: 500 }).then((response) => setAllPermissions(response.data.data || [])).catch(() => undefined); }, []);

  const save = async () => {
    if (!selected || !security) return;
    setSaving(true);
    try {
      const permissionIdsToKeep = filterPermissionIdsForObjectPermissions(security.permissions, security.objectPermissions, security.objects).map((permission) => permission.id);
      await profileSecurityApi.update(selected.id, {
        objectPermissions: security.objectPermissions,
        fieldPermissions: security.fieldPermissions,
        recordAccess: security.recordAccess,
        permissionIds: permissionIdsToKeep,
      });
      toast({ title: "Profile saved", description: `${selected.name} security settings were updated.` });
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.response?.data?.error || error.message, variant: "destructive" as any });
    } finally { setSaving(false); }
  };

  const createProfile = async () => {
    if (!createName.trim()) {
      toast({ title: "Profile name required", description: "Enter a profile name before creating it.", variant: "destructive" as any });
      return;
    }
    setCreating(true);
    try {
      const profileData = {
        name: createName.trim(),
        description: createDescription.trim(),
        ...(isSuperAdmin ? { isAdmin: createAdmin } : {}),
      };
      const response = await profileApi.create(profileData);
      const created = response.data.data;
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateAdmin(false);
      await loadProfiles();
      setSelected(created);
      setTab("overview");
      toast({ title: "Profile created", description: `${created.name} is now available in Setup Profiles.` });
    } catch (error: any) {
      toast({ title: "Unable to create profile", description: error?.response?.data?.error || error.message, variant: "destructive" as any });
    } finally { setCreating(false); }
  };

  const filteredProfiles = profiles.filter((profile) => `${profile.name} ${profile.description || ""}`.toLowerCase().includes(search.toLowerCase()));
  const systemPermissions = allPermissions.filter((permission) => ["SYSTEM", "USER", "ROLE", "PROFILE", "PERMISSION_SET", "REPORT", "DASHBOARD", "DATA"].includes(permission.module));

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><Link href="/setup" className="text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /></Link><div><p className="text-sm text-muted-foreground">Setup / Security Control</p><h1 className="text-xl font-semibold">Profiles</h1><p className="text-sm text-muted-foreground">Define the baseline access applied to users in your company.</p></div></div><Button onClick={() => setCreateOpen(true)}>Create Profile</Button></div>
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Profile list</CardTitle><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search profiles" value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardHeader><CardContent className="space-y-2">{loading ? <p className="text-sm text-muted-foreground">Loading profiles...</p> : filteredProfiles.map((profile) => <button key={profile.id} type="button" onClick={() => { setSelected(profile); setTab("overview"); }} className={`w-full rounded-md border p-3 text-left ${selected?.id === profile.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{profile.name}</span><span className="flex gap-1">{profile.isGlobal && <Badge variant="outline">Shared</Badge>}{profile.isAdmin && <Badge>Admin</Badge>}</span></div><p className="mt-1 text-xs text-muted-foreground">{profile.description || "No description"}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> {profile._count?.users || 0} users</p></button>)}</CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{selected?.name || "Select a profile"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selected?.description || "Choose a profile to configure its security model."}</p></div><Button onClick={save} disabled={!security || saving || (selected?.isGlobal && !isSuperAdmin)}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save profile"}</Button></div>{selected?.isGlobal && !isSuperAdmin && <p className="text-sm text-muted-foreground">Shared profile security settings are managed by Super Admin.</p>}<div className="flex flex-wrap gap-2 border-b pt-4">{["overview", "objects", "records", "system"].map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 px-3 py-2 text-sm capitalize ${tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{item === "objects" ? "Modules & Actions" : item === "records" ? "Record Access" : item === "system" ? "Reports, Dashboards & System" : item}</button>)}</div></CardHeader><CardContent>{loadingSecurity ? <p className="py-10 text-sm text-muted-foreground">Loading profile security...</p> : !security ? <p className="py-10 text-sm text-muted-foreground">Select a profile.</p> : <ProfileEditor tab={tab} security={security} modules={modules} systemPermissions={systemPermissions} updateObject={updateObject} toggleSystemPermission={toggleSystemPermission} setSecurity={setSecurity} />}</CardContent></Card>
    </div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create Setup Profile</DialogTitle></DialogHeader><div className="grid gap-4 py-3"><div><Label htmlFor="setup-profile-name">Profile name</Label><Input id="setup-profile-name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Sales Executive" /></div><div><Label htmlFor="setup-profile-description">Description</Label><Input id="setup-profile-description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="Own leads and site visits" /></div>{isSuperAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createAdmin} onChange={(event) => setCreateAdmin(event.target.checked)} /> Profile administrator</label>}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={createProfile} disabled={creating}>{creating ? "Creating..." : "Create Profile"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function ProfileEditor({ tab, security, modules, systemPermissions, updateObject, toggleSystemPermission, setSecurity }: { tab: string; security: SecurityData; modules: string[]; systemPermissions: any[]; updateObject: (id: string, patch: Partial<ObjectPermission>) => void; toggleSystemPermission: (id: string) => void; setSecurity: React.Dispatch<React.SetStateAction<SecurityData | null>> }) {
  if (tab === "overview") return <div className="grid gap-5 md:grid-cols-2"><Summary title="Object permissions" value={`${security.objectPermissions.length} configured`} /><Summary title="Field permissions" value={`${security.fieldPermissions.length} configured`} /><Summary title="Record access" value={`${Object.keys(security.recordAccess).length} modules scoped`} /><Summary title="System permissions" value={`${security.permissions.length} assigned`} /><div className="md:col-span-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">Profiles provide baseline access. Permission sets and direct permissions can add access for individual users without changing the profile.</div></div>;
  if (tab === "objects") return <div className="space-y-4">{security.objects.filter((object) => modules.includes(object.name) || modules.includes(object.label)).map((object) => { const permission = security.objectPermissions.find((item) => item.objectId === object.id) || { objectId: object.id, canCreate: false, canRead: false, canUpdate: false, canDelete: false, viewAll: false, modifyAll: false }; return <div key={object.id} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-medium">{object.label}</h3><p className="text-xs text-muted-foreground">{object.name}</p></div><span className="text-xs text-muted-foreground">{permission.modifyAll ? "Manage all" : permission.viewAll ? "View all" : "Scoped access"}</span></div><div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6">{[["Create", "canCreate"], ["Read", "canRead"], ["Edit", "canUpdate"], ["Delete", "canDelete"], ["View All", "viewAll"], ["Manage All", "modifyAll"]].map(([label, key]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(permission[key as keyof ObjectPermission])} onChange={(event) => updateObject(object.id, { [key]: event.target.checked })} />{label}</label>)}</div></div>; })}</div>;
  if (tab === "records") return <div className="space-y-3">{modules.map((module) => <div key={module} className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">{module}</p><p className="text-xs text-muted-foreground">Which records this profile can access</p></div><select value={security.recordAccess[module] || "OWN"} onChange={(event) => setSecurity((current) => current ? { ...current, recordAccess: { ...current.recordAccess, [module]: event.target.value as Scope } } : current)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="OWN">Own records</option><option value="TEAM">Team records</option><option value="ALL">All records</option></select></div>)}</div>;
  return <div className="space-y-4">{systemPermissions.map((permission) => <label key={permission.id} className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">{permission.label}</p><p className="text-xs text-muted-foreground">{permission.module} / {permission.action}</p></div><input type="checkbox" checked={security.permissions.some((item) => item.id === permission.id)} onChange={() => toggleSystemPermission(permission.id)} /></label>)}</div>;
}

function Summary({ title, value }: { title: string; value: string }) { return <div className="rounded-lg border p-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }