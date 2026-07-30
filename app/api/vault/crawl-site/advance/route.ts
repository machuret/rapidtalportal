/**
 * POST /api/vault/crawl-site/advance — advance a crawl job by one tick.
 *
 * The whole pipeline is a Postgres-checkpointed state machine; each call does
 * ONE small unit of work and saves state, so any tick can crash or be
 * duplicated and the job still converges:
 *
 *   crawling      poll Firecrawl's async job, mirror progress counters
 *   ingesting     classify + store a batch of scraped pages as vault items
 *                 (idempotent: keyed on client_id + source_url)
 *   synthesizing  catalog → map (per-page notes) → reduce (dossier) → finalize
 *                 (figure verification + Company DNA fill), one sub-step/tick
 *   done | error  terminal
 *
 * Drivers: the Vault UI polls while open; reopening the page resumes a paused
 * job. Firecrawl keeps crawling server-side either way.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { createHash } from "crypto";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";
import {
  classifyPage, extractPrices, buildCatalogMarkdown, verifyFigures, type CatalogEntry,
} from "@/lib/crawl/classify";
import { dossierSystemPrompt } from "@/lib/crawl/prompts";
import { notify } from "@/lib/notifications";
import { errorMessage } from "@/lib/error-message";

export const maxDuration = 60;

const INGEST_BATCH = 8;   // pages classified/stored per tick
const MAP_BATCH = 5;      // core pages summarized per LLM call
const CRAWL_LEASE_SECONDS = 90; // longer than maxDuration; expires after a killed request
const MAP_MODEL = "openai/gpt-4o-mini";
const SYNTHESIS_MODEL = "openai/gpt-4o"; // runs once per site — quality over cost

const schema = z.object({ jobId: z.string().uuid() });

// Type alias (not interface) so it satisfies the jsonb Record<string, unknown>
// column type via TypeScript's implicit index signature for aliases.
type JobMeta = {
  cursor?: number;
  kept?: string[];
  catalog?: CatalogEntry[];
  syn_step?: "catalog" | "map" | "reduce" | "finalize";
  map_i?: number;
  notes?: string[];
  dossier_text?: string;
  warning?: string;
  unverified?: string[];
};

interface CrawlJob {
  id: string;
  client_id: string;
  created_by: string | null;
  url: string;
  status: string;
  firecrawl_id: string | null;
  pages_total: number;
  pages_done: number;
  items_created: number;
  products_seen: number;
  pages_dropped: number;
  tokens_used: number;
  dossier_item_id: string | null;
  meta: JobMeta;
  lease_token: string | null;
  lease_until: string | null;
  updated_at: string;
}

interface FirecrawlPage {
  markdown?: string;
  metadata?: { sourceURL?: string; url?: string; title?: string; statusCode?: number };
}

async function llm(model: string, system: string, user: string, maxTokens: number): Promise<{ text: string; tokens: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in this deployment.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, `LLM call failed (${res.status})`));
  return { text: json.choices?.[0]?.message?.content ?? "", tokens: json.usage?.total_tokens ?? 0 };
}

/** Fetch the full result set from Firecrawl, following pagination. */
async function fetchCrawlPages(firecrawlId: string, key: string): Promise<{ status: string; total: number; completed: number; pages: FirecrawlPage[] }> {
  let url: string | null = `https://api.firecrawl.dev/v1/crawl/${firecrawlId}`;
  const pages: FirecrawlPage[] = [];
  let status = "scraping"; let total = 0; let completed = 0;
  for (let hop = 0; url && hop < 10; hop++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(errorMessage(json, `Firecrawl status check failed (${res.status})`));
    status = json.status ?? status;
    total = json.total ?? total;
    completed = json.completed ?? completed;
    if (Array.isArray(json.data)) pages.push(...json.data);
    url = json.next ?? null;
  }
  return { status, total, completed, pages };
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: jobRow, error: jobError } = await admin.from("crawl_jobs").select("*").eq("id", parsed.data.jobId).maybeSingle();
  if (jobError) return serverError(jobError);
  if (!jobRow) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const loadedJob = jobRow as unknown as CrawlJob;

  const denied = assertClientAccess(user, loadedJob.client_id);
  if (denied) return denied;

  if (loadedJob.status === "done" || loadedJob.status === "error") {
    return NextResponse.json({ job: loadedJob });
  }

  // Atomic expiring lease: only the returned token may checkpoint this tick.
  // Multiple tabs/users can poll safely; non-owners simply receive current state.
  const { data: claimedRows, error: claimError } = await admin.rpc("claim_crawl_job", {
    p_job_id: loadedJob.id,
    p_lease_seconds: CRAWL_LEASE_SECONDS,
  });
  if (claimError) return serverError(claimError);
  const claimed = (claimedRows ?? []) as unknown as CrawlJob[];
  if (claimed.length === 0) {
    return NextResponse.json({ job: loadedJob });
  }
  const job = claimed[0];
  const leaseToken = job.lease_token;
  if (!leaseToken) return NextResponse.json({ error: "Crawl lease did not return a token." }, { status: 500 });

  const meta: JobMeta = job.meta ?? {};
  type JobPatch = import("@/types/database").Database["public"]["Tables"]["crawl_jobs"]["Update"];
  const patch: JobPatch = {};
  const firecrawlKey = process.env.FIRECRAWL_API_KEY!;

  try {
    if (job.status === "crawling") {
      const { status, total, completed } = await fetchCrawlPages(job.firecrawl_id!, firecrawlKey);
      patch.pages_total = total;
      patch.pages_done = completed;
      if (status === "failed") {
        patch.status = "error";
        patch.error = "Firecrawl reported the crawl as failed.";
      } else if (status === "completed") {
        patch.status = "ingesting";
        meta.cursor = 0;
        meta.kept = meta.kept ?? [];
        meta.catalog = meta.catalog ?? [];
      }
    } else if (job.status === "ingesting") {
      const { pages } = await fetchCrawlPages(job.firecrawl_id!, firecrawlKey);
      const cursor = meta.cursor ?? 0;
      const batch = pages.slice(cursor, cursor + INGEST_BATCH);
      let created = 0; let products = 0; let dropped = 0;

      for (const page of batch) {
        const pageUrl = page.metadata?.sourceURL ?? page.metadata?.url ?? "";
        const markdown = page.markdown ?? "";
        if (!pageUrl) { dropped++; continue; }
        const cls = classifyPage(pageUrl, markdown);

        if (cls === "drop") { dropped++; continue; }
        if (cls === "product") {
          products++;
          (meta.catalog = meta.catalog ?? []).push({
            title: (page.metadata?.title ?? pageUrl).slice(0, 160),
            url: pageUrl,
            prices: extractPrices(markdown),
          });
          continue;
        }

        // core / blog → real vault item with the REAL page content.
        // Idempotent: one item per (client, source_url).
        const { data: existing, error: existingError } = await admin
          .from("vault_items")
          .select("id")
          .eq("client_id", job.client_id)
          .eq("source_url", pageUrl)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          (meta.kept = meta.kept ?? []).push((existing as { id: string }).id);
          continue;
        }
        const { data: item, error: insertError } = await admin
          .from("vault_items")
          .insert({
            client_id: job.client_id,
            source_type: "url",
            title: (page.metadata?.title ?? pageUrl).slice(0, 200),
            source_url: pageUrl,
            raw_content: markdown,
            content_hash: createHash("sha256").update(markdown).digest("hex"),
            status: "processing",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        if (!item) throw new Error(`The crawled page could not be saved: ${pageUrl}`);
        created++;
        (meta.kept = meta.kept ?? []).push((item as { id: string }).id);
        scheduleVaultProcess((item as { id: string }).id, job.client_id);
      }

      meta.cursor = cursor + batch.length;
      patch.items_created = job.items_created + created;
      patch.products_seen = job.products_seen + products;
      patch.pages_dropped = job.pages_dropped + dropped;
      if (meta.cursor >= pages.length) {
        patch.status = "synthesizing";
        meta.syn_step = "catalog";
      }
    } else if (job.status === "synthesizing") {
      const host = new URL(job.url).hostname;
      const step = meta.syn_step ?? "catalog";

      if (step === "catalog") {
        if ((meta.catalog ?? []).length > 0) {
          const md = buildCatalogMarkdown(host, meta.catalog!);
          const { data: item, error: catalogError } = await admin
            .from("vault_items")
            .insert({
              client_id: job.client_id,
              source_type: "text",
              title: `Product Catalog — ${host}`,
              raw_content: md,
              content_hash: createHash("sha256").update(md).digest("hex"),
              status: "processing",
              created_by: user.id,
            })
            .select("id")
            .single();
          if (catalogError) throw catalogError;
          if (!item) throw new Error("The generated product catalog could not be saved.");
          patch.items_created = job.items_created + 1;
          scheduleVaultProcess((item as { id: string }).id, job.client_id);
        }
        meta.syn_step = "map";
        meta.map_i = 0;
        meta.notes = [];
      } else if (step === "map") {
        if (!process.env.OPENROUTER_API_KEY) {
          // Degrade gracefully: pages are ingested + embedded; only the dossier is skipped.
          meta.warning = "Dossier skipped: OPENROUTER_API_KEY is not set in this deployment.";
          patch.status = "done";
        } else {
          const kept = meta.kept ?? [];
          const i = meta.map_i ?? 0;
          const batchIds = kept.slice(i, i + MAP_BATCH);
          if (batchIds.length === 0) {
            meta.syn_step = "reduce";
          } else {
            const { data: items, error: itemsError } = await admin
              .from("vault_items")
              .select("title, source_url, raw_content")
              .in("id", batchIds);
            if (itemsError) throw itemsError;
            const corpus = ((items ?? []) as { title: string; source_url: string | null; raw_content: string | null }[])
              .map((it) => `### PAGE: ${it.title}\nURL: ${it.source_url}\n${(it.raw_content ?? "").slice(0, 6000)}`)
              .join("\n\n");
            const { text, tokens } = await llm(
              MAP_MODEL,
              "You take scraped website pages and write dense factual notes for a company dossier. Capture every concrete fact: products/services, exact prices, shipping thresholds, returns windows, warranties, contact channels, programs, brand claims. Quote numbers VERBATIM. Note the source URL after each group of facts. No filler.",
              corpus,
              1200,
            );
            (meta.notes = meta.notes ?? []).push(text);
            patch.tokens_used = job.tokens_used + tokens;
            meta.map_i = i + batchIds.length;
            if (meta.map_i >= kept.length) meta.syn_step = "reduce";
          }
        }
      } else if (step === "reduce") {
        const catalogSection = (meta.catalog ?? []).length
          ? `\n\nCATALOG SUMMARY:\n${buildCatalogMarkdown(host, meta.catalog!).slice(0, 8000)}`
          : "";
        const { text, tokens } = await llm(
          SYNTHESIS_MODEL,
          dossierSystemPrompt(host),
          `NOTES FROM ${meta.notes?.length ?? 0} PAGE GROUPS:\n\n${(meta.notes ?? []).join("\n\n---\n\n")}${catalogSection}`,
          4000,
        );
        meta.dossier_text = text;
        patch.tokens_used = job.tokens_used + tokens;
        meta.syn_step = "finalize";
      } else if (step === "finalize") {
        // Grounding: verify every quoted figure against the real scraped text.
        const kept = meta.kept ?? [];
        const { data: items, error: sourceError } = await admin
          .from("vault_items")
          .select("raw_content")
          .in("id", kept.slice(0, 60));
        if (sourceError) throw sourceError;
        const sourceText =
          ((items ?? []) as { raw_content: string | null }[]).map((x) => x.raw_content ?? "").join("\n") +
          "\n" + buildCatalogMarkdown(host, meta.catalog ?? []);
        const dossier = meta.dossier_text ?? "";
        const { verified, unverified } = verifyFigures(dossier, sourceText);
        meta.unverified = unverified;

        const verification = unverified.length
          ? `\n\n---\n\n## Verification\n${verified} figures verified against scraped pages. ⚠️ Could not verify: ${unverified.join(", ")} — confirm before quoting to customers.`
          : `\n\n---\n\n## Verification\nAll ${verified} quoted figures verified against the scraped pages.`;

        const { data: dossierItem, error: dossierError } = await admin
          .from("vault_items")
          .insert({
            client_id: job.client_id,
            source_type: "text",
            title: `Company Dossier — ${host}`,
            source_url: job.url,
            raw_content: dossier + verification,
            category: "reference",
            tags: ["dossier", "website", host],
            meta_curated: true,
            status: "processing",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (dossierError) throw dossierError;
        if (!dossierItem) throw new Error("The generated company dossier could not be saved.");
        patch.dossier_item_id = (dossierItem as { id: string }).id;
        patch.items_created = job.items_created + 1;
        scheduleVaultProcess((dossierItem as { id: string }).id, job.client_id);

        // Company DNA: fill ONLY fields that are still empty — never overwrite
        // anything a human wrote.
        try {
          const { data: dna } = await admin.from("company_dna").select("*").eq("client_id", job.client_id).maybeSingle();
          const dnaRow = (dna ?? {}) as Record<string, unknown>;
          const fields = ["company_name", "founders", "location", "phone", "email", "services", "values", "target_demographic", "client_type"] as const;
          const empty = fields.filter((f) => !dnaRow[f]);
          if (empty.length && process.env.OPENROUTER_API_KEY) {
            const { text, tokens } = await llm(
              MAP_MODEL,
              `Extract company profile fields from the dossier. Return ONLY a JSON object with these keys (string values, or null if genuinely unknown): ${empty.join(", ")}. No markdown fences.`,
              dossier.slice(0, 12000),
              800,
            );
            patch.tokens_used = (patch.tokens_used as number ?? job.tokens_used) + tokens;
            try {
              const extracted = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()) as Record<string, unknown>;
              const updates: Record<string, unknown> = {};
              for (const f of empty) {
                if (typeof extracted[f] === "string" && (extracted[f] as string).trim()) updates[f] = extracted[f];
              }
              if (!dnaRow.website) updates.website = job.url;
              if (Object.keys(updates).length) {
                if (dna) {
                  await admin.from("company_dna").update({ ...updates, updated_at: new Date().toISOString() }).eq("client_id", job.client_id);
                } else {
                  await admin.from("company_dna").insert({ client_id: job.client_id, ...updates });
                }
              }
            } catch { /* unparseable extraction — skip DNA fill, not worth failing the job */ }
          }
        } catch { /* DNA fill is best-effort */ }

        // Don't persist the bulky intermediates once the job is done.
        meta.dossier_text = undefined;
        meta.notes = [];
        patch.status = "done";
      }
    }
  } catch (err) {
    patch.status = "error";
    patch.error = err instanceof Error ? err.message : "Unexpected error while advancing the crawl.";
  }

  patch.meta = meta;
  patch.updated_at = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("crawl_jobs")
    .update({ ...patch, lease_token: null, lease_until: null })
    .eq("id", job.id)
    .eq("lease_token", leaseToken)
    .select("*")
    .maybeSingle();
  if (updateError) return serverError(updateError);
  if (!updated) {
    // The lease expired and another worker claimed the job. Never overwrite its
    // checkpoint; return its current state and let the next UI poll continue.
    const { data: current } = await admin.from("crawl_jobs").select("*").eq("id", job.id).maybeSingle();
    return NextResponse.json({ job: current ?? loadedJob, leaseLost: true });
  }

  // Crawls take minutes — tell whoever started it when it lands (or fails).
  if ((patch.status === "done" || patch.status === "error") && job.created_by) {
    const host = (() => { try { return new URL(job.url).hostname; } catch { return job.url; } })();
    const { data: creator } = await admin.from("users").select("role").eq("id", job.created_by).maybeSingle();
    const isSuper = (creator as { role: string } | null)?.role === "super_admin";
    void notify([job.created_by], {
      clientId: job.client_id,
      type: patch.status === "done" ? "crawl_done" : "crawl_failed",
      title: patch.status === "done"
        ? `Site crawl complete — ${host}`
        : `Site crawl failed — ${host}`,
      body: patch.status === "done" ? "Pages stored, dossier ready. Spot-check it with your golden questions." : String(patch.error ?? ""),
      href: isSuper ? `/admin/vault?client=${job.client_id}` : "/vault",
    });
  }

  return NextResponse.json({ job: updated });
});
