import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Supervision merged into the Team hub (/team): the roster there now carries
 * the same per-VA outcome stats, flags and CSV export. Keep the old URL
 * alive as a redirect.
 */
export default function SupervisionPage() {
  redirect("/team");
}
