import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  return <ProfileForm user={ctx.user} />;
}
