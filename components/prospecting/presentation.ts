import type { ProspectingCampaign, ProspectingLead } from "@/types/prospecting";

export function keywordList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

export function fitClass(band: ProspectingLead["fit_band"]): string {
  if (band === "strong") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (band === "possible") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-800 text-zinc-300";
}

export function statusLabel(status: string): string {
  return ({
    ready: "Ready", running: "Collecting", completed: "Completed", failed: "Needs retry",
    done: "Completed", error: "Needs retry", cancelled: "Cancelled", new: "New",
    shortlisted: "Shortlisted", dismissed: "Dismissed", imported: "In CRM",
  } as Record<string, string>)[status] ?? status;
}

export function statusClass(status: string): string {
  if (["completed", "done", "imported"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["running", "queued", "ingesting"].includes(status)) return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  if (["failed", "error"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "shortlisted") return "bg-orange-500/10 text-orange-300 border-orange-500/20";
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

export function matchingSummary(profile: ProspectingCampaign["ideal_profile"]): string {
  const parts: string[] = [];
  if (profile.requiredKeywords?.length) parts.push(`${profile.requiredKeywords.length} required`);
  if (profile.preferredKeywords?.length) parts.push(`${profile.preferredKeywords.length} preferred`);
  if (profile.excludedKeywords?.length) parts.push(`${profile.excludedKeywords.length} excluded`);
  if (profile.minRating) parts.push(`${profile.minRating}+ rating`);
  if (profile.minReviewCount) parts.push(`${profile.minReviewCount}+ reviews`);
  if (profile.mustHaveWebsite) parts.push("website required");
  return parts.length ? parts.join(" · ") : "No additional matching rules";
}
