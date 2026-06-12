"use client";

import { useState, useCallback } from "react";
import {
  Pencil,
  Save,
  X,
  Trash2,
  Search,
  RefreshCw,
  LogIn,
  Ban,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Input } from "@/components/ui/input";
import { useUsers, type AdminUserRow } from "@/hooks/useUsers";
import { ROLES, ROLE_OPTIONS, type UserRole } from "@/lib/taxonomy/roles";
import { CreateUserDialog } from "./users/CreateUserDialog";

/* ── Types ────────────────────────────────────────────────────────── */
type UserRow = AdminUserRow;

interface ClientOption {
  id: string;
  name: string;
}

interface UsersTableProps {
  users: UserRow[];
  clients: ClientOption[];
  currentUserId: string;
  lastActive: Record<string, string | null>;
  suspendedInit: Record<string, boolean>;
}

/* ── Main component ───────────────────────────────────────────────── */
export function UsersTable({
  users: initialUsers,
  clients,
  currentUserId,
  lastActive,
  suspendedInit,
}: UsersTableProps) {
  const {
    users,
    createUser,
    isCreating: addSaving,
    updateUser,
    isUpdating: saving,
    quickUpdateUser,
    deleteUser,
  } = useUsers(initialUsers);
  const [search, setSearch] = useState("");

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    email: string;
    full_name: string;
    role: UserRole;
    client_id: string | null;
  }>({ email: "", full_name: "", role: "va", client_id: null });

  const clientMap: Record<string, string> = {};
  for (const c of clients) clientMap[c.id] = c.name;

  /* ── Inline edit ────────────────────────────────────────────── */
  const startEdit = useCallback((u: UserRow) => {
    setEditingId(u.id);
    setEditFields({
      email: u.email,
      full_name: u.full_name ?? "",
      role: u.role,
      client_id: u.client_id,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const original = users.find((u) => u.id === editingId);
    if (!original) return;
    const updates: Parameters<typeof updateUser>[0] = { id: editingId };

    if (editFields.email !== original.email) updates.email = editFields.email;
    if (editFields.full_name !== (original.full_name ?? ""))
      updates.full_name = editFields.full_name || null;
    if (editFields.role !== original.role) updates.role = editFields.role;
    if (editFields.client_id !== original.client_id)
      updates.client_id = editFields.client_id;

    if (Object.keys(updates).length <= 1) {
      setEditingId(null);
      return;
    }

    try {
      await updateUser(updates);
      setEditingId(null);
    } catch {
      // error toast handled by the mutation
    }
  }, [editingId, editFields, users, updateUser]);

  /* ── Quick role change (non-edit mode) ─────────────────────── */
  const handleQuickRoleChange = useCallback(
    async (userId: string, role: UserRole) => {
      try {
        await quickUpdateUser({
          input: { id: userId, role },
          successMessage: "Role updated",
        });
      } catch {
        // error toast handled by the mutation
      }
    },
    [quickUpdateUser]
  );

  /* ── Quick client change (non-edit mode) ───────────────────── */
  const handleQuickClientChange = useCallback(
    async (userId: string, clientId: string | null) => {
      try {
        await quickUpdateUser({
          input: { id: userId, client_id: clientId },
          successMessage: "Client updated",
        });
      } catch {
        // error toast handled by the mutation
      }
    },
    [quickUpdateUser]
  );

  /* ── Delete user ───────────────────────────────────────────── */
  const handleDelete = useCallback(
    async (userId: string) => {
      if (!confirm("Delete this user permanently? This cannot be undone.")) return;
      try {
        await deleteUser({ id: userId });
      } catch {
        // error toast handled by the mutation
      }
    },
    [deleteUser]
  );

  /* ── Suspend / reinstate ───────────────────────────────────── */
  const [suspended, setSuspended] = useState<Record<string, boolean>>(suspendedInit);
  const [suspendBusy, setSuspendBusy] = useState<string | null>(null);
  const toggleSuspend = useCallback(async (u: UserRow) => {
    const next = !suspended[u.id];
    const verb = next ? "Suspend" : "Reinstate";
    if (!confirm(`${verb} ${u.full_name ?? u.email}? ${next ? "They won't be able to sign in until reinstated. Their data is kept." : "They'll be able to sign in again."}`)) return;
    setSuspendBusy(u.id);
    try {
      await api.post(ROUTES.admin.usersSuspend(), { id: u.id, suspend: next });
      setSuspended((p) => ({ ...p, [u.id]: next }));
      toast.success(next ? "User suspended." : "User reinstated.");
    } catch { /* api-client toasts */ } finally {
      setSuspendBusy(null);
    }
  }, [suspended]);

  /* ── One-time login link ───────────────────────────────────── */
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const copyLoginLink = useCallback(async (u: UserRow) => {
    setLinkBusy(u.id);
    try {
      const { link } = await api.post<{ link: string }>(ROUTES.admin.usersLoginLink(), { id: u.id });
      await navigator.clipboard.writeText(link);
      toast.success("One-time login link copied — send it to the user; it signs them straight in.");
    } catch { /* api-client toasts */ } finally {
      setLinkBusy(null);
    }
  }, []);

  const relTime = (iso: string | null | undefined) => {
    if (!iso) return "never";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  /* ── Login as (impersonate) ────────────────────────────────── */
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const handleImpersonate = useCallback(async (u: UserRow) => {
    if (!confirm(`Log in as ${u.full_name ?? u.email}? You'll see the app exactly as they do, with a banner to switch back.`)) return;
    setImpersonatingId(u.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start impersonation.");
      }
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start impersonation.");
      setImpersonatingId(null);
    }
  }, []);

  /* ── Filter ────────────────────────────────────────────────── */
  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.full_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
          u.role.toLowerCase().includes(search.toLowerCase()) ||
          (u.client_id && clientMap[u.client_id]?.toLowerCase().includes(search.toLowerCase()))
      )
    : users;

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-700"
          />
        </div>
        <CreateUserDialog clients={clients} isCreating={addSaving} onCreate={createUser} />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">
            {search ? `No users matching "${search}"` : "No users yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Client
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Last active
                </th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isEditing = editingId === u.id;

                return (
                  <tr
                    key={u.id}
                    className={`border-b border-zinc-800 last:border-0 ${
                      isEditing ? "bg-zinc-800/50" : "hover:bg-zinc-900/50"
                    }`}
                  >
                    {/* Email */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <Input
                          value={editFields.email}
                          onChange={(e) =>
                            setEditFields((f) => ({
                              ...f,
                              email: e.target.value,
                            }))
                          }
                          className="h-7 text-sm bg-zinc-900 border-zinc-700"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {u.email}
                          {suspended[u.id] && (
                            <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 rounded-full px-2 py-0.5">
                              Suspended
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 text-zinc-400">
                      {isEditing ? (
                        <Input
                          value={editFields.full_name}
                          onChange={(e) =>
                            setEditFields((f) => ({
                              ...f,
                              full_name: e.target.value,
                            }))
                          }
                          className="h-7 text-sm bg-zinc-900 border-zinc-700"
                        />
                      ) : (
                        u.full_name ?? "—"
                      )}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editFields.role}
                          onChange={(e) =>
                            setEditFields((f) => ({
                              ...f,
                              role: e.target.value as UserRole,
                            }))
                          }
                          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 h-7 text-xs text-zinc-300"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleQuickRoleChange(
                              u.id,
                              e.target.value as UserRole
                            )
                          }
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-transparent cursor-pointer ${
                            ROLES[u.role]?.badgeClass ?? ROLES.va.badgeClass
                          }`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3 text-zinc-400">
                      {isEditing ? (
                        <select
                          value={editFields.client_id ?? ""}
                          onChange={(e) =>
                            setEditFields((f) => ({
                              ...f,
                              client_id: e.target.value || null,
                            }))
                          }
                          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 h-7 text-xs text-zinc-300"
                        >
                          <option value="">No client</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={u.client_id ?? ""}
                          onChange={(e) =>
                            handleQuickClientChange(
                              u.id,
                              e.target.value || null
                            )
                          }
                          className="bg-transparent border-0 text-xs text-zinc-400 cursor-pointer hover:text-white px-0"
                        >
                          <option value="">— None —</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Last active (joined date on hover) */}
                    <td className="px-4 py-3 text-zinc-500" title={`Joined ${new Date(u.created_at).toLocaleDateString()}`}>
                      {relTime(lastActive[u.id])}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            title="Save changes"
                            aria-label="Save changes"
                            className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40"
                          >
                            {saving ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={cancelEdit}
                            title="Cancel"
                            aria-label="Cancel editing"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {u.id !== currentUserId && (
                            <button
                              onClick={() => handleImpersonate(u)}
                              disabled={impersonatingId === u.id}
                              title="Log in as this user"
                              aria-label={`Log in as ${u.full_name ?? u.email}`}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                            >
                              {impersonatingId === u.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <LogIn className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => copyLoginLink(u)}
                            disabled={linkBusy === u.id}
                            title="Copy one-time login link (for onboarding — signs them straight in)"
                            aria-label="Copy one-time login link"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                          >
                            {linkBusy === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                          </button>
                          {u.id !== currentUserId && (
                            <button
                              onClick={() => toggleSuspend(u)}
                              disabled={suspendBusy === u.id}
                              title={suspended[u.id] ? "Reinstate user" : "Suspend user (keeps data, blocks sign-in)"}
                              aria-label={suspended[u.id] ? "Reinstate user" : "Suspend user"}
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                suspended[u.id]
                                  ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                                  : "text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10"
                              }`}
                            >
                              {suspendBusy === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            onClick={() => startEdit(u)}
                            title="Edit user"
                            aria-label="Edit user"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            title="Delete user"
                            aria-label="Delete user"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        {users.length} user{users.length !== 1 ? "s" : ""} total
      </p>
    </div>
  );
}
