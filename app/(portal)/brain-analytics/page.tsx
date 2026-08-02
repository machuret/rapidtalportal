import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain Analytics — RapidTal" };

/** Consolidated into the Company Brain section group — keep the super-admin
 *  ?client= selection across the redirect. */
export default async function BrainAnalyticsRedirect({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  redirect(searchParams.client ? `/brain/analytics?client=${searchParams.client}` : "/brain/analytics");
}
