"use client";

import * as React from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

type CPAccount = {
  id: string;
  name: string;
  username: string;
  email: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AccountForm = {
  name: string;
  username: string;
  email: string;
  password: string;
};

const emptyForm: AccountForm = { name: "", username: "", email: "", password: "" };

async function callApi<T>(method: string, body?: unknown, id?: string): Promise<T> {
  const response = await fetch(`/api/proxy/api/cp-portal-accounts${id ? `/${encodeURIComponent(id)}` : ""}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok || result.success === false) {
    throw new Error(result.error || "CP Portal account request failed");
  }
  return result.data as T;
}

export default function CPPortalAccountsPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<CPAccount[]>([]);
  const [form, setForm] = React.useState<AccountForm>(emptyForm);
  const [selected, setSelected] = React.useState<CPAccount | null>(null);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await callApi<{ accounts: CPAccount[] }>("GET");
      setAccounts(result.accounts);
    } catch (error) {
      toast({
        title: "Unable to load CP Portal accounts",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((account) =>
      `${account.name} ${account.username} ${account.email}`
        .toLowerCase()
        .includes(term),
    );
  }, [accounts, search]);

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (account: CPAccount) => {
    setSelected(account);
    setForm({ name: account.name, username: account.username, email: account.email, password: "" });
    setDialogOpen(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (selected) {
        await callApi("PUT", {
          name: form.name,
          username: form.username,
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
        }, selected.id);
      } else {
        await callApi("POST", form);
      }
      toast({
        title: selected ? "CP Portal account updated" : "CP Portal account created",
        description: "The CP can now use the account credentials.",
      });
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast({
        title: "Unable to save CP Portal account",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: CPAccount) => {
    try {
      await callApi("PUT", { isActive: !account.isActive }, account.id);
      await load();
    } catch (error) {
      toast({
        title: "Unable to update account status",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    }
  };

  const deleteAccount = async (account: CPAccount) => {
    const confirmed = window.confirm(
      `Delete the CP Portal account for ${account.name} (${account.email})? This immediately revokes portal access. CRM leads and notes will be retained, but will no longer be associated with this CP account.`,
    );
    if (!confirmed) return;

    setDeletingId(account.id);
    try {
      await callApi("DELETE", undefined, account.id);
      toast({ title: "CP Portal account deleted", description: `${account.name} can no longer sign in.` });
      await load();
    } catch (error) {
      toast({
        title: "Unable to delete CP Portal account",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAdmin && !isSuperAdmin) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Administrator access is required to manage CP Portal accounts.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>CP Portal Accounts</h1>
          <p className="mt-1 text-muted-foreground">Manage portal sign-in details for Channel Partners in this CRM.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create CP Account
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> CP Portal object records</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Channel Partner</th>
                  <th className="px-3 py-3 font-medium">UserName</th>
                  <th className="px-3 py-3 font-medium">Password</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((account) => (
                    <tr key={account.id} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{account.name}</td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          aria-label={`Edit CP Portal account for ${account.username}`}
                          onClick={() => openEdit(account)}
                        >
                          {account.username}
                        </Button>
                      </td>
                      <td className="px-3 py-3 font-mono tracking-widest" aria-label="Password is securely stored and cannot be viewed">••••••••</td>
                      <td className="px-3 py-3">{account.email}</td>
                      <td className="px-3 py-3">{account.category}</td>
                      <td className="px-3 py-3"><Badge variant={account.isActive ? "default" : "secondary"}>{account.isActive ? "Active" : "Disabled"}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(account)}>Edit / Reset</Button>
                          <Button size="icon" variant="ghost" title={account.isActive ? "Disable account" : "Enable account"} onClick={() => void toggleActive(account)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete CP Portal account"
                            aria-label={`Delete CP Portal account for ${account.name}`}
                            disabled={deletingId === account.id}
                            onClick={() => void deleteAccount(account)}
                          >
                            {deletingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{accounts.length ? "No accounts match your search." : "No CP Portal accounts have been created yet."}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-lg border bg-background p-5 shadow-xl">
            <div><h2 className="text-base font-semibold">{selected ? "Edit CP Portal account" : "Create CP Portal account"}</h2><p className="mt-1 text-xs text-muted-foreground">Passwords are securely hashed and cannot be viewed after saving.</p></div>
            <p className="text-xs text-muted-foreground">This portal account is independent of CRM user credentials.</p>
            <div className="space-y-2"><Label htmlFor="cp-name">Channel Partner Name</Label><Input id="cp-name" autoComplete="organization" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={200} /></div>
            <div className="space-y-2"><Label htmlFor="cp-username">Username</Label><Input id="cp-username" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required maxLength={254} /></div>
            <div className="space-y-2"><Label htmlFor="cp-email">Email</Label><Input id="cp-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="cp-password">{selected ? "Set a new password (optional)" : "Password"}</Label><Input id="cp-password" type="password" autoComplete={selected ? "new-password" : "new-password"} minLength={8} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!selected} placeholder={selected ? "Leave empty to keep current password" : "At least 8 characters"} /></div>
            <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : selected ? "Save Changes" : "Create Account"}</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}
