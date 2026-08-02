import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Report — RapidTal" };

/** The Company Report was the same <KnowledgeCoverage> the Company Brain
 *  overview already renders (VAs included, with canCurate=false there) — one
 *  Company Brain home, not three. The VA menu entry lands here and forwards. */
export default function CompanyReportRedirect() {
  redirect("/brain");
}
