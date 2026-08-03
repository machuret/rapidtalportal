"use client";

import Link from "next/link";
import {
  Building2, Check, ChevronLeft, ChevronRight, ExternalLink, Globe2, Loader2,
  Mail, MapPin, Phone, Sparkles, Star, UserPlus, X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fitClass, statusClass, statusLabel } from "@/components/prospecting/presentation";
import type { ProspectingCollaborator, ProspectingLead, ProspectingLeadStatus } from "@/types/prospecting";

export type ProspectingFitFilter = Exclude<ProspectingLead["fit_band"], null> | "all";
export type ProspectingLeadSort = "fit" | "newest";
export type SelectedProspectingContacts = Record<string, { email: string; phone: string }>;

export function LeadInbox({
  leads, total, offset, pageSize, loading, filter, fitFilter, sort,
  collaborators, pendingAction, selectedContacts,
  onFilter, onFitFilter, onSort, onFindLeads, onPage,
  onSelectEmail, onSelectPhone, onAssign, onEnrich, onStatus, onPromote,
}: {
  leads: ProspectingLead[];
  total: number;
  offset: number;
  pageSize: number;
  loading: boolean;
  filter: ProspectingLeadStatus | "all";
  fitFilter: ProspectingFitFilter;
  sort: ProspectingLeadSort;
  collaborators: ProspectingCollaborator[];
  pendingAction: string | null;
  selectedContacts: SelectedProspectingContacts;
  onFilter: (filter: ProspectingLeadStatus | "all") => void;
  onFitFilter: (filter: ProspectingFitFilter) => void;
  onSort: (sort: ProspectingLeadSort) => void;
  onFindLeads: () => void;
  onPage: (offset: number) => void;
  onSelectEmail: (leadId: string, email: string) => void;
  onSelectPhone: (leadId: string, phone: string) => void;
  onAssign: (lead: ProspectingLead, assignee: string | null) => void;
  onEnrich: (lead: ProspectingLead) => void;
  onStatus: (lead: ProspectingLead, status: "new" | "shortlisted" | "dismissed") => void;
  onPromote: (lead: ProspectingLead) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Lead Inbox</h2>
          <p className="text-sm text-zinc-400">Review, shortlist or add suitable companies to CRM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="lead-status" className="sr-only">Filter lead status</Label>
          <select id="lead-status" value={filter} onChange={(event) => onFilter(event.target.value as ProspectingLeadStatus | "all")} className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200">
            <option value="all">All leads</option><option value="new">New</option><option value="shortlisted">Shortlisted</option><option value="imported">In CRM</option><option value="dismissed">Dismissed</option>
          </select>
          <Label htmlFor="lead-fit" className="sr-only">Filter fit</Label>
          <select id="lead-fit" value={fitFilter} onChange={(event) => onFitFilter(event.target.value as ProspectingFitFilter)} className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200">
            <option value="all">All fit levels</option><option value="strong">Strong fit</option><option value="possible">Possible fit</option><option value="weak">Weak fit</option>
          </select>
          <Label htmlFor="lead-sort" className="sr-only">Sort leads</Label>
          <select id="lead-sort" value={sort} onChange={(event) => onSort(event.target.value as ProspectingLeadSort)} className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200">
            <option value="fit">Best fit first</option><option value="newest">Newest first</option>
          </select>
        </div>
      </div>
      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-zinc-800"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading leads" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
          <Building2 className="mx-auto h-9 w-9 text-zinc-600" />
          <p className="mt-3 font-medium text-zinc-200">No leads in this view</p>
          <p className="mt-1 text-sm text-zinc-500">Run a search or choose a different status.</p>
          <Button variant="outline" className="mt-4" onClick={onFindLeads}>Find leads</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {leads.map((lead) => {
              const prospect = lead.prospect;
              const title = prospect.person_name || prospect.company_name || "Unnamed lead";
              const busy = pendingAction?.endsWith(lead.id);
              return (
                <article key={lead.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-zinc-100">{title}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${statusClass(lead.status)}`}>{statusLabel(lead.status)}</span>
                        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-2xs text-zinc-400">{lead.campaign.name}</span>
                        {lead.fit_score !== null && <span className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${fitClass(lead.fit_band)}`}>{lead.fit_score}/100 · {lead.fit_band ?? "unrated"} fit</span>}
                      </div>
                      {prospect.industry && <p className="mt-1 text-xs text-zinc-400">{prospect.industry}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
                        {(prospect.address || prospect.locality) && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{prospect.address || prospect.locality}</span>}
                        {prospect.email && <a className="flex items-center gap-1.5 hover:text-white" href={`mailto:${prospect.email}`}><Mail className="h-3.5 w-3.5" />{prospect.email}</a>}
                        {prospect.phone && <a className="flex items-center gap-1.5 hover:text-white" href={`tel:${prospect.phone}`}><Phone className="h-3.5 w-3.5" />{prospect.phone}</a>}
                        {prospect.rating !== null && <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" />{prospect.rating}{prospect.review_count ? ` (${prospect.review_count})` : ""}</span>}
                        {prospect.website_url && <a className="flex items-center gap-1.5 text-orange-300 hover:text-orange-200" href={prospect.website_url} target="_blank" rel="noreferrer">Website <ExternalLink className="h-3.5 w-3.5" /></a>}
                      </div>
                      {lead.fit_breakdown?.explanation && <p className="mt-2 text-xs text-zinc-400">{lead.fit_breakdown.explanation}</p>}
                      {lead.fit_breakdown?.dimensions && (
                        <details className="mt-2 text-xs text-zinc-500">
                          <summary className="cursor-pointer hover:text-zinc-300">Why this score</summary>
                          <div className="mt-2 space-y-2 rounded-lg bg-zinc-950 p-3">
                            <div className="flex flex-wrap gap-2">{Object.entries(lead.fit_breakdown.dimensions).map(([name, value]) => <span key={name} className="rounded-md bg-zinc-900 px-2 py-1">{name.replace(/([A-Z])/gu, " $1")}: {value.score}/{value.maximum}</span>)}</div>
                            {lead.fit_breakdown.criteria?.requiredMatched?.length ? <p><span className="text-emerald-300">Required matched:</span> {lead.fit_breakdown.criteria.requiredMatched.join(", ")}</p> : null}
                            {lead.fit_breakdown.criteria?.requiredMissing?.length ? <p><span className="text-red-300">Required missing:</span> {lead.fit_breakdown.criteria.requiredMissing.join(", ")}</p> : null}
                            {lead.fit_breakdown.criteria?.preferredMatched?.length ? <p><span className="text-blue-300">Preferred matched:</span> {lead.fit_breakdown.criteria.preferredMatched.join(", ")}</p> : null}
                            {lead.fit_breakdown.criteria?.excludedMatched?.length ? <p><span className="text-red-300">Excluded matched:</span> {lead.fit_breakdown.criteria.excludedMatched.join(", ")}</p> : null}
                            {lead.fit_breakdown.criteria?.minimumRating ? <p>Rating: {lead.fit_breakdown.criteria.ratingObserved ?? "not found"} / minimum {lead.fit_breakdown.criteria.minimumRating} {lead.fit_breakdown.criteria.minimumRatingMet ? "✓" : "✕"}</p> : null}
                            {lead.fit_breakdown.criteria?.minimumReviews ? <p>Reviews: {lead.fit_breakdown.criteria.reviewsObserved ?? "not found"} / minimum {lead.fit_breakdown.criteria.minimumReviews} {lead.fit_breakdown.criteria.minimumReviewsMet ? "✓" : "✕"}</p> : null}
                          </div>
                        </details>
                      )}
                      {lead.latest_enrichment && (
                        <details className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
                          <summary className="cursor-pointer text-blue-300"><span className="inline-flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" />Review enrichment · {lead.latest_enrichment.page_count} pages</span></summary>
                          <div className="mt-3 space-y-3 text-zinc-400">
                            {lead.latest_enrichment.description && <p>{lead.latest_enrichment.description}</p>}
                            <div className="grid gap-3 md:grid-cols-2">
                              <div><Label htmlFor={`email-${lead.id}`} className="text-xs">Email to add to CRM</Label><select id={`email-${lead.id}`} value={selectedContacts[lead.id]?.email ?? ""} onChange={(event) => onSelectEmail(lead.id, event.target.value)} className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2"><option value="">Do not add a scraped email</option>{lead.latest_enrichment.emails.map((email) => <option key={email} value={email}>{email}</option>)}</select></div>
                              <div><Label htmlFor={`phone-${lead.id}`} className="text-xs">Phone to add to CRM</Label><select id={`phone-${lead.id}`} value={selectedContacts[lead.id]?.phone ?? ""} onChange={(event) => onSelectPhone(lead.id, event.target.value)} className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2"><option value="">Do not add a scraped phone</option>{lead.latest_enrichment.phones.map((phone) => <option key={phone} value={phone}>{phone}</option>)}</select></div>
                            </div>
                            <div className="flex flex-wrap gap-3">{Object.entries(lead.latest_enrichment.social_links).map(([network, url]) => <a key={network} href={url} target="_blank" rel="noreferrer" className="text-orange-300 hover:text-orange-200">{network} <ExternalLink className="inline h-3 w-3" /></a>)}</div>
                            <div><p className="font-medium text-zinc-300">Pages reviewed</p><div className="mt-1 flex flex-col gap-1">{lead.latest_enrichment.page_urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="truncate text-blue-300 hover:text-blue-200">{url}</a>)}</div></div>
                            <p>Captured {new Date(lead.latest_enrichment.captured_at).toLocaleString("en-AU")}. Scraped contacts are only used when you select them above.</p>
                          </div>
                        </details>
                      )}
                      {lead.latest_enrichment_job?.status === "error" && (
                        <div role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                          <p className="font-medium">Company enrichment did not finish</p>
                          <p className="mt-1 text-red-200/80">{lead.latest_enrichment_job.error_message || "The website did not return usable company details. You can try again."}</p>
                        </div>
                      )}
                      {lead.latest_enrichment_job?.status === "cancelled" && !lead.active_enrichment_job && (
                        <p className="mt-3 text-xs text-zinc-500">The latest company-enrichment attempt was cancelled.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Label htmlFor={`assignee-${lead.id}`} className="sr-only">Assign lead</Label>
                      <select id={`assignee-${lead.id}`} aria-label={`Assign ${title}`} value={lead.assigned_to ?? ""} disabled={busy} onChange={(event) => onAssign(lead, event.target.value || null)} className="h-8 max-w-44 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"><option value="">Unassigned</option>{collaborators.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select>
                      {prospect.website_url && ["new", "shortlisted"].includes(lead.status) && <Button size="sm" variant="outline" disabled={busy || Boolean(lead.active_enrichment_job)} onClick={() => onEnrich(lead)}>{pendingAction === `enrich:${lead.id}` || lead.active_enrichment_job ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{lead.active_enrichment_job ? "Enriching" : lead.latest_enrichment ? "Refresh details" : "Enrich company"}</Button>}
                      {lead.status !== "shortlisted" && lead.status !== "imported" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(lead, "shortlisted")}><Check className="mr-1.5 h-3.5 w-3.5" />Shortlist</Button>}
                      {lead.status !== "dismissed" && lead.status !== "imported" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(lead, "dismissed")}><X className="mr-1.5 h-3.5 w-3.5" />Dismiss</Button>}
                      {lead.status === "dismissed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(lead, "new")}>Restore</Button>}
                      {lead.status === "imported" ? <Link href="/crm" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>View CRM</Link> : lead.status !== "dismissed" ? <Button size="sm" disabled={busy} onClick={() => onPromote(lead)}>{pendingAction === `promote:${lead.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}Add to CRM</Button> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Showing {offset + 1}–{Math.min(offset + leads.length, total)} of {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" aria-label="Previous lead page" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - pageSize))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" aria-label="Next lead page" disabled={offset + pageSize >= total} onClick={() => onPage(offset + pageSize)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
