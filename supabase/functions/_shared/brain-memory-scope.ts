export const BRAIN_MEMORY_SURFACES = ["ask", "content", "compose", "tool", "diagnostic"] as const;
export const BRAIN_MEMORY_CHANNELS = [
  "linkedin",
  "facebook",
  "instagram",
  "email",
  "blog",
  "newsletter",
] as const;

export type BrainMemorySurface = typeof BRAIN_MEMORY_SURFACES[number];
export type BrainMemoryChannel = typeof BRAIN_MEMORY_CHANNELS[number];

export interface BrainMemoryScope {
  surfaces?: BrainMemorySurface[];
  channels?: BrainMemoryChannel[];
  contentTypes?: string[];
  audiences?: string[];
  objectives?: string[];
  global?: boolean;
}

export interface BrainMemoryTask {
  surface: BrainMemorySurface;
  channel?: string;
  contentType?: string;
  audience?: string;
  objective?: string;
}

const SURFACES = new Set<string>(BRAIN_MEMORY_SURFACES);
const CHANNELS = new Set<string>(BRAIN_MEMORY_CHANNELS);
const LEGACY_SURFACES: Record<string, BrainMemorySurface | null> = {
  ask: "ask",
  vault: "ask",
  vault_answer: "ask",
  kb: "ask",
  content: "content",
  content_topic: "content",
  content_draft: "content",
  content_outcome: "content",
  compose: "compose",
  tool: "tool",
  diagnostic: "diagnostic",
  social: "content",
  email: "content",
  blog: "content",
  newsletter: "content",
  all: null,
};

function values(value: unknown, max = 30): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLocaleLowerCase())
      .filter(Boolean),
  )).slice(0, max);
}

/** Read both Phase 2 scopes and the flat legacy vocabulary during migration. */
export function normalizeBrainMemoryScope(value: unknown): BrainMemoryScope {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawSurfaces = values(raw.surfaces);
  const surfaces: BrainMemorySurface[] = [];
  const channels = values(raw.channels).filter((entry) => CHANNELS.has(entry)) as BrainMemoryChannel[];
  let global = raw.global === true || rawSurfaces.includes("all");

  for (const entry of rawSurfaces) {
    if (SURFACES.has(entry)) {
      surfaces.push(entry as BrainMemorySurface);
      continue;
    }
    const mapped = LEGACY_SURFACES[entry];
    if (mapped) surfaces.push(mapped);
    if (entry === "social") {
      for (const channel of ["linkedin", "facebook", "instagram"] as const) {
        if (!channels.includes(channel)) channels.push(channel);
      }
    } else if (CHANNELS.has(entry) && !channels.includes(entry as BrainMemoryChannel)) {
      channels.push(entry as BrainMemoryChannel);
    }
  }

  // An empty legacy scope meant global. New lessons should always submit at
  // least a surface and therefore never reach this compatibility branch.
  if (!Object.keys(raw).length) global = true;
  return {
    ...(surfaces.length ? { surfaces: Array.from(new Set(surfaces)) } : {}),
    ...(channels.length ? { channels } : {}),
    ...(values(raw.contentTypes).length ? { contentTypes: values(raw.contentTypes) } : {}),
    ...(values(raw.audiences).length ? { audiences: values(raw.audiences) } : {}),
    ...(values(raw.objectives).length ? { objectives: values(raw.objectives) } : {}),
    ...(global ? { global: true } : {}),
  };
}

function textMatches(expected: string[], actual: string | undefined): boolean {
  if (!expected.length) return true;
  if (!actual?.trim()) return false;
  const value = actual.trim().toLocaleLowerCase();
  return expected.some((entry) => value === entry || value.includes(entry) || entry.includes(value));
}

export function brainMemoryScopeMatches(scopeValue: unknown, task: BrainMemoryTask): boolean {
  const scope = normalizeBrainMemoryScope(scopeValue);
  if (scope.global) return true;
  if (scope.surfaces?.length && !scope.surfaces.includes(task.surface)) return false;
  if (scope.channels?.length && (!task.channel || !scope.channels.includes(task.channel as BrainMemoryChannel))) {
    return false;
  }
  return (
    textMatches(scope.contentTypes ?? [], task.contentType) &&
    textMatches(scope.audiences ?? [], task.audience) &&
    textMatches(scope.objectives ?? [], task.objective)
  );
}

export function brainMemoryScopeSpecificity(scopeValue: unknown): number {
  const scope = normalizeBrainMemoryScope(scopeValue);
  if (scope.global) return 0;
  const populated = [
    scope.surfaces,
    scope.channels,
    scope.contentTypes,
    scope.audiences,
    scope.objectives,
  ].filter((entry) => entry?.length).length;
  return Math.min(1, 0.2 + populated * 0.16);
}

function includesAll(next: string[] | undefined, previous: string[] | undefined): boolean {
  if (!previous?.length) return true;
  if (!next?.length) return false;
  return previous.every((entry) => next.includes(entry));
}

/** True when `next` can affect tasks that `previous` could not affect. */
export function isBrainMemoryScopeExpansion(previousValue: unknown, nextValue: unknown): boolean {
  const previous = normalizeBrainMemoryScope(previousValue);
  const next = normalizeBrainMemoryScope(nextValue);
  if (next.global && !previous.global) return true;
  if (previous.global) return false;
  return (
    !includesAll(next.surfaces, previous.surfaces) ||
    !includesAll(next.channels, previous.channels) ||
    !includesAll(next.contentTypes, previous.contentTypes) ||
    !includesAll(next.audiences, previous.audiences) ||
    !includesAll(next.objectives, previous.objectives)
  );
}
