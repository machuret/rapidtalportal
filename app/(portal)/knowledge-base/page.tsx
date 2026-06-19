import { redirect } from "next/navigation";

/**
 * The Knowledge Base now lives inside the Vault section (KB → Vault
 * consolidation): one Business Brain with Documents and Q&A Knowledge tabs.
 * This stub keeps old links and bookmarks working.
 */
export const dynamic = "force-dynamic";

export default function KnowledgeBaseRedirect() {
  redirect("/vault/knowledge");
}
