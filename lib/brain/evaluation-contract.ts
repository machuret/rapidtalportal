import { z } from "zod";
import {
  BRAIN_CONTEXT_CHANNELS,
  BRAIN_CONTEXT_VERSION,
  brainContextChannelSchema,
  brainContextSchema,
} from "./context-contract";

export const BRAIN_EVALUATION_CASE_TYPES = [
  "ask",
  "content_idea",
  "content_draft",
  "tool",
] as const;

export const brainEvaluationCaseSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(300),
  caseType: z.enum(BRAIN_EVALUATION_CASE_TYPES),
  channel: brainContextChannelSchema.nullable(),
  input: z.record(z.string(), z.unknown()),
  expected: z.object({
    companyFieldKeys: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    vaultItemIds: z.array(z.uuid()).max(100).default([]),
    memoryIds: z.array(z.uuid()).max(100).default([]),
    styleSource: z.enum([
      "project_snapshot",
      "approved_channel_analysis",
      "company_channel_style",
      "company_global_style",
      "generic_fallback",
    ]).nullable(),
    marketIncluded: z.boolean(),
    notes: z.string().trim().max(4000).nullable(),
  }),
  baseline: z.object({
    capturedAt: z.iso.datetime({ offset: true }),
    model: z.string().trim().min(1).max(200).nullable(),
    promptVersion: z.string().trim().min(1).max(200).nullable(),
    output: z.string().max(100000),
    context: brainContextSchema.nullable(),
    contextVersion: z.literal(BRAIN_CONTEXT_VERSION).nullable(),
  }),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

export const brainEvaluationLibrarySchema = z.object({
  version: z.literal(1),
  clientId: z.uuid(),
  clientLabel: z.string().trim().min(1).max(300),
  capturedAt: z.iso.datetime({ offset: true }),
  cases: z.array(brainEvaluationCaseSchema).min(1).max(500),
}).superRefine((library, context) => {
  const names = library.cases.map((entry) => entry.name.toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    context.addIssue({
      code: "custom",
      path: ["cases"],
      message: "Evaluation case names must be unique within a client library.",
    });
  }
});

export type BrainEvaluationCase = z.infer<typeof brainEvaluationCaseSchema>;
export type BrainEvaluationLibrary = z.infer<typeof brainEvaluationLibrarySchema>;

/** Stable discoverability for scripts and admin tooling added in later phases. */
export const BRAIN_EVALUATION_SUPPORTED_CHANNELS = BRAIN_CONTEXT_CHANNELS;
