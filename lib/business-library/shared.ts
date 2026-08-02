import { z } from "zod";

export const LIBRARY_VERSION_STATUSES = [
  "draft",
  "in_review",
  "published",
  "superseded",
  "retired",
] as const;

export const LIBRARY_TRANSITIONS = [
  "submit_review",
  "return_draft",
  "publish",
  "new_version",
  "retire",
] as const;

export type LibraryVersionStatus = typeof LIBRARY_VERSION_STATUSES[number];
export type LibraryTransition = typeof LIBRARY_TRANSITIONS[number];

export interface BusinessLibraryCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface BusinessLibraryVersion {
  id: string;
  entryId: string;
  versionNumber: number;
  status: LibraryVersionStatus;
  categoryId: string;
  title: string;
  summary: string;
  body: string;
  sourceUrl: string | null;
  tags: string[];
  industries: string[];
  countries: string[];
  audiences: string[];
  lifecycleStages: string[];
  channels: string[];
  timeSensitive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  reviewDueAt: string | null;
  changeNote: string | null;
  contentHash: string;
  createdBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessLibraryEntrySummary {
  id: string;
  slug: string;
  currentVersionId: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  workingVersion: BusinessLibraryVersion | null;
  publishedVersion: BusinessLibraryVersion | null;
}

export interface BusinessLibraryEntryDetail extends BusinessLibraryEntrySummary {
  versions: BusinessLibraryVersion[];
}

const shortList = z.array(
  z.string().trim().min(1).max(120),
).max(30).default([]);

const optionalUrl = z.string()
  .trim()
  .max(2000, { message: "Enter a source URL shorter than 2,000 characters." })
  .transform((value) => {
    if (!value) return null;
    return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  })
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:")
        && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, { message: "Enter a valid source URL, for example https://example.com." });

const optionalDate = z.string()
  .trim()
  .refine(
    (value) => !value || z.iso.date().safeParse(value).success,
    { message: "Enter a valid date." },
  )
  .transform((value) => value || null);

const optionalTimestamp = z.string()
  .trim()
  .refine(
    (value) => !value
      || z.iso.date().safeParse(value).success
      || z.iso.datetime({ offset: true }).safeParse(value).success,
    { message: "Enter a valid review date." },
  )
  .transform((value) => {
    if (!value) return null;
    return value.length === 10 ? `${value}T00:00:00.000Z` : value;
  });

const LIBRARY_FIELD_LABELS: Record<string, string> = {
  categoryId: "Category",
  title: "Title",
  slug: "Slug",
  summary: "Summary",
  body: "Library guidance",
  sourceUrl: "Source URL",
  tags: "Tags",
  industries: "Industries",
  countries: "Countries",
  audiences: "Audiences",
  lifecycleStages: "Lifecycle stages",
  channels: "Channels",
  validFrom: "Valid from",
  validUntil: "Valid until",
  reviewDueAt: "Review due",
  changeNote: "Change note",
  versionId: "Version",
};

export function businessLibraryValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the Library entry and try again.";
  const field = typeof issue.path[0] === "string"
    ? LIBRARY_FIELD_LABELS[issue.path[0]]
    : null;
  return field ? `${field}: ${issue.message}` : issue.message;
}

export const businessLibraryInputSchema = z.object({
  categoryId: z.uuid({ message: "Choose a Library category." }),
  title: z.string().trim()
    .min(3, { message: "Enter at least 3 characters." })
    .max(300, { message: "Keep the title under 300 characters." }),
  summary: z.string().trim()
    .min(10, { message: "Enter at least 10 characters." })
    .max(2000, { message: "Keep the summary under 2,000 characters." }),
  body: z.string().trim()
    .min(50, { message: "Enter at least 50 characters." })
    .max(100000, { message: "Keep the guidance under 100,000 characters." }),
  sourceUrl: optionalUrl.default(""),
  tags: shortList,
  industries: shortList,
  countries: shortList,
  audiences: shortList,
  lifecycleStages: shortList,
  channels: shortList,
  timeSensitive: z.boolean().default(false),
  validFrom: optionalDate.default(""),
  validUntil: optionalDate.default(""),
  reviewDueAt: optionalTimestamp.default(""),
  changeNote: z.string().trim().max(2000).nullable().default(null),
}).superRefine((value, context) => {
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
    context.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "The valid-until date cannot be before the valid-from date.",
    });
  }
  if (value.timeSensitive && !value.reviewDueAt && !value.validUntil) {
    context.addIssue({
      code: "custom",
      path: ["reviewDueAt"],
      message: "Time-sensitive guidance needs a review date or a valid-until date.",
    });
  }
});

export const businessLibraryCreateSchema = businessLibraryInputSchema.extend({
  slug: z.string().trim()
    .min(3, { message: "Enter at least 3 letters or numbers." })
    .max(120, { message: "Keep the slug under 120 characters." })
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      { message: "Use lowercase letters, numbers and single hyphens only." },
    ),
});

export const businessLibraryUpdateSchema = businessLibraryInputSchema.extend({
  versionId: z.uuid(),
});

export const businessLibraryTransitionSchema = z.object({
  action: z.enum(LIBRARY_TRANSITIONS),
  versionId: z.uuid().nullable().default(null),
}).superRefine((value, context) => {
  if (value.action !== "new_version" && !value.versionId) {
    context.addIssue({
      code: "custom",
      path: ["versionId"],
      message: "This workflow action requires a version.",
    });
  }
});

export function slugifyLibraryTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function isLibraryReviewDue(
  version: Pick<BusinessLibraryVersion, "reviewDueAt" | "status">,
  now = new Date(),
): boolean {
  return version.status === "published"
    && Boolean(version.reviewDueAt)
    && new Date(version.reviewDueAt as string).getTime() <= now.getTime();
}
