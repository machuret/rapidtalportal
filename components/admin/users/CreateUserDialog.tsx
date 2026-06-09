"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ROLE_OPTIONS, type UserRole } from "@/lib/taxonomy/roles";

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: UserRole;
  client_id: string | null;
  password?: string;
}

interface CreateUserDialogProps {
  clients: { id: string; name: string }[];
  isCreating: boolean;
  onCreate: (payload: CreateUserPayload) => Promise<unknown>;
}

/** Self-contained "New User" dialog — owns its open + form state. */
export function CreateUserDialog({ clients, isCreating, onCreate }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("va");
  const [clientId, setClientId] = useState("");
  const [password, setPassword] = useState("");

  function reset() {
    setEmail(""); setName(""); setRole("va"); setClientId(""); setPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onCreate({
        email: email.trim(),
        full_name: name.trim(),
        role,
        client_id: clientId || null,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      setOpen(false);
      reset();
    } catch {
      // error toast handled by the mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-white text-zinc-900 hover:bg-zinc-200 transition-colors">
        <UserPlus className="w-4 h-4" />
        New User
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" required className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Password <span className="text-zinc-600">(leave blank to auto-generate)</span></Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Client</Label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} className="border-zinc-700">Cancel</Button>
            <Button type="submit" size="sm" disabled={isCreating || !email.trim() || !name.trim()}>
              {isCreating ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
