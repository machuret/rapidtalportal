"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FilePlus2,
  History,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/LocalTime";
import {
  businessLibraryCreateSchema,
  businessLibraryUpdateSchema,
  businessLibraryValidationMessage,
  isLibraryReviewDue,
  slugifyLibraryTitle,
  type BusinessLibraryCategory,
  type BusinessLibraryEntryDetail,
  type BusinessLibraryEntrySummary,
  type BusinessLibraryVersion,
  type LibraryTransition,
  type LibraryVersionStatus,
} from "@/lib/business-library/shared";

export interface BusinessLibraryInitialData {
  categories: BusinessLibraryCategory[];
  entries: BusinessLibraryEntrySummary[];
}

interface EntryResponse {
  entry: BusinessLibraryEntryDetail;
  versionId?: string;
  indexing?: "not_requested" | "complete" | "incomplete" | "recoverable_failure";
}

interface LibraryFormState {
  slug: string;
  categoryId: string;
  title: string;
  summary: string;
  body: string;
  sourceUrl: string;
  tags: string;
  industries: string;
  countries: string;
  audiences: string;
  lifecycleStages: string;
  channels: string;
  timeSensitive: boolean;
  validFrom: string;
  validUntil: string;
  reviewDueAt: string;
  changeNote: string;
}

const EMPTY_FORM: LibraryFormState = {
  slug: "",
  categoryId: "",
  title: "",
  summary: "",
  body: "",
  sourceUrl: "",
  tags: "",
  industries: "",
  countries: "",
  audiences: "",
  lifecycleStages: "",
  channels: "",
  timeSensitive: false,
  validFrom: "",
  validUntil: "",
  reviewDueAt: "",
  changeNote: "",
};

const STATUS_LABEL: Record<LibraryVersionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  superseded: "Superseded",
  retired: "Retired",
};

const STATUS_CLASS: Record<LibraryVersionStatus, string> = {
  draft: "border-zinc-700 bg-zinc-800 text-zinc-300",
  in_review: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  superseded: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  retired: "border-red-500/30 bg-red-500/10 text-red-300",
};

type StatusFilter = "all" | "draft" | "in_review" | "published" | "review_due" | "retired";

function commaList(value: string): string[] {
  return [...new Set(
    value.split(",").map((item) => item.trim()).filter(Boolean),
  )].slice(0, 30);
}

