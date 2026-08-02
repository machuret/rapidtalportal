import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Supervision detail moved into the Team profile (/team/[id]), which now
 * carries the same activity data (hours, SOP runs, daily logs). Keep the old
 * URL alive as a redirect.
 */
export default async function SupervisionDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/team/${params.id}`);
}
