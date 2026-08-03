export const CLIENT_DISCOVERY_KINDS = [
  "task",
  "notebook",
  "knowledge",
  "draft",
  "project",
  "competitor",
  "lead",
  "contact",
] as const;

export type ClientDiscoveryKind = (typeof CLIENT_DISCOVERY_KINDS)[number];

export interface ClientDiscoveryResult {
  id: string;
  kind: ClientDiscoveryKind;
  title: string;
  detail: string;
  status: string | null;
  href: string;
}
export interface ClientDiscoveryResponse {
  results: ClientDiscoveryResult[];
  partial: boolean;
  unavailableKinds: ClientDiscoveryKind[];
}

export function safeDiscoveryQuery(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s@.+-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80);
}