function datePart(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function formFromVersion(version: BusinessLibraryVersion, slug: string): LibraryFormState {
  return {
    slug,
    categoryId: version.categoryId,
    title: version.title,
    summary: version.summary,
    body: version.body,
    sourceUrl: version.sourceUrl ?? "",
    tags: version.tags.join(", "),
    industries: version.industries.join(", "),
    countries: version.countries.join(", "),
    audiences: version.audiences.join(", "),
    lifecycleStages: version.lifecycleStages.join(", "),
    channels: version.channels.join(", "),
    timeSensitive: version.timeSensitive,
    validFrom: version.validFrom ?? "",
    validUntil: version.validUntil ?? "",
    reviewDueAt: datePart(version.reviewDueAt),
    changeNote: version.changeNote ?? "",
  };
}

function versionForDisplay(entry: BusinessLibraryEntrySummary): BusinessLibraryVersion | null {
  return entry.workingVersion ?? entry.publishedVersion;
}

function entryStatus(entry: BusinessLibraryEntrySummary): LibraryVersionStatus {
  if (entry.workingVersion) return entry.workingVersion.status;
  if (entry.retiredAt) return "retired";
  return entry.publishedVersion?.status ?? "draft";
}

function payload(form: LibraryFormState) {
  return {
    categoryId: form.categoryId,
    title: form.title,
    summary: form.summary,
    body: form.body,
    sourceUrl: form.sourceUrl,
    tags: commaList(form.tags),
    industries: commaList(form.industries),
    countries: commaList(form.countries),
    audiences: commaList(form.audiences),
    lifecycleStages: commaList(form.lifecycleStages),
    channels: commaList(form.channels),
    timeSensitive: form.timeSensitive,
    validFrom: form.validFrom,
    validUntil: form.validUntil,
    reviewDueAt: form.reviewDueAt
      ? `${form.reviewDueAt}T00:00:00.000Z`
      : "",
    changeNote: form.changeNote.trim() || null,
  };
}

export function BusinessLibraryAdmin({
  initialData,
  initialDetail,
}: {
  initialData?: BusinessLibraryInitialData;
  initialDetail?: BusinessLibraryEntryDetail;
} = {}) {
  const [entries, setEntries] = useState<BusinessLibraryEntrySummary[]>(initialData?.entries ?? []);
  const [categories, setCategories] = useState<BusinessLibraryCategory[]>(initialData?.categories ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDetail?.id ?? initialData?.entries[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<BusinessLibraryEntryDetail | null>(initialDetail ?? null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LibraryFormState>(() => {
    const version = initialDetail?.workingVersion ?? initialDetail?.publishedVersion;
    return version
      ? formFromVersion(version, initialDetail?.slug ?? "")
      : {
          ...EMPTY_FORM,
          categoryId: initialData?.categories.find((category) => category.isActive)?.id ?? "",
        };
  });
  const [loading, setLoading] = useState(!initialData);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<LibraryTransition | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const loadList = useCallback(async (preferredId?: string) => {
    try {
      const result = await api.get<BusinessLibraryInitialData>(
        ROUTES.admin.library(),
        { showErrorToast: false },
      );
      setEntries(result.entries);
      setCategories(result.categories);
      setForm((current) => current.categoryId
        ? current
        : { ...current, categoryId: result.categories.find((category) => category.isActive)?.id ?? "" });
      setSelectedId((current) => preferredId ?? current ?? result.entries[0]?.id ?? null);
    } catch (error) {
      toast.error(errorMessage(error, "The Business Library could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (entryId: string) => {
    setLoadingDetail(true);
    try {
      const result = await api.get<EntryResponse>(
        ROUTES.admin.libraryEntry(entryId),
        { showErrorToast: false },
      );
      setDetail(result.entry);
      const editable = result.entry.workingVersion ?? result.entry.publishedVersion;
      if (editable) setForm(formFromVersion(editable, result.entry.slug));
    } catch (error) {
      toast.error(errorMessage(error, "That Library entry could not be loaded."));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData) void loadList();
  }, [initialData, loadList]);

  useEffect(() => {
    if (creating || !selectedId || detail?.id === selectedId) return;
    void loadDetail(selectedId);
  }, [creating, detail?.id, loadDetail, selectedId]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const version = versionForDisplay(entry);
      if (!version) return false;
      const status = entryStatus(entry);
      const matchesSearch = !query
        || version.title.toLowerCase().includes(query)
        || version.summary.toLowerCase().includes(query)
        || entry.slug.includes(query)
        || version.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesCategory = categoryFilter === "all" || version.categoryId === categoryFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "review_due"
          ? isLibraryReviewDue(version)
          : status === statusFilter);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, entries, search, statusFilter]);

  const stats = useMemo(() => ({
    draft: entries.filter((entry) => entry.workingVersion?.status === "draft").length,
    review: entries.filter((entry) => entry.workingVersion?.status === "in_review").length,
    published: entries.filter((entry) => !entry.retiredAt && entry.publishedVersion).length,
    due: entries.filter((entry) =>
      entry.publishedVersion && isLibraryReviewDue(entry.publishedVersion),
    ).length,
  }), [entries]);

  function beginCreate() {
    setCreating(true);
    setSelectedId(null);
    setDetail(null);
    setForm({
      ...EMPTY_FORM,
      categoryId: categories.find((category) => category.isActive)?.id ?? "",
    });
  }

  async function saveDraft() {
    if (saving) return;

    const draftPayload = creating
      ? {
          ...payload(form),
          slug: form.slug || slugifyLibraryTitle(form.title),
        }
      : {
          ...payload(form),
          versionId: detail?.workingVersion?.id ?? "",
        };
    const validation = creating
      ? businessLibraryCreateSchema.safeParse(draftPayload)
      : businessLibraryUpdateSchema.safeParse(draftPayload);
    if (!validation.success) {
      toast.error(businessLibraryValidationMessage(validation.error));
      return;
    }

    setSaving(true);
    try {
      if (creating) {
        const result = await api.post<EntryResponse>(
          ROUTES.admin.library(),
          draftPayload,
          { showErrorToast: false },
        );
        setCreating(false);
        setDetail(result.entry);
        setSelectedId(result.entry.id);
        await loadList(result.entry.id);
        toast.success("Library draft created.");
      } else if (detail?.workingVersion?.status === "draft") {
        const result = await api.patch<EntryResponse>(
          ROUTES.admin.libraryEntry(detail.id),
          draftPayload,
          { showErrorToast: false },
        );
        setDetail(result.entry);
        await loadList(result.entry.id);
        toast.success("Draft saved.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "The Library draft could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: LibraryTransition, versionId: string | null) {
    if (!detail || runningAction) return;
    if (action === "publish" && !confirm("Publish this reviewed version to the Business Library?")) return;
    if (action === "retire" && !confirm("Retire this Library entry? Its published history will be preserved.")) return;

    setRunningAction(action);
    try {
      const result = await api.post<EntryResponse>(
        ROUTES.admin.libraryAction(detail.id),
        { action, versionId },
        { showErrorToast: false },
      );
      setDetail(result.entry);
      const editable = result.entry.workingVersion ?? result.entry.publishedVersion;
      if (editable) setForm(formFromVersion(editable, result.entry.slug));
      await loadList(result.entry.id);
      const messages: Record<LibraryTransition, string> = {
        submit_review: "Draft submitted for review.",
        return_draft: "Returned to draft.",
        publish: "Published to the Business Library.",
        new_version: "A new draft version is ready.",
        retire: "Library entry retired.",
      };
      toast.success(messages[action]);
      if (action === "publish" && result.indexing === "recoverable_failure") {
        toast.warning("Published successfully, but semantic indexing is temporarily unavailable. Use Reindex Library to retry.");
      } else if (action === "publish" && result.indexing === "incomplete") {
        toast.warning("Published successfully. Some Library chunks still need semantic indexing; use Reindex Library to continue.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "The Library workflow could not be updated."));
    } finally {
      setRunningAction(null);
    }
  }

  async function reindexLibrary() {
    if (indexing) return;
    setIndexing(true);
    try {
      const result = await api.post<{ indexed: number; failed: number; remaining: number }>(
        ROUTES.admin.libraryIndex(), {}, { showErrorToast: false },
      );
      if (result.failed) toast.warning(`Indexed ${result.indexed}; ${result.failed} failed and can be retried.`);
      else toast.success(result.remaining ? `Indexed ${result.indexed}; ${result.remaining} remain for the next run.` : `Semantic Library index is complete (${result.indexed} updated).`);
    } catch (error) {
      toast.error(errorMessage(error, "Semantic Library indexing is temporarily unavailable."));
    } finally {
      setIndexing(false);
    }
  }

  if (loading) {
    return (
      <div className="surface-card flex min-h-80 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const activeVersion = detail?.workingVersion ?? detail?.publishedVersion ?? null;

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Drafts" value={stats.draft} icon={CircleDot} />
        <StatCard label="Awaiting review" value={stats.review} icon={Clock3} tone="amber" />
        <StatCard label="Published" value={stats.published} icon={BookOpenCheck} tone="emerald" />
        <StatCard label="Review due" value={stats.due} icon={CalendarClock} tone={stats.due ? "red" : "zinc"} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, summary, slug or tag…"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="published">Published</option>
          <option value="review_due">Review due</option>
          <option value="retired">Retired</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <Button onClick={beginCreate} className="gap-2">
          <FilePlus2 className="h-4 w-4" /> New entry
        </Button>
        <Button variant="outline" onClick={reindexLibrary} disabled={indexing} className="gap-2 border-zinc-700">
          {indexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reindex Library
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <aside className="surface-card min-w-0 overflow-hidden lg:sticky lg:top-5">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {filteredEntries.length} entr{filteredEntries.length === 1 ? "y" : "ies"}
            </p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="text-zinc-500 transition-colors hover:text-white"
              aria-label="Refresh Library"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-screen divide-y divide-zinc-800/70 overflow-y-auto">
            {filteredEntries.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-zinc-600">
                No Library entries match these filters.
              </p>
            )}
            {filteredEntries.map((entry) => {
              const version = versionForDisplay(entry);
              if (!version) return null;
              const status = entryStatus(entry);
              const category = categories.find((item) => item.id === version.categoryId);
              const selected = entry.id === selectedId && !creating;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(entry.id);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                    selected ? "bg-zinc-800/80" : "hover:bg-zinc-800/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-100">{version.title}</p>
                      {isLibraryReviewDue(version) && (
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-400" aria-label="Review due" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{version.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={status} />
                      <span className="text-2xs text-zinc-600">{category?.name ?? "Uncategorised"} · v{version.versionNumber}</span>
                      {entry.workingVersion && entry.publishedVersion && (
                        <span className="text-2xs text-emerald-400">v{entry.publishedVersion.versionNumber} live</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-700" />
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 lg:col-span-2">
          {loadingDetail ? (
            <div className="surface-card flex min-h-80 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : creating ? (
            <LibraryEditor
              form={form}
              setForm={setForm}
              categories={categories}
              mode="create"
              saving={saving}
              onSave={saveDraft}
              onCancel={() => {
                setCreating(false);
                setSelectedId(entries[0]?.id ?? null);
              }}
            />
          ) : detail && activeVersion ? (
            <LibraryEditor
              form={form}
              setForm={setForm}
              categories={categories}
              mode={activeVersion.status}
              saving={saving}
              onSave={saveDraft}
              detail={detail}
              runningAction={runningAction}
              onAction={runAction}
            />
          ) : (
            <div className="surface-card flex min-h-80 flex-col items-center justify-center px-8 text-center">
              <BookOpenCheck className="h-8 w-8 text-zinc-700" />
              <p className="mt-3 font-medium text-zinc-300">Start the Business Library</p>
              <p className="mt-1 max-w-md text-sm text-zinc-500">
                Add reviewed expertise that every Company Brain can eventually apply without mixing customer knowledge.
              </p>
              <Button onClick={beginCreate} className="mt-5 gap-2">
                <FilePlus2 className="h-4 w-4" /> Create the first entry
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "zinc",
}: {
  label: string;
  value: number;
  icon: typeof CircleDot;
  tone?: "zinc" | "amber" | "emerald" | "red";
}) {
  const tones = {
    zinc: "text-zinc-500",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    red: "text-red-400",
  };
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{label}</p>
        <Icon className={cn("h-4 w-4", tones[tone])} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: LibraryVersionStatus }) {
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide",
      STATUS_CLASS[status],
    )}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function LibraryEditor({
  form,
  setForm,
  categories,
  mode,
  saving,
  onSave,
  onCancel,
  detail,
  runningAction,
  onAction,
}: {
  form: LibraryFormState;
  setForm: React.Dispatch<React.SetStateAction<LibraryFormState>>;
  categories: BusinessLibraryCategory[];
  mode: "create" | LibraryVersionStatus;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
  detail?: BusinessLibraryEntryDetail;
  runningAction?: LibraryTransition | null;
  onAction?: (action: LibraryTransition, versionId: string | null) => void;
}) {
  const editable = mode === "create" || mode === "draft";
  const working = detail?.workingVersion ?? null;
  const published = detail?.publishedVersion ?? null;
  const currentVersion = working ?? published;

  function update<K extends keyof LibraryFormState>(key: K, value: LibraryFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "title" && mode === "create" && !current.slug
        ? { slug: slugifyLibraryTitle(String(value)) }
        : {}),
    }));
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-zinc-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="label-section">
                {mode === "create" ? "New Library entry" : `Version ${currentVersion?.versionNumber ?? ""}`}
              </p>
              {mode !== "create" && <StatusPill status={mode} />}
              {published && working && (
                <span className="text-xs text-emerald-400">Version {published.versionNumber} remains live</span>
              )}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {mode === "create" ? "Author expert guidance" : form.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {editable
                ? "Save freely as a draft. Review freezes the content before publication."
                : mode === "in_review"
                  ? "This review copy is frozen. Return it to draft to make changes."
                  : "Published and historical versions are immutable."}
            </p>
          </div>
          {detail && (
            <div className="text-right">
              <p className="font-mono text-2xs text-zinc-600">{detail.slug}</p>
              <p className="mt-1 text-2xs text-zinc-600">
                Updated <LocalTime value={detail.updatedAt} />
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              disabled={!editable}
              placeholder="e.g. Local SEO foundation checklist"
            />
          </Field>
          <Field label="Category">
            <select
              value={form.categoryId}
              onChange={(event) => update("categoryId", event.target.value)}
              disabled={!editable}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 disabled:opacity-60"
            >
              <option value="">Choose a category</option>
              {categories.filter((category) => category.isActive).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {mode === "create" && (
          <Field label="Slug" hint="Permanent internal identifier">
            <Input
              value={form.slug}
              onChange={(event) => update("slug", slugifyLibraryTitle(event.target.value))}
              placeholder="local-seo-foundation"
            />
          </Field>
        )}

        <Field label="Summary" hint="What this guidance helps a business decide or do">
          <textarea
            value={form.summary}
            onChange={(event) => update("summary", event.target.value)}
            disabled={!editable}
            rows={3}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-orange-500/60 disabled:opacity-60"
          />
        </Field>

        <Field label="Library guidance" hint="Markdown supported · minimum 50 characters">
          <textarea
            value={form.body}
            onChange={(event) => update("body", event.target.value)}
            disabled={!editable}
            rows={18}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-mono text-xs leading-6 text-zinc-100 outline-none focus:border-orange-500/60 disabled:opacity-60"
          />
          <p className="mt-1 text-right text-2xs text-zinc-600">{form.body.length.toLocaleString()} characters</p>
        </Field>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Tags className="h-4 w-4 text-orange-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">Applicability</p>
              <p className="text-xs text-zinc-600">Comma-separated. Blank means broadly applicable.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tags">
              <Input value={form.tags} onChange={(event) => update("tags", event.target.value)} disabled={!editable} placeholder="technical SEO, checklist" />
            </Field>
            <Field label="Industries">
              <Input value={form.industries} onChange={(event) => update("industries", event.target.value)} disabled={!editable} placeholder="professional services, retail" />
            </Field>
            <Field label="Countries">
              <Input value={form.countries} onChange={(event) => update("countries", event.target.value)} disabled={!editable} placeholder="Australia, New Zealand" />
            </Field>
            <Field label="Audiences">
              <Input value={form.audiences} onChange={(event) => update("audiences", event.target.value)} disabled={!editable} placeholder="local customers, B2B buyers" />
            </Field>
            <Field label="Lifecycle stages">
              <Input value={form.lifecycleStages} onChange={(event) => update("lifecycleStages", event.target.value)} disabled={!editable} placeholder="startup, growth, mature" />
            </Field>
            <Field label="Channels">
              <Input value={form.channels} onChange={(event) => update("channels", event.target.value)} disabled={!editable} placeholder="website, Google, Facebook" />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">Source and freshness</p>
              <p className="text-xs text-zinc-600">Time-sensitive guidance must have a review or expiry date.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source URL">
              <Input value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} disabled={!editable} placeholder="https://…" />
            </Field>
            <Field label="Review due">
              <Input type="date" value={form.reviewDueAt} onChange={(event) => update("reviewDueAt", event.target.value)} disabled={!editable} />
            </Field>
            <Field label="Valid from">
              <Input type="date" value={form.validFrom} onChange={(event) => update("validFrom", event.target.value)} disabled={!editable} />
            </Field>
            <Field label="Valid until">
              <Input type="date" value={form.validUntil} onChange={(event) => update("validUntil", event.target.value)} disabled={!editable} />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <input
              type="checkbox"
              checked={form.timeSensitive}
              onChange={(event) => update("timeSensitive", event.target.checked)}
              disabled={!editable}
              className="mt-0.5 h-4 w-4 accent-orange-500"
            />
            <span>
              <span className="block text-sm text-zinc-300">Time-sensitive guidance</span>
              <span className="block text-xs text-zinc-600">Use for platform rules, legislation, pricing conventions or fast-changing practices.</span>
            </span>
          </label>
        </div>

        <Field label="Change note" hint="Explain what changed for the reviewer and version history">
          <Input
            value={form.changeNote}
            onChange={(event) => update("changeNote", event.target.value)}
            disabled={!editable}
            placeholder="Initial release, updated platform guidance…"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-5">
          {editable && (
            <Button onClick={onSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === "create" ? "Create draft" : "Save draft"}
            </Button>
          )}
          {mode === "create" && onCancel && (
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          )}
          {mode === "draft" && working && onAction && (
            <Button
              variant="outline"
              onClick={() => onAction("submit_review", working.id)}
              disabled={Boolean(runningAction)}
              className="gap-2"
            >
              {runningAction === "submit_review"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              Submit for review
            </Button>
          )}
          {mode === "in_review" && working && onAction && (
            <>
              <Button
                variant="outline"
                onClick={() => onAction("return_draft", working.id)}
                disabled={Boolean(runningAction)}
                className="gap-2"
              >
                <ArchiveRestore className="h-4 w-4" /> Return to draft
              </Button>
              <Button
                onClick={() => onAction("publish", working.id)}
                disabled={Boolean(runningAction)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500"
              >
                {runningAction === "publish"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4" />}
                Publish
              </Button>
            </>
          )}
          {(mode === "published" || mode === "retired") && detail && onAction && (
            <Button
              variant="outline"
              onClick={() => onAction("new_version", null)}
              disabled={Boolean(runningAction)}
              className="gap-2"
            >
              {runningAction === "new_version"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FilePlus2 className="h-4 w-4" />}
              Create new version
            </Button>
          )}
          {mode === "published" && published && onAction && (
            <Button
              variant="ghost"
              onClick={() => onAction("retire", published.id)}
              disabled={Boolean(runningAction)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              Retire entry
            </Button>
          )}
        </div>

        {detail && detail.versions.length > 0 && (
          <div className="border-t border-zinc-800 pt-5">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <History className="h-4 w-4" /> Version history
            </p>
            <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
              {detail.versions.map((version) => (
                <div key={version.id} className="flex flex-wrap items-center gap-3 bg-zinc-950/40 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-200">Version {version.versionNumber}</span>
                  <StatusPill status={version.status} />
                  <span className="text-xs text-zinc-600">
                    <LocalTime value={version.publishedAt ?? version.updatedAt} />
                  </span>
                  {version.changeNote && (
                    <span className="min-w-0 flex-1 truncate text-right text-xs text-zinc-500">{version.changeNote}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        {hint && <span className="text-2xs text-zinc-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
