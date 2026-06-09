"use client";

import { useState, useCallback } from "react";
import {
  Pencil,
  Save,
  X,
  UserPlus,
  Trash2,
  Search,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUsers, type AdminUserRow } from "@/hooks/useUsers";
import type { UserRole } from "@/types/database";

/* ── Types ────────────────────────────────────────────────────────── */
type UserRow = AdminUserRow;

interface ClientOption {
  id: string;
  name: string;
}

interface UsersTableProps {
  users: UserRow[];
  clients: ClientOption[];
}

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  client_admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  va: "bg-zinc-700 text-zinc-300 border-zinc-600",
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "va", label: "VA" },
  { value: "client_admin", label: "Client Admin" },
  { value: "super_admin", label: "Super Admin" },
];

/* ── Main component ───────────────────────────────────────────────── */
export function UsersTable({
  users: initialUsers,
  clients,
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

  // Add user dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("va");
  const [newClientId, setNewClientId] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");

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

  /* ── Create user ───────────────────────────────────────────── */
  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await createUser({
          email: newEmail.trim(),
          full_name: newName.trim(),
          role: newRole,
          client_id: newClientId || null,
          ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
        });
        setAddOpen(false);
        setNewEmail("");
        setNewName("");
        setNewRole("va");
        setNewClientId("");
        setNewPassword("");
      } catch {
        // error toast handled by the mutation
      }
    },
    [createUser, newEmail, newName, newRole, newClientId, newPassword]
  );

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
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-white text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            New User
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-700">
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Full Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>
                  Password{" "}
                  <span className="text-zinc-600">(leave blank to auto-generate)</span>
                </Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Role</Label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Client</Label>
                  <select
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300"
                  >
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(false)}
                  className="border-zinc-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={addSaving || !newEmail.trim() || !newName.trim()}
                >
                  {addSaving ? "Creating…" : "Create User"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
                  Joined
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
                        u.email
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
                            ROLE_STYLES[u.role] ?? ROLE_STYLES.va
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

                    {/* Joined */}
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            title="Save changes"
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
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(u)}
                            title="Edit user"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            title="Delete user"
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
