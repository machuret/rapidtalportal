/**
 * Tools hub registry — the single source the category and tool grids render
 * from. Adding a tool = one entry here + one API route + one result component.
 * `ready: false` shows as "Coming soon" so the roadmap is visible.
 */
import { Tag, MapPin, FileSearch, ClipboardCheck, Search, type LucideIcon } from "lucide-react";

export interface ToolDef {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  ready: boolean;
}

export interface ToolCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tools: ToolDef[];
}

const SEO_TOOLS: ToolDef[] = [
  { slug: "meta", title: "Meta Title & Description", description: "5 CTR-optimised title/description variants, under the character limits.", icon: Tag, ready: true },
  { slug: "gbp", title: "Google Business Profile Post", description: "Local-SEO posts for the week's topic, in the client's voice.", icon: MapPin, ready: true },
  { slug: "keyword-brief", title: "Keyword Brief Generator", description: "Full content brief: intent, headings, entities, FAQ schema.", icon: FileSearch, ready: false },
  { slug: "content-auditor", title: "Content Auditor", description: "Scored audit — thin content, keyword gaps, readability, links.", icon: ClipboardCheck, ready: false },
];

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: "seo", title: "SEO", description: "Briefs, metadata, local posts and content audits.", icon: Search, tools: SEO_TOOLS },
];

export function getCategory(id: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((c) => c.id === id);
}
export function getTool(categoryId: string, slug: string): ToolDef | undefined {
  return getCategory(categoryId)?.tools.find((t) => t.slug === slug);
}
