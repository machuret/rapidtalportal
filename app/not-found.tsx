import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Root 404 — covers routes outside the portal group (login, marketing, typos
// in /api-less paths). Branded instead of Next's default white page.
export default function NotFound() {
  return (
    <div className="bg-zinc-950 text-white min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-5xl font-bold text-zinc-700 mb-3">404</p>
        <h1 className="text-xl font-bold mb-2">Page not found</h1>
        <p className="text-zinc-400 text-sm mb-6">
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <Link href="/dashboard" className={buttonVariants()}>Back to dashboard</Link>
      </div>
    </div>
  );
}
