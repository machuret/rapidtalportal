import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Portal 404 — renders inside the portal shell (sidebar/nav stay), so a
// mistyped in-app link keeps the user oriented rather than dropping them on a
// bare page.
export default function PortalNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <p className="text-5xl font-bold text-zinc-700 mb-3">404</p>
      <h1 className="text-xl font-bold mb-2">Page not found</h1>
      <p className="text-zinc-400 text-sm mb-6 max-w-sm">
        That page doesn’t exist or you don’t have access to it.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "border-zinc-700" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
