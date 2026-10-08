"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Skeleton } from "@/components/ui/skeleton";

import { ScrollArea } from "@/components/ui/scroll-area";

import { userApi, profileApi, newPermissionSetApi, userPermissionApi, effectivePermissionApi, permissionApi } from "@/lib/api";

import { useToast } from "@/hooks/use-toast";

import {
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Search,
  Users,
  Shield,
  Check,
  X,
} from "lucide-react";

interface ProfileOption {
  id: string;
  name: string;
  isGlobal?: boolean;
}

interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileId: string | null;
  profile: { id: string; name: string } | null;
  roles: Array<{ role: { id: string; name: string } }>;
  isActive: boolean;
  status: "active" | "inactive";
  createdAt: string;
}

interface UserFormData {
  name: string;
  email: string;
  phone: string;
  profile: string;
  status: "active" | "inactive";
}

const emptyForm: UserFormData = {
  name: "",
  email: "",
  phone: "",
  profile: "",
  status: "active",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
};

export default function UsersPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = React.useState<User[]>([]);
  const [availableProfiles, setAvailableProfiles] = React.useState<ProfileOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const [formData, setFormData] = React.useState<UserFormData>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<User | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [viewTarget, setViewTarget] = React.useState<User | null>(null);

  const [permDialogOpen, setPermDialogOpen] = React.useState(false);
  const [permTarget, setPermTarget] = React.useState<User | null>(null);
  const [allPermissionSets, setAllPermissionSets] = React.useState<any[]>([]);
  const [userPermSets, setUserPermSets] = React.useState<any[]>([]);
  const [allPermissions, setAllPermissions] = React.useState<any[]>([]);
  const [userDirectPerms, setUserDirectPerms] = React.useState<any[]>([]);
  const [effectivePerms, setEffectivePerms] = React.useState<any>(null);
  const [permTab, setPermTab] = React.useState<"sets" | "direct" | "effective">("sets");
  const [permLoading, setPermLoading] = React.useState(false);

  const fetchUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await userApi.list();
      const raw = response.data;
      const data = Array.isArray(raw) ? raw : (raw as any)?.data ?? (raw as any)?.users ?? [];
      const mapped: User[] = data.map((u: any) => ({
        id: u.id,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        email: u.email || "",
        phone: u.phone || "",
        profileId: u.profileId || null,
        profile: u.profile || null,
        roles: u.roles || [],
        isActive: u.isActive ?? true,
        status: u.isActive ? "active" : "inactive",
        createdAt: u.createdAt,
      }));
      setUsers(mapped);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch users");
      toast({ title: "Error", description: "Failed to fetch users", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchUsers();
    profileApi.list({ limit: 200 }).then((res) => {
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (raw as any)?.data ?? (raw as any)?.profiles ?? [];
      setAvailableProfiles(data.map((p: any) => ({ id: p.id, name: p.name, isGlobal: p.isGlobal })));
    }).catch((err: any) => {
      toast({
        title: "Unable to load profiles",
        description: err?.response?.data?.error || err?.message || "Failed to fetch profiles",
        variant: "destructive" as any,
      });
    });
  }, [fetchUsers, toast]);

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelectedUser(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setDialogMode("edit");
    setSelectedUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      profile: user.profileId || "",
      status: user.status || "active",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.email) {
      toast({ title: "Validation", description: "Name and Email are required", variant: "destructive" as any });
      return;
    }
    try {
      setSaving(true);
      const nameParts = formData.name.split(" ");
      const firstName = nameParts[0] || formData.name;
      const lastName = nameParts.slice(1).join(" ") || "";

      if (dialogMode === "create") {
        await userApi.create({
          email: formData.email,
          firstName,
          lastName,
          phone: formData.phone || undefined,
          roleIds: [], // Will be assigned later
          profileId: formData.profile || undefined,
        });
        toast({ title: "Success", description: "User created successfully" });
      } else if (selectedUser) {
        await userApi.update(selectedUser.id, {
          firstName,
          lastName,
          phone: formData.phone || undefined,
          profileId: formData.profile || null,
        });
        toast({ title: "Success", description: "User updated successfully" });
      }
      setDialogOpen(false);
      setFormData(emptyForm);
      fetchUsers();
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
      await userApi.deactivate(deleteTarget.id);
      toast({ title: "Success", description: "User deleted successfully" });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Delete failed", variant: "destructive" as any });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      if (user.status === "active") {
        await userApi.deactivate(user.id);
        toast({ title: "Success", description: `${user.name} deactivated` });
      } else {
        await userApi.activate(user.id);
        toast({ title: "Success", description: `${user.name} activated` });
      }
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Status update failed", variant: "destructive" as any });
    }
  };

  const openPermDialog = async (user: User) => {
    setPermTarget(user);
    setPermDialogOpen(true);
    setPermTab("sets");
    setPermLoading(true);
    try {
      const [permissionSetsResponse, directPermissionsResponse, effectiveResponse, permissionsResponse] = await Promise.all([
        userPermissionApi.getUserPermissionSets(user.id),
        userPermissionApi.getDirectPermissions(user.id),
        effectivePermissionApi.getUserPermissions(user.id),
        permissionApi.list(),
      ]);

      const permissionSetAssignments = permissionSetsResponse?.data?.data || [];
      const directPermissions = directPermissionsResponse?.data?.data || [];

      setAllPermissionSets((await newPermissionSetApi.list({ limit: 100 }))?.data?.data || []);
      setUserPermSets(permissionSetAssignments.map((assignment: any) => assignment.permissionSet));
      setUserDirectPerms(directPermissions);
      setEffectivePerms(effectiveResponse?.data?.data || null);
      setAllPermissions(permissionsResponse?.data?.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || err?.message || "Failed to load permissions", variant: "destructive" as any });
    } finally {
      setPermLoading(false);
    }
  };

  const handleAssignPermSet = async (permSetId: string, assign: boolean) => {
    if (!permTarget) return;
    try {
      if (assign) {
        await userPermissionApi.assignPermissionSets(permTarget.id, [permSetId]);
        toast({ title: "Success", description: "Permission set assigned" });
      } else {
        await userPermissionApi.unassignPermissionSet(permTarget.id, permSetId);
        toast({ title: "Success", description: "Permission set unassigned" });
      }

      const [permissionSetsResponse, directPermissionsResponse, effectiveResponse] = await Promise.all([
        userPermissionApi.getUserPermissionSets(permTarget.id),
        userPermissionApi.getDirectPermissions(permTarget.id),
        effectivePermissionApi.getUserPermissions(permTarget.id),
      ]);

      setUserPermSets((permissionSetsResponse?.data?.data || []).map((assignment: any) => assignment.permissionSet));
      setUserDirectPerms(directPermissionsResponse?.data?.data || []);
      setEffectivePerms(effectiveResponse?.data?.data || null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || err?.message || "Operation failed", variant: "destructive" as any });
    }
  };

  const handleAddDirectPerm = async (permissionId: string) => {
    if (!permTarget) return;
    try {
      await userPermissionApi.addDirectPermissions(permTarget.id, [permissionId]);
      toast({ title: "Success", description: "Direct permission added" });
      const dpsRes = await userPermissionApi.getDirectPermissions(permTarget.id);
      const effRes = await effectivePermissionApi.getUserPermissions(permTarget.id);
      setUserDirectPerms(dpsRes.data.data || []);
      setEffectivePerms(effRes.data.data || null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" as any });
    }
  };

  const handleRemoveDirectPerm = async (permissionId: string) => {
    if (!permTarget) return;
    try {
      await userPermissionApi.removeDirectPermission(permTarget.id, permissionId);
      toast({ title: "Success", description: "Direct permission removed" });
      const dpsRes = await userPermissionApi.getDirectPermissions(permTarget.id);
      const effRes = await effectivePermissionApi.getUserPermissions(permTarget.id);
      setUserDirectPerms(dpsRes.data.data || []);
      setEffectivePerms(effRes.data.data || null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" as any });
    }
  };

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
            <h1 className="text-xl font-bold">Users</h1>
            <p className="text-muted-foreground">Manage system users</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchUsers} variant="outline">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage system users and their access</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-xl font-bold">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{users.filter((u) => u.status === "active").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <UserX className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-xl font-bold">{users.filter((u) => u.status === "inactive").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Users</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No users match your search" : "No users found"}
              </p>
              {!searchQuery && (
                <Button onClick={openCreateDialog} className="mt-4" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first user
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="w-[70px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.profile?.name || "-"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[user.status] || statusColors.active}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.createdAt ? formatDate(user.createdAt) : "-"}
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
                                setViewTarget(user);
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPermDialog(user)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Manage Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                              {user.status === "active" ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setDeleteTarget(user);
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

      {/* View User Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{viewTarget.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewTarget.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{viewTarget.phone || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Profile</Label>
                  <p className="font-medium">
                    <Badge variant="outline">{viewTarget.profile?.name || "-"}</Badge>
                  </p>
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
                  <Label className="text-muted-foreground">Created Date</Label>
                  <p className="font-medium">
                    {viewTarget.createdAt ? formatDateTime(viewTarget.createdAt) : "-"}
                  </p>
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

      {/* Create / Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Create User" : "Edit User"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Add a new user to the system."
                : "Update user information."}
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
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Profile</Label>
                <Select
                  value={formData.profile}
                  onValueChange={(value) => setFormData((f) => ({ ...f, profile: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}{profile.isGlobal ? " (Shared)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "active" | "inactive") =>
                    setFormData((f) => ({ ...f, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : dialogMode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the user account for{" "}
              <strong>{deleteTarget?.name}</strong>. This action can be reversed by
              activating the user again.
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

      {/* Manage Permissions Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(90vw,48rem)] max-w-3xl flex-col overflow-hidden p-5">
          <DialogHeader className="shrink-0">
            <DialogTitle>Manage Permissions - {permTarget?.name}</DialogTitle>
            <DialogDescription>
              Profile: {permTarget?.profile?.name || "None"} | Assign permission sets and direct permissions
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 gap-2 border-b pb-2">
            <Button variant={permTab === "sets" ? "default" : "ghost"} size="sm" onClick={() => setPermTab("sets")}>
              Permission Sets
            </Button>
            <Button variant={permTab === "direct" ? "default" : "ghost"} size="sm" onClick={() => setPermTab("direct")}>
              Direct Permissions
            </Button>
            <Button variant={permTab === "effective" ? "default" : "ghost"} size="sm" onClick={() => setPermTab("effective")}>
              Effective Permissions
            </Button>
          </div>

          {permLoading ? (
            <div className="flex flex-1 items-center justify-center py-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : permTab === "sets" ? (
            <div className="h-[420px] overflow-y-auto pr-2">
              <div className="space-y-3 py-2">
                {allPermissionSets.map((ps) => {
                  const isAssigned = userPermSets.some((ups) => ups.id === ps.id);
                  return (
                    <div key={ps.id} className="flex items-center justify-between p-3 rounded-md border">
                      <div>
                        <p className="font-medium">{ps.name}</p>
                        <p className="text-sm text-muted-foreground">{ps.description || `${ps.items?.length || 0} permissions`}</p>
                      </div>
                      <Button
                        variant={isAssigned ? "destructive" : "default"}
                        size="sm"
                        onClick={() => handleAssignPermSet(ps.id, !isAssigned)}
                      >
                        {isAssigned ? "Remove" : "Assign"}
                      </Button>
                    </div>
                  );
                })}
                {allPermissionSets.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No permission sets available</p>
                )}
              </div>
            </div>
          ) : permTab === "direct" ? (
            <div className="h-[420px] overflow-y-auto pr-2">
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-sm font-medium mb-2">Currently Assigned ({userDirectPerms.length})</p>
                  {userDirectPerms.length > 0 ? (
                    <div className="space-y-1">
                      {userDirectPerms.map((dp: any) => (
                        <div key={dp.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                          <div>
                            <Badge variant="outline" className="mr-2">{dp.permission.module}</Badge>
                            {dp.permission.label}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveDirectPerm(dp.permission.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No direct permissions assigned</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Available Permissions</p>
                  <div className="space-y-3">
                    {Object.entries(allPermissions.reduce((acc: Record<string, any[]>, p: any) => {
                      if (!acc[p.module]) acc[p.module] = [];
                      acc[p.module].push(p);
                      return acc;
                    }, {})).map(([module, perms]) => (
                      <div key={module}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{module}</p>
                        <div className="flex flex-wrap gap-1">
                          {perms.map((p: any) => {
                            const isAssigned = userDirectPerms.some((dp: any) => dp.permission.id === p.id);
                            return (
                              <Button
                                key={p.id}
                                variant={isAssigned ? "secondary" : "outline"}
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => isAssigned ? handleRemoveDirectPerm(p.id) : handleAddDirectPerm(p.id)}
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
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[420px] overflow-y-auto pr-2">
              <div className="space-y-4 py-2">
                {effectivePerms && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-3 rounded-md border text-center">
                        <p className="text-xl font-bold">{effectivePerms.total}</p>
                        <p className="text-xs text-muted-foreground">Total Permissions</p>
                      </div>
                      <div className="p-3 rounded-md border text-center">
                        <p className="text-xl font-bold">{effectivePerms.sources?.profile?.length || 0}</p>
                        <p className="text-xs text-muted-foreground">From Profile</p>
                      </div>
                      <div className="p-3 rounded-md border text-center">
                        <p className="text-xl font-bold">{effectivePerms.sources?.permissionSets?.length || 0}</p>
                        <p className="text-xs text-muted-foreground">From Perm Sets</p>
                      </div>
                    </div>
                    {effectivePerms.hasFullAccess && (
                      <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
                        Full System Access
                      </div>
                    )}
                    {Object.entries(effectivePerms.byModule || {}).map(([module, perms]: [string, any]) => (
                      <div key={module}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{module}</p>
                        <div className="flex flex-wrap gap-1">
                          {(perms as any[]).map((p: any) => (
                            <Badge key={p.name} variant="outline" className="text-xs">
                              {p.name}
                              <span className="ml-1 text-muted-foreground">({p.source === 'PROFILE' ? 'Profile' : p.source === 'PERMISSION_SET' ? p.sourceName : p.source === 'DIRECT' ? 'Direct' : 'Role'})</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}