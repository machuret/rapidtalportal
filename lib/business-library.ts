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

const optionalUrl = z.union([
  z.literal(""),
  z.url().max(2000),
]).transform((value) => value || null);

const optionalDate = z.union([
  z.literal(""),
  z.iso.date(),
]).transform((value) => value || null);

const optionalTimestamp = z.union([
  z.literal(""),
  z.iso.datetime({ offset: true }),
]).transform((value) => value || null);

export const businessLibraryInputSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(3).max(300),
  summary: z.string().trim().min(10).max(2000),
  body: z.string().trim().min(50).max(100000),
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
  slug: z.string().trim().min(3).max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
