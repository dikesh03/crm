"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { profileApi, profilePermissionApi, permissionApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Shield,
  Search,
  Check,
} from "lucide-react";

const LEAD_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "INCOMING", label: "Incoming" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "SITE_VISIT_SCHEDULED", label: "Site Visit Scheduled" },
  { value: "SITE_VISIT_HAPPENED", label: "Site Visit Happened" },
  { value: "SALES", label: "Sales" },
  { value: "OPPORTUNITY", label: "Opportunity" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "APPROVAL", label: "Approval" },
  { value: "BOOKING", label: "Booking" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "LOST", label: "Lost" },
  { value: "BOOKED", label: "Booked" },
] as const;

interface Profile {
  id: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  usersCount?: number;
  status: "active" | "inactive";
  leadStatusAccess?: string[];
}

interface ProfileFormData {
  name: string;
  description: string;
  leadStatusAccess: string[];
  status: "active" | "inactive";
}

const emptyForm: ProfileFormData = {
  name: "",
  description: "",
  leadStatusAccess: [],
  status: "active",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
};

function ProfilesPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [selectedProfile, setSelectedProfile] = React.useState<Profile | null>(null);
  const [formData, setFormData] = React.useState<ProfileFormData>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Profile | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [viewTarget, setViewTarget] = React.useState<Profile | null>(null);

  const [permDialogOpen, setPermDialogOpen] = React.useState(false);
  const [permTarget, setPermTarget] = React.useState<Profile | null>(null);
  const [allPermissions, setAllPermissions] = React.useState<any[]>([]);
  const [profilePerms, setProfilePerms] = React.useState<any[]>([]);
  const [permLoading, setPermLoading] = React.useState(false);

  const fetchProfiles = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await profileApi.list({ limit: 100 });
      const data = response.data;
      const profileData = Array.isArray(data) ? data : (data as any)?.data ?? (data as any)?.profiles ?? [];
      setProfiles(profileData.map((profile: any) => ({
        ...profile,
        usersCount: profile._count?.users ?? 0,
        status: profile.status ?? (profile.isActive === false ? "inactive" : "active"),
      })));
    } catch (err: any) {
      setError(err?.message || "Failed to fetch profiles");
      toast({ title: "Error", description: "Failed to fetch profiles", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  React.useEffect(() => {
    const profileName = searchParams.get("profile");
    if (!profileName || profiles.length === 0) return;

    const matchedProfile = profiles.find((profile) => profile.name === profileName);
    if (matchedProfile) {
      openEditDialog(matchedProfile);
    }
  }, [searchParams, profiles]);

  const filteredProfiles = React.useMemo(() => {
    if (!searchQuery) return profiles;
    const q = searchQuery.toLowerCase();
    return profiles.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [profiles, searchQuery]);

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelectedProfile(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (profile: Profile) => {
    setDialogMode("edit");
    setSelectedProfile(profile);
    setFormData({
      name: profile.name || "",
      description: profile.description || "",
      leadStatusAccess: profile.leadStatusAccess || [],
      status: profile.status || "active",
    });
    setDialogOpen(true);
  };

  const toggleLeadStatus = (value: string) => {
    setFormData((f) => ({
      ...f,
      leadStatusAccess: f.leadStatusAccess.includes(value)
        ? f.leadStatusAccess.filter((s) => s !== value)
        : [...f.leadStatusAccess, value],
    }));
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: "Validation", description: "Name is required", variant: "destructive" as any });
      return;
    }
    try {
      setSaving(true);
      if (dialogMode === "create") {
        await profileApi.create(formData);
        toast({ title: "Success", description: "Profile created successfully" });
      } else if (selectedProfile) {
        await profileApi.update(selectedProfile.id, formData);
        toast({ title: "Success", description: "Profile updated successfully" });
      }
      setDialogOpen(false);
      setFormData(emptyForm);
      fetchProfiles();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await profileApi.delete(deleteTarget.id);
      toast({ title: "Success", description: "Profile deleted successfully" });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      fetchProfiles();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Delete failed", variant: "destructive" as any });
    } finally {
      setDeleting(false);
    }
  };

  const openPermDialog = async (profile: Profile) => {
    setPermTarget(profile);
    setPermDialogOpen(true);
    setPermLoading(true);
    try {
      const [allPermsRes, profilePermsRes] = await Promise.all([
        permissionApi.list(),
        profilePermissionApi.getPermissions(profile.id),
      ]);
      setAllPermissions(allPermsRes.data.data || []);
      setProfilePerms((profilePermsRes.data.data || []).map((pp: any) => pp.permission));
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to load permissions", variant: "destructive" as any });
    } finally {
      setPermLoading(false);
    }
  };

  const handleToggleProfilePerm = async (permissionId: string) => {
    if (!permTarget) return;
    const isAssigned = profilePerms.some((p) => p.id === permissionId);
    try {
      if (isAssigned) {
        await profilePermissionApi.removePermission(permTarget.id, permissionId);
        setProfilePerms((prev) => prev.filter((p) => p.id !== permissionId));
        toast({ title: "Success", description: "Permission removed from profile" });
      } else {
        await profilePermissionApi.addPermissions(permTarget.id, [permissionId]);
        const perm = allPermissions.find((p) => p.id === permissionId);
        if (perm) setProfilePerms((prev) => [...prev, perm]);
        toast({ title: "Success", description: "Permission added to profile" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" as any });
    }
  };

  const getStatusLabel = (value: string) =>
    LEAD_STATUSES.find((s) => s.value === value)?.label || value;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Profiles</h1>
            <p className="text-muted-foreground">Manage CRM profiles and their permissions</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchProfiles} variant="outline">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Profiles</h1>
          <p className="text-muted-foreground">Manage CRM profiles and their lead status access</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create Profile
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Profiles</p>
                <p className="text-xl font-bold">{profiles.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{profiles.filter((p) => p.status === "active").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Shield className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-xl font-bold">{profiles.filter((p) => p.status === "inactive").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Profiles</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search profiles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No profiles match your search" : "No profiles found"}
              </p>
              {!searchQuery && (
                <Button onClick={openCreateDialog} className="mt-4" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first profile
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Users Count</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[70px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        {profile.name}
                        {profile.isGlobal && <Badge variant="outline" className="ml-2">Shared</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {profile.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{profile.usersCount ?? 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[profile.status] || statusColors.active}>
                          {profile.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setViewTarget(profile);
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(profile)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPermDialog(profile)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Manage Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setDeleteTarget(profile);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Profile Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile Details</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{viewTarget.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="font-medium">{viewTarget.description || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Users Count</Label>
                  <p className="font-medium">{viewTarget.usersCount ?? 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">
                    <Badge className={statusColors[viewTarget.status] || statusColors.active}>
                      {viewTarget.status}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Lead Status Access</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewTarget.leadStatusAccess && viewTarget.leadStatusAccess.length > 0 ? (
                      viewTarget.leadStatusAccess.map((status) => (
                        <Badge key={status} variant="outline" className="text-xs">
                          {getStatusLabel(status)}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No access configured</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Create Profile" : "Edit Profile"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Add a new profile to the system."
                : "Update profile information and permissions."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Enter profile name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Enter description"
                />
              </div>
              <div className="space-y-2">
                <Label>Lead Status Access</Label>
                <ScrollArea className="h-48 rounded-md border p-3">
                  <div className="space-y-2">
                    {LEAD_STATUSES.map((status) => (
                      <div key={status.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={status.value}
                          checked={formData.leadStatusAccess.includes(status.value)}
                          onCheckedChange={() => toggleLeadStatus(status.value)}
                        />
                        <Label htmlFor={status.value} className="text-sm font-normal cursor-pointer">
                          {status.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {formData.leadStatusAccess.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formData.leadStatusAccess.length} status(es) selected
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="status"
                    checked={formData.status === "active"}
                    onCheckedChange={(checked: boolean) =>
                      setFormData((f) => ({ ...f, status: checked ? "active" : "inactive" }))
                    }
                  />
                  <Label htmlFor="status" className="text-sm font-normal">
                    {formData.status === "active" ? "Active" : "Inactive"}
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : dialogMode === "create" ? "Create" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the profile{" "}
              <strong>{deleteTarget?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Permissions Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Permissions - {permTarget?.name}</DialogTitle>
            <DialogDescription>
              Configure base permissions for this profile. These are the base permissions that all users with this profile inherit.
            </DialogDescription>
          </DialogHeader>

          {permLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 max-h-[60vh]">
              <div className="space-y-4 py-2">
                <div className="p-3 rounded bg-muted/50 text-sm">
                  <strong>{profilePerms.length}</strong> permissions assigned to this profile
                </div>
                {Object.entries(
                  allPermissions.reduce((acc: Record<string, any[]>, p: any) => {
                    if (!acc[p.module]) acc[p.module] = [];
                    acc[p.module].push(p);
                    return acc;
                  }, {})
                ).map(([module, perms]) => (
                  <div key={module}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{module}</p>
                    <div className="flex flex-wrap gap-1">
                      {perms.map((p: any) => {
                        const isAssigned = profilePerms.some((pp) => pp.id === p.id);
                        return (
                          <Button
                            key={p.id}
                            variant={isAssigned ? "default" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleToggleProfilePerm(p.id)}
                          >
                            {isAssigned && <Check className="h-3 w-3 mr-1" />}
                            {p.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading profiles...</div>}>
      <ProfilesPageContent />
    </React.Suspense>
  );
}
