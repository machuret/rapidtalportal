/**
 * Tools hub registry — the single source the category and tool grids render
 * from. Adding a tool = one entry here + one API route + one result component.
 * `ready: false` shows as "Coming soon" so the roadmap is visible.
 */
import {
  Tag, MapPin, FileSearch, ClipboardCheck, Search, Share2,
  CalendarDays, Recycle, MessageCircle, Zap, type LucideIcon,
} from "lucide-react";

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
  { slug: "keyword-brief", title: "Keyword Brief Generator", description: "Full content brief: intent, headings, entities, FAQ schema.", icon: FileSearch, ready: true },
  { slug: "content-auditor", title: "Content Auditor", description: "Scored audit — thin content, keyword gaps, readability, links.", icon: ClipboardCheck, ready: true },
];

const SOCIAL_TOOLS: ToolDef[] = [
  { slug: "calendar", title: "30-Day Content Calendar", description: "A month of post ideas with hooks — formats and pillars varied.", icon: CalendarDays, ready: true },
  { slug: "repurposer", title: "Post Repurposer", description: "One blog post → LinkedIn, Facebook, IG caption + 3 video scripts.", icon: Recycle, ready: true },
  { slug: "reply-assistant", title: "Comment & DM Replies", description: "Paste what came in, get 3 on-brand reply options.", icon: MessageCircle, ready: true },
  { slug: "hooks", title: "Hook Rewriter", description: "Paste a flat post, get 10 scroll-stopping first lines.", icon: Zap, ready: true },
];

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: "seo", title: "SEO", description: "Briefs, metadata, local posts and content audits.", icon: Search, tools: SEO_TOOLS },
  { id: "social", title: "Social Media", description: "Calendars, repurposing, replies and hooks.", icon: Share2, tools: SOCIAL_TOOLS },
];

export function getCategory(id: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((c) => c.id === id);
}
export function getTool(categoryId: string, slug: string): ToolDef | undefined {
  return getCategory(categoryId)?.tools.find((t) => t.slug === slug);
}
