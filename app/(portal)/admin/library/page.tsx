import { LibraryBig } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BusinessLibraryAdmin } from "@/components/admin/BusinessLibraryAdmin";
import { BusinessLibraryQuality } from "@/components/admin/BusinessLibraryQuality";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business Library — RapidTal" };

export default async function AdminBusinessLibraryPage() {
  await requireSuperAdmin();

  return (
    <div className="max-w-6xl">
      <AdminPageHeader
        icon={LibraryBig}
        gradient="from-orange-500 to-amber-600 shadow-orange-500/20"
        title="Business Library"
        subtitle="Author, review and publish platform-wide business expertise. Published releases are immutable, versioned and prepared for official Brain retrieval."
      />
      <BusinessLibraryQuality />
      <BusinessLibraryAdmin />
    </div>
  );
}
