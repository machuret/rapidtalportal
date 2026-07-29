"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Pencil,
  Save,
  X,
  UserPlus,
  Trash2,
  Users,
  Building2,
  ArrowLeftRight,
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
import { toast } from "sonner";
import { useUpdateClient, type ClientInfo } from "@/hooks/useClients";
import {
  useCreateClientUser,
  useUpdateClientUser,
  useDeleteClientUser,
  type ClientUserRow,
} from "@/hooks/useUsers";
import { ROLES, ROLE_OPTIONS, type UserRole } from "@/lib/taxonomy/roles";
import { formatDate } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────── */
type ClientUser = ClientUserRow;

interface UnassignedVa {
  id: string;
  email: string;
  full_name: string | null;
}

interface ClientDetailProps {
  client: ClientInfo;
  users: ClientUser[];
  unassignedVas: UnassignedVa[];
}


/* ── Main component ───────────────────────────────────────────────── */
export function ClientDetail({
  client: initialClient,
  users: initialUsers,
  unassignedVas: initialUnassigned,
}: ClientDetailProps) {
  const [client, setClient] = useState(initialClient);
  const [users, setUsers] = useState(initialUsers);
  const [unassigned, setUnassigned] = useState(initialUnassigned);

  // Mutations
  const updateClientMutation = useUpdateClient();
  const createUserMutation = useCreateClientUser();
  const updateUserMutation = useUpdateClientUser();
  const deleteUserMutation = useDeleteClientUser();
  const savingClient = updateClientMutation.isPending;
  const addingSaving = createUserMutation.isPending;

  // Client edit state
  const [editingClient, setEditingClient] = useState(false);
  const [editName, setEditName] = useState(client.name);
  const [editSlug, setEditSlug] = useState(client.slug);

  // Add user dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("va");
  const [newPassword, setNewPassword] = useState("");

  // Allocate VA dialog
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selectedVaId, setSelectedVaId] = useState("");
  const [allocating, setAllocating] = useState(false);

  /* ── Client edit ──────────────────────────────────────────────── */
  const handleSaveClient = useCallback(async () => {
    try {
      const updated = await updateClientMutation.mutateAsync({
        id: client.id,
        name: editName.trim(),
        slug: editSlug.trim(),
      });
      setClient(updated);
      setEditingClient(false);
      toast.success("Client updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update client");
    }
  }, [updateClientMutation, client.id, editName, editSlug]);

  const handleCancelEdit = useCallback(() => {
    setEditName(client.name);
    setEditSlug(client.slug);
    setEditingClient(false);
  }, [client]);

  /* ── Create new user ──────────────────────────────────────────── */
  const handleCreateUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const user = await createUserMutation.mutateAsync({
          email: newEmail.trim(),
          full_name: newName.trim(),
          role: newRole,
          client_id: client.id,
          ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
        });
        setUsers((prev) => [...prev, user]);
        setAddOpen(false);
        setNewEmail("");
        setNewName("");
        setNewRole("va");
        setNewPassword("");
        toast.success(`User "${user.full_name}" created`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create user");
      }
    },
    [createUserMutation, client.id, newEmail, newName, newRole, newPassword]
  );

  /* ── Allocate existing VA ─────────────────────────────────────── */
  const handleAllocateVa = useCallback(async () => {
    if (!selectedVaId) return;
    setAllocating(true);
    try {
      const updated = await updateUserMutation.mutateAsync({
        id: selectedVaId,
        client_id: client.id,
      });
      setUsers((prev) => [...prev, updated]);
      setUnassigned((prev) => prev.filter((v) => v.id !== selectedVaId));
      setSelectedVaId("");
      setAllocateOpen(false);
      toast.success(`VA allocated to ${client.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to allocate VA");
    } finally {
      setAllocating(false);
    }
  }, [updateUserMutation, selectedVaId, client.id, client.name]);

  /* ── Update user role ─────────────────────────────────────────── */
  const handleRoleChange = useCallback(
    async (userId: string, role: UserRole) => {
      try {
        await updateUserMutation.mutateAsync({ id: userId, role });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
        toast.success("Role updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update role");
      }
    },
    [updateUserMutation]
  );

  /* ── Remove user from client ──────────────────────────────────── */
  const handleRemoveFromClient = useCallback(
    async (userId: string) => {
      try {
        await updateUserMutation.mutateAsync({ id: userId, client_id: null });
        const removed = users.find((u) => u.id === userId);
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        if (removed) {
          setUnassigned((prev) => [
            ...prev,
            { id: removed.id, email: removed.email, full_name: removed.full_name },
          ]);
        }
        toast.success("User removed from client");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove user");
      }
    },
    [updateUserMutation, users]
  );

  /* ── Delete user entirely ─────────────────────────────────────── */
  const handleDeleteUser = useCallback(
    async (userId: string) => {
      if (!confirm("Delete this user permanently? This cannot be undone.")) return;
      try {
        await deleteUserMutation.mutateAsync({ id: userId });
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        toast.success("User deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete user");
      }
    },
    [deleteUserMutation]
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Back link */}
      <Link
        href="/admin/clients"
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        &larr; All clients
      </Link>

      {/* ── Client Info Card ─────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-zinc-500" />
            <h1 className="text-xl font-bold">Client Details</h1>
          </div>
          {!editingClient && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingClient(true)}
              className="text-zinc-400"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
        </div>

        {editingClient ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Slug</Label>
                <Input
                  value={editSlug}
                  onChange={(e) =>
                    setEditSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, "-")
                        .replace(/^-|-$/g, "")
                    )
                  }
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveClient}
                disabled={savingClient || !editName.trim() || !editSlug.trim()}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {savingClient ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Name</p>
              <p className="font-medium">{client.name}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Slug</p>
              <p className="font-mono text-sm text-zinc-400">{client.slug}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Created</p>
              <p className="text-sm text-zinc-400">
                {formatDate(client.created_at)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Users Section ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-zinc-500" />
            <h2 className="text-lg font-semibold">
              Users ({users.length})
            </h2>
          </div>
          <div className="flex gap-2">
            {/* Allocate existing VA */}
            <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
              <DialogTrigger
                className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Allocate VA
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700">
                <DialogHeader>
                  <DialogTitle>Allocate Existing VA</DialogTitle>
                </DialogHeader>
                {unassigned.length === 0 ? (
                  <p className="text-zinc-500 text-sm py-4">
                    No unassigned VAs available. Create a new user instead.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 mt-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>Select VA</Label>
                      <select
                        value={selectedVaId}
                        onChange={(e) => setSelectedVaId(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300"
                      >
                        <option value="">Choose a VA…</option>
                        {unassigned.map((va) => (
                          <option key={va.id} value={va.id}>
                            {va.full_name ?? va.email} ({va.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAllocateOpen(false)}
                        className="border-zinc-700"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAllocateVa}
                        disabled={!selectedVaId || allocating}
                      >
                        {allocating ? "Allocating…" : "Allocate"}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Create new user */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger
                className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 bg-white text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add User
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700">
                <DialogHeader>
                  <DialogTitle>Create User</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={handleCreateUser}
                  className="flex flex-col gap-4 mt-2"
                >
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
                      disabled={addingSaving || !newEmail.trim() || !newName.trim()}
                    >
                      {addingSaving ? "Creating…" : "Create User"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* User table */}
        {users.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
            <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400">
              No users for this client yet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-x-auto">
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
                    Joined
                  </th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {u.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleRoleChange(u.id, e.target.value as UserRole)
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
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRemoveFromClient(u.id)}
                          title="Remove from client"
                          aria-label="Remove from client"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          title="Delete user permanently"
                          aria-label="Delete user permanently"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
