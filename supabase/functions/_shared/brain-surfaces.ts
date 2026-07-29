export const BRAIN_SURFACES = [
  "content",
  "vault_answer",
  "compose",
  "tool",
  "kb",
  "email",
  "social",
  "blog",
  "newsletter",
  "all",
] as const;

export type BrainSurface = (typeof BRAIN_SURFACES)[number];

const SURFACE_SET = new Set<string>(BRAIN_SURFACES);

const SURFACE_ALIASES: Record<string, BrainSurface> = {
  ask: "vault_answer",
  vault: "vault_answer",
  content_topic: "content",
  content_draft: "content",
  content_outcome: "content",
  linkedin: "social",
  facebook: "social",
  instagram: "social",
};

const SIGNAL_SURFACES: Record<BrainSurface, string[]> = {
  content: ["content", "content_topic", "content_draft", "content_outcome"],
  vault_answer: ["vault_answer", "ask", "vault"],
  compose: ["compose"],
  tool: ["tool"],
  kb: ["kb"],
  email: ["email"],
  social: ["social"],
  blog: ["blog"],
  newsletter: ["newsletter"],
  all: [],
};

export function normalizeBrainSurface(value: unknown): BrainSurface | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized in SURFACE_ALIASES) return SURFACE_ALIASES[normalized];
  return SURFACE_SET.has(normalized) ? normalized as BrainSurface : null;
}

export function normalizeBrainScopes(values: unknown[]): BrainSurface[] {
  const normalized = Array.from(
    new Set(values.map(normalizeBrainSurface).filter((value): value is BrainSurface => value !== null)),
  );
  return normalized.includes("all") ? ["all"] : normalized;
}

export function memoryAppliesToSurfaces(
  scope: { surfaces?: unknown[] } | null | undefined,
  requestedSurfaces: unknown[],
): boolean {
  if (!scope || !Object.prototype.hasOwnProperty.call(scope, "surfaces")) return true;
  const raw = scope.surfaces;
  if (!Array.isArray(raw)) return false;
  if (raw.length === 0) return true;

  const stored = normalizeBrainScopes(raw);
  if (stored.includes("all")) return true;
  if (stored.length === 0) return false;

  const requested = new Set(normalizeBrainScopes(requestedSurfaces));
  return stored.some((surface) => requested.has(surface));
}

export function signalSurfacesFor(requestedSurfaces: unknown[]): string[] {
  const requested = normalizeBrainScopes(requestedSurfaces);
  if (requested.includes("all")) {
    return Array.from(new Set(Object.values(SIGNAL_SURFACES).flat()));
  }
  return Array.from(new Set(requested.flatMap((surface) => SIGNAL_SURFACES[surface])));
}
