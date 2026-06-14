import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { ClientGuide } from "@/components/guide/ClientGuide";
import { CLIENT_GUIDE, GUIDE_INTRO } from "@/lib/client-guide";
import { VA_GUIDE, VA_GUIDE_INTRO } from "@/lib/va-guide";
import { BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guide — RapidTal" };

export default async function GuidePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  // VAs get a guide written for their job; everyone else gets the client guide.
  const isVa = ctx.user.role === "va";
  const groups = isVa ? VA_GUIDE : CLIENT_GUIDE;
  const intro = isVa ? VA_GUIDE_INTRO : GUIDE_INTRO;
  const subtitle = isVa
    ? "A plain-English guide to every tool you have, how to do great work, and how to keep your job details clear. Tap any item to expand it."
    : "A plain-English guide to every feature and how to manage your VA. Tap any item to expand it.";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">How it all works</h1>
          <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
        </div>
      </div>
      <div className="surface-card px-5 py-4 mb-6">
        <p className="text-sm text-zinc-300 leading-relaxed">{intro}</p>
      </div>
      <ClientGuide groups={groups} />
    </div>
  );
}
