/**
 * Tools hub registry — the single source the category and tool grids render
 * from. Adding a tool = one entry here + one API route + one result component.
 * `ready: false` shows as "Coming soon" so the roadmap is visible.
 */
import {
  Tag, MapPin, FileSearch, ClipboardCheck, Search, Share2,
  CalendarDays, Recycle, MessageCircle, Zap, Mails, Megaphone,
  GalleryHorizontalEnd, Hash, Send, Mail, Repeat, User, Inbox, type LucideIcon,
} from "lucide-react";

export interface ToolDef {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  ready: boolean;
  /** Uses Company DNA grounding — show the "fill DNA" nudge when it's empty. */
  grounded?: boolean;
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
  { slug: "gbp", title: "Google Business Profile Post", description: "Local-SEO posts for the week's topic, in the client's voice.", icon: MapPin, ready: true, grounded: true },
  { slug: "keyword-brief", title: "Keyword Brief Generator", description: "Full content brief: intent, headings, entities, FAQ schema.", icon: FileSearch, ready: true, grounded: true },
  { slug: "content-auditor", title: "Content Auditor", description: "Scored audit — thin content, keyword gaps, readability, links.", icon: ClipboardCheck, ready: true },
];

const SOCIAL_TOOLS: ToolDef[] = [
  { slug: "calendar", title: "30-Day Content Calendar", description: "A month of post ideas with hooks — formats and pillars varied.", icon: CalendarDays, ready: true, grounded: true },
  { slug: "repurposer", title: "Post Repurposer", description: "One blog post → LinkedIn, Facebook, IG caption + 3 video scripts.", icon: Recycle, ready: true, grounded: true },
  { slug: "reply-assistant", title: "Comment & DM Replies", description: "Paste what came in, get 3 on-brand reply options.", icon: MessageCircle, ready: true, grounded: true },
  { slug: "hooks", title: "Hook Rewriter", description: "Paste a flat post, get 10 scroll-stopping first lines.", icon: Zap, ready: true, grounded: true },
  { slug: "newsletter", title: "Email Newsletter", description: "Subject, preview text and a ready-to-send body.", icon: Mails, ready: true, grounded: true },
  { slug: "ad-copy", title: "Ad Copy Generator", description: "5 ad variants within Google/Meta character limits.", icon: Megaphone, ready: true, grounded: true },
  { slug: "carousel", title: "Carousel Breakdown", description: "A topic or article → slide-by-slide carousel + caption.", icon: GalleryHorizontalEnd, ready: true, grounded: true },
  { slug: "hashtags", title: "Hashtag Researcher", description: "A balanced hashtag mix by reach tier.", icon: Hash, ready: true, grounded: true },
];

const COLD_TOOLS: ToolDef[] = [
  { slug: "spintax", title: "Spintax Email Builder", description: "A campaign brief → an on-brand cold email with spintax variations baked in.", icon: Mail, ready: true, grounded: true },
  { slug: "follow-up", title: "Follow-up Sequence Generator", description: "Paste the initial email, get a 4-touch follow-up sequence.", icon: Repeat, ready: true, grounded: true },
  { slug: "personalisation", title: "Personalisation Line Writer", description: "Paste a prospect's About text, get 3 custom first lines.", icon: User, ready: true },
  { slug: "reply-classifier", title: "Reply Classifier + Response Drafter", description: "Paste a reply — it classifies the intent and drafts your response.", icon: Inbox, ready: true, grounded: true },
];

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: "seo", title: "SEO", description: "Briefs, metadata, local posts and content audits.", icon: Search, tools: SEO_TOOLS },
  { id: "social", title: "Social Media", description: "Calendars, repurposing, replies and hooks.", icon: Share2, tools: SOCIAL_TOOLS },
  { id: "outreach", title: "Cold Outreach", description: "Spintax emails, follow-up sequences, personalisation and reply triage.", icon: Send, tools: COLD_TOOLS },
];

export function getCategory(id: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((c) => c.id === id);
}
export function getTool(categoryId: string, slug: string): ToolDef | undefined {
  return getCategory(categoryId)?.tools.find((t) => t.slug === slug);
}
