import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryPage } from "@/components/content/LibraryPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadHistory } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Drafts & Approved — RapidTal" };

export default async function LibraryRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { history, hasMore } = await loadHistory(admin, user.client_id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Drafts &amp; Approved</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Every artifact the engine has produced — edit, compare, approve, export.
      </p>
      <PageIntro id="content-library" />
      <LibraryPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        initialHistory={history}
        historyHasMore={hasMore}
      />
    </div>
  );
}
