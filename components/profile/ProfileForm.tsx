"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Save, KeyRound, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DbUser } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/useProfile";

interface Props {
  user: DbUser;
}

export function ProfileForm({ user }: Props) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    updateProfile,
    isUpdating: saving,
    changePassword: changePasswordMutation,
    isChangingPassword: savingPw,
  } = useProfile();

  const [fullName, setFullName]   = useState(user.full_name ?? "");
  const [phone, setPhone]         = useState(user.phone ?? "");
  const [birthday, setBirthday]   = useState(user.birthday ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [newPassword, setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({
        full_name:  fullName  || null,
        phone:      phone     || null,
        birthday:   birthday  || null,
        avatar_url: avatarUrl || null,
      });
      toast.success("Profile updated.");
    } catch {
      // Error toast handled by the API client.
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2 MB.");
      return;
    }
    setUploadingPhoto(true);
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("profiles")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      toast.error(upErr.message);
      setUploadingPhoto(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("profiles").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    setAvatarUrl(publicUrl);

    await updateProfile({ avatar_url: publicUrl });
    setUploadingPhoto(false);
    toast.success("Photo updated.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    try {
      await changePasswordMutation({ new_password: newPassword });
      toast.success("Password changed.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      // Error toast handled by the API client.
    }
  }

  const initials = fullName
    ? fullName.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your personal information and account settings.</p>
      </div>

      {/* Avatar */}
      <div className="surface-card px-6 py-5 flex items-center gap-5">
        <div className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Profile photo"
              className="w-20 h-20 rounded-full object-cover border-2 border-zinc-700"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-200 border-2 border-zinc-600">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-zinc-600 border border-zinc-500 flex items-center justify-center hover:bg-zinc-500 transition-colors"
            title="Change photo"
          >
            {uploadingPhoto
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              : <Camera className="w-3.5 h-3.5 text-white" />
            }
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>
        <div>
          <p className="font-semibold text-base">{fullName || user.email}</p>
          <p className="text-sm text-zinc-400">{user.email}</p>
          <p className="text-xs text-zinc-500 mt-1 capitalize">{user.role.replace("_", " ")}</p>
        </div>
      </div>

      {/* Personal info */}
      <form onSubmit={saveProfile} className="surface-card px-6 py-5 flex flex-col gap-5">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-zinc-400" />
          <h2 className="font-semibold text-base">Personal Information</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your full name"
            className="bg-zinc-800 border-zinc-700"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            value={user.email}
            disabled
            className="bg-zinc-800 border-zinc-700 opacity-50 cursor-not-allowed"
          />
          <p className="text-xs text-zinc-500">Email changes are handled by your administrator.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+61 400 000 000"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birthday">Date of Birth</Label>
            <Input
              id="birthday"
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>

      {/* Password change */}
      <form onSubmit={changePassword} className="surface-card px-6 py-5 flex flex-col gap-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-zinc-400" />
          <h2 className="font-semibold text-base">Change Password</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new_password">New Password</Label>
          <Input
            id="new_password"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="bg-zinc-800 border-zinc-700"
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm_password">Confirm New Password</Label>
          <Input
            id="confirm_password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            className="bg-zinc-800 border-zinc-700"
            autoComplete="new-password"
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={savingPw || !newPassword || newPassword !== confirmPassword}
            className="gap-2"
          >
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {savingPw ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </form>
    </div>
  );
}
