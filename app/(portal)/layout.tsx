import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileSidebarTrigger } from "@/components/layout/MobileSidebarTrigger";
import { createClient } from "@/lib/supabase/server";
import { QueryProvider } from "@/components/providers/QueryProvider";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First check if there is an auth session at all
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // No session → go to login
  if (!authUser) redirect("/login");

  // Has session but user row lookup fails → show debug error, don't loop
  const ctx = await getCurrentUserAndClient();
  if (!ctx) {
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

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar user={ctx.user} client={ctx.client} />
      </div>
      {/* Mobile sidebar drawer */}
      <MobileSidebarTrigger user={ctx.user} client={ctx.client} />
      {/* Main content — pt accounts for mobile menu button */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 px-4 py-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          <QueryProvider>{children}</QueryProvider>
        </div>
      </main>
    </div>
  );
}
