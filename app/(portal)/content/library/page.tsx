import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryPage } from "@/components/content/LibraryPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadHistory } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content library — RapidTal" };

export default async function LibraryRoute({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const params = await searchParams;
  const requestedPieceId = typeof params.open === "string" && /^[0-9a-f-]{36}$/iu.test(params.open)
    ? params.open
    : null;
  const { history, hasMore } = await loadHistory(admin, user.client_id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content library</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Find drafts, approved content and archived work in one searchable place.
      </p>
      <PageIntro id="content-library" />
      <LibraryPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        initialHistory={history}
        historyHasMore={hasMore}
        initialSelectedId={requestedPieceId}
      />
    </div>
  );
}
