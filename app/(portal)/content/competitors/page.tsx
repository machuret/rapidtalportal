import { redirect } from "next/navigation";

/** Legacy deep link retained for saved bookmarks. */
export default function LegacyContentCompetitorsRoute() {
  redirect("/competitors");
}
