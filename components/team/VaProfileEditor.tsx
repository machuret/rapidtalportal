"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Save, X, Loader2, Plus } from "lucide-react";

interface VaProfileEditorProps {
  vaId: string;
  initial: {
    full_name: string | null;
    phone: string | null;
    birthday: string | null;
    // NOTE: compensation (rate / pay method) is intentionally NOT edited here —
    // va_job_contracts is the single source of truth for VA pay, edited via
    // VaContractEditor (migration 147). The legacy users.salary /
    // payment_terms / payment_details columns are deprecated.
    whatsapp: string | null;
    personal_email: string | null;
    address: string | null;
    timezone: string | null;
    skills: string[] | null;
  };
}

export function VaProfileEditor({ vaId, initial }: VaProfileEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...initial });
  const [skillInput, setSkillInput] = useState("");

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      api.patch(ROUTES.team(vaId), payload),
    onSuccess: () => {
      toast.success("Profile updated.");
      setOpen(false);
      router.refresh();
    },
  });
  const saving = saveMutation.isPending;

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s) return;
    set("skills", [...(form.skills ?? []), s]);
    setSkillInput("");
  }

  function removeSkill(i: number) {
    set("skills", (form.skills ?? []).filter((_, idx) => idx !== i));
  }

  function save() {
    if (saveMutation.isPending) return;
    saveMutation.mutate(form);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-zinc-700 text-zinc-300 hover:text-white gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-3.5 h-3.5" /> Edit Profile
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="overlay-backdrop" onClick={() => setOpen(false)} />

          {/* Drawer */}
          <div className="modal-panel fixed right-0 top-0 h-full w-full max-w-lg border-l flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="font-semibold text-zinc-100">Edit VA Profile</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

              {/* Basic info */}
              <section>
                <p className="label-section mb-3">Basic Info</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "full_name",     label: "Full Name",     type: "text" },
                    { key: "phone",         label: "Phone",         type: "text" },
                    { key: "birthday",      label: "Birthday",      type: "date" },
                    { key: "personal_email",label: "Personal Email",type: "email" },
                    { key: "whatsapp",      label: "WhatsApp",      type: "text" },
                    { key: "timezone",      label: "Time Zone",     type: "text" },
                  ].map(({ key, label, type }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <Label className="text-zinc-400 text-xs">{label}</Label>
                      <Input
                        type={type}
                        value={(form[key as keyof typeof form] as string) ?? ""}
                        onChange={e => set(key as keyof typeof form, e.target.value || null)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-100 h-8 text-sm"
                        placeholder={label}
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Address */}
              <section>
                <p className="label-section mb-3">Address</p>
                <Textarea
                  value={form.address ?? ""}
                  onChange={e => set("address", e.target.value || null)}
                  rows={2}
                  placeholder="Street, City, Country"
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 text-sm resize-none"
                />
              </section>

              {/* Compensation was removed: VA pay (rate, currency, pay period,
                  method, schedule) lives in va_job_contracts and is edited via
                  VaContractEditor on the same page (migration 147). */}

              {/* Skills */}
              <section>
                <p className="label-section mb-3">Skills</p>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                    placeholder="Add a skill and press Enter"
                    className="bg-zinc-900 border-zinc-700 text-zinc-100 h-8 text-sm flex-1"
                  />
                  <Button type="button" size="sm" variant="outline" className="border-zinc-700 h-8" onClick={addSkill}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(form.skills ?? []).map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">
                      {s}
                      <button onClick={() => removeSkill(i)} className="hover:text-red-400 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex gap-3">
              <Button onClick={save} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save Profile"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400">
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
