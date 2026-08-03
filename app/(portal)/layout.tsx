import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUserAndClient } from "@/lib/auth";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { createClient } from "@/lib/supabase/server";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { ErrorReporter } from "@/components/layout/ErrorReporter";
import { HelpFab } from "@/components/layout/HelpFab";
import { FeatureVideosProvider } from "@/components/layout/FeatureVideosProvider";
import { getFeatureVideos } from "@/lib/tutorials/server";
import PortalLoading from "./loading";
import { ClientExperienceMonitor } from "@/components/layout/ClientExperienceMonitor";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One auth lookup on the happy path (cache()d, so pages calling it again are
  // free). Previously the layout ran its own getUser AND getCurrentUserAndClient's
  // — two remote auth round-trips before any page work, on top of middleware's.
  const ctx = await getCurrentUserAndClient();
  if (!ctx) {
    // Rare path: either no session, or a session whose users row is missing.
    // Distinguish with one raw auth check so the debug panel can name the email.
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <p className="text-3xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold mb-2">Profile not found</h1>
          <p className="text-zinc-400 text-sm mb-2">
            Authenticated as: <span className="text-white font-mono">{authUser.email}</span>
          </p>
          <p className="text-zinc-500 text-xs mb-4">
            Your user record was not found in the database. This is usually a Row Level Security (RLS) issue on the users table.
          </p>
          <p className="text-zinc-600 text-xs">
            Auth UID: {authUser.id}
          </p>
          <a href="/login" className="mt-6 inline-block text-xs text-zinc-400 hover:text-white underline">
            Sign out and try again
          </a>
        </div>
      </div>
    );
  }

  const featureVideos = await getFeatureVideos();

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50 print:bg-white print:min-h-0">
      {/* Keyboard skip link — first focusable element, visible only on focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-lg focus:bg-zinc-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:ring-2 focus:ring-zinc-400"
      >
        Skip to content
      </a>
      <ErrorReporter />
      <ClientExperienceMonitor />
      {/* The single sidebar instance (desktop column + mobile drawer) */}
      <div className="print:hidden">
        <SidebarShell user={ctx.user} client={ctx.client} />
      </div>
      {/* Main content — pt accounts for mobile menu button */}
      <main id="main-content" className="flex-1 overflow-auto pt-14 md:pt-0 print:pt-0 print:overflow-visible">
        {ctx.impersonating && ctx.actualUser && (
          <ImpersonationBanner
            viewingName={ctx.user.full_name ?? ctx.user.email}
            viewingRole={ctx.user.role}
            adminEmail={ctx.actualUser.email}
          />
        )}
        <div className="max-w-6xl mx-auto px-4 py-6 md:p-8 print:p-0 print:max-w-none">
          <FeatureVideosProvider value={featureVideos}>
            <Suspense fallback={<PortalLoading />}>
              <QueryProvider>{children}</QueryProvider>
            </Suspense>
          </FeatureVideosProvider>
        </div>
      </main>
      <HelpFab />
    </div>
  );
}
