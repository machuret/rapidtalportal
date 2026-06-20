import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { NotificationSettings } from "@/components/profile/NotificationSettings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <ProfileForm user={ctx.user} />
      <NotificationSettings role={ctx.user.role} />
    </div>
  );
}
