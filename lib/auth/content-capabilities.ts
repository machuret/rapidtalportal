import type { UserRole } from "@/types/database";

export const CONTENT_CAPABILITIES = [
  "manage_any_client",
  "manage_competitors",
  "collect_competitor_content",
  "edit_company_dna",
  "edit_style_profiles",
  "view_intelligence",
  "create_drafts",
  "edit_drafts",
  "approve_content",
] as const;

export type ContentCapability = typeof CONTENT_CAPABILITIES[number];

const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<ContentCapability>> = {
  super_admin: new Set(CONTENT_CAPABILITIES),
  client_admin: new Set([
    "manage_competitors",
    "collect_competitor_content",
    "edit_company_dna",
    "edit_style_profiles",
    "view_intelligence",
    "create_drafts",
    "edit_drafts",
    "approve_content",
  ]),
  va: new Set([
    "view_intelligence",
    "create_drafts",
    "edit_drafts",
  ]),
};

export function hasContentCapability(
  role: string,
  capability: ContentCapability,
): boolean {
  return role in ROLE_CAPABILITIES &&
    ROLE_CAPABILITIES[role as UserRole].has(capability);
}

export function rolesWithContentCapability(capability: ContentCapability): UserRole[] {
  return (Object.keys(ROLE_CAPABILITIES) as UserRole[])
    .filter((role) => ROLE_CAPABILITIES[role].has(capability));
}
