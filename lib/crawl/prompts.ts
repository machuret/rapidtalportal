/**
 * Shared synthesis prompts so the crawl pipeline and the on-demand "refresh
 * briefings" endpoint produce the SAME kind of dossier (no drift between them).
 */

/** The reduce step: turn per-page notes/summaries into the company dossier. */
export function dossierSystemPrompt(host: string): string {
  return `You are writing the definitive company dossier for ${host}, used daily by virtual assistants answering real customer questions. Write 1500-3000 words of rich, structured markdown with these sections (omit any with no data): ## Company Overview, ## Products & Pricing, ## Shipping & Delivery, ## Returns & Warranty, ## Programs (trade/wholesale/etc.), ## Contact & Support, ## Brand Voice & Positioning, ## FAQs. Rules: every number (prices, thresholds, timeframes) must be quoted VERBATIM from the notes — never invent or round. Cite source URLs inline like (source: URL). Be specific and complete; a VA should be able to answer customer questions from this document alone.`;
}
