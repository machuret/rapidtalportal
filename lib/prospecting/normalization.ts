import { createHash } from "node:crypto";
import type {
  NormalizedProspect,
  ProspectingFieldSource,
  ProspectingNormalizationContext,
  ProspectingSource,
} from "@/lib/prospecting/types";

export function cleanString(value: unknown, maxLength = 2_000): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/gu, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function cleanInteger(value: unknown): number | null {
  const parsed = cleanNumber(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

export function cleanUrl(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

export function cleanEmail(value: unknown): string | null {
  const email = cleanString(value, 320)?.toLowerCase() ?? null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null;
}

export function cleanPhone(value: unknown): string | null {
  const phone = cleanString(value, 80);
  if (!phone) return null;
  const digits = phone.replace(/\D/gu, "");
  return digits.length >= 8 && digits.length <= 15 ? phone : null;
}

export function canonicalWebsiteDomain(value: unknown): string | null {
  const url = cleanUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

export function canonicalLinkedinUrl(value: unknown): string | null {
  const url = cleanUrl(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
    if (host !== "linkedin.com") return null;
    parsed.hostname = "www.linkedin.com";
    parsed.search = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

export function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

export function firstEmail(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const email = cleanEmail(entry);
      if (email) return email;
    }
    return null;
  }
  return cleanEmail(value);
}

export function makeCanonicalKey(parts: Array<string | null | undefined>): string {
  const stable = parts.filter(Boolean).map((part) => part!.trim().toLowerCase()).join("|");
  return createHash("sha256").update(stable || "unknown").digest("hex");
}

export function sourceMetadata(
  source: ProspectingSource,
  actorId: string,
  adapterVersion: number,
  sourceUrl: string | null,
  context: ProspectingNormalizationContext,
): ProspectingFieldSource {
  return {
    source,
    actorId,
    actorBuildId: context.actorBuildId ?? null,
    adapterVersion,
    providerRunId: context.providerRunId ?? null,
    capturedAt: context.capturedAt ?? new Date().toISOString(),
    sourceUrl,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function deduplicateProspects(rows: NormalizedProspect[]): NormalizedProspect[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    // Only the strongest provider identity may collapse two rows. Supporting
    // signals such as a shared corporate domain or switchboard phone number
    // are useful review hints, but are unsafe automatic identities for
    // franchises and multi-location businesses.
    if (seen.has(row.canonicalKey)) return false;
    seen.add(row.canonicalKey);
    return true;
  });
}
