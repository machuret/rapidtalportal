export interface ClientNavigationDestination {
  label: string;
  href: string;
  group: "Home" | "Work" | "Create" | "Grow" | "Company" | "Coach" | "Access" | "Settings";
  description: string;
  /** Additional route prefixes that belong to this destination. */
  paths?: string[];
  /** Plain-language terms clients may search for. */
  keywords?: string[];
  /** Exact title of the matching client Guide item, when contextual help exists. */
  guideTitle?: string;
  /** Reachable only by client admins — VAs are redirected, so hide it from them. */
  adminOnly?: boolean;
}

/**
 * Canonical client-facing information architecture. The sidebar, command
 * palette and contextual Guide links all consume this list so a renamed or
 * moved feature cannot silently drift between those surfaces.
 */
export const CLIENT_NAVIGATION_DESTINATIONS: ClientNavigationDestination[] = [
  {
    label: "Home",
    href: "/dashboard",
    group: "Home",
    description: "See current work, starter progress and anything needing attention.",
    keywords: ["dashboard", "start", "attention", "setup"],
    guideTitle: "Home",
  },
  {
    label: "Tasks",
    href: "/tasks",
    group: "Work",
    description: "Request work, assign it and follow progress with your VA.",
    keywords: ["request", "delegate", "assign", "board", "todo", "work", "task", "job"],
    guideTitle: "Tasks",
  },
  {
    label: "Messages",
    href: "/messages",
    group: "Work",
    description: "Talk with your VA and keep shared decisions together.",
    keywords: ["chat", "conversation", "talk", "send", "team"],
    guideTitle: "Messages",
  },
  {
    label: "Notebook",
    href: "/notebook",
    group: "Work",
    description: "Keep shared notes, procedures and working documents.",
    keywords: ["notes", "meeting", "sop", "procedure", "documents", "write", "shared"],
    guideTitle: "Notebook",
  },
  {
    label: "Team",
    href: "/team",
    group: "Work",
    description: "See who is working with you and review delivery activity.",
    keywords: ["va", "people", "hours", "daily log", "supervision"],
    guideTitle: "Team",
    adminOnly: true,
  },
  {
    label: "Reports",
    href: "/reports",
    group: "Work",
    description: "Review delivered work and hours for a selected period.",
    keywords: ["results", "monthly", "summary", "hours"],
    guideTitle: "Reports",
    adminOnly: true,
  },
  {
    label: "Create content",
    href: "/content/quick",
    group: "Create",
    description: "Start a fast draft or discover company-informed ideas.",
    paths: ["/content/quick", "/content/ideas"],
    keywords: ["create", "write", "generate", "draft", "post", "article", "newsletter", "ideas", "linkedin", "facebook", "instagram", "email", "blog", "social"],
    guideTitle: "Create content",
  },
  {
    label: "In progress",
    href: "/content/projects",
    group: "Create",
    description: "Continue ideas, briefs and drafts that are not finished yet.",
    keywords: ["projects", "unfinished", "continue", "resume", "pipeline", "brief", "draft"],
    guideTitle: "Create content",
  },
  {
    label: "Content library",
    href: "/content/library",
    group: "Create",
    description: "Find drafts, approved content and archived work.",
    keywords: ["history", "draft", "approved", "approve", "archive", "export", "published", "content"],
    guideTitle: "Create content",
  },
  {
    label: "Find leads",
    href: "/lead-generation",
    group: "Grow",
    description: "Search for suitable businesses and review them before CRM.",
    keywords: ["find", "lead generation", "prospecting", "google maps", "linkedin", "search", "scrape", "businesses", "contacts"],
    guideTitle: "Find leads",
  },
  {
    label: "CRM",
    href: "/crm",
    group: "Grow",
    description: "Manage contacts, follow-ups and pipeline stages.",
    keywords: ["manage", "contacts", "contact", "email", "send", "sales", "pipeline", "follow up", "customer", "lead"],
    guideTitle: "CRM",
  },
  {
    label: "Competitor insights",
    href: "/competitors",
    group: "Grow",
    description: "Collect competitor content, analyse the market and find opportunities.",
    paths: ["/competitors", "/company-dna/competitors", "/content/competitors"],
    keywords: ["competitor", "competition", "market", "analysis", "articles", "posts", "linkedin", "website", "opportunities"],
    guideTitle: "Competitor insights",
  },
  {
    label: "Company profile",
    href: "/company-dna",
    group: "Company",
    description: "Keep your company, services, audience and priorities current.",
    keywords: ["dna", "company", "business", "information", "details", "services", "audience", "priorities", "update", "edit"],
    guideTitle: "Company profile",
  },
  {
    label: "Knowledge",
    href: "/vault",
    group: "Company",
    description: "Add and search the company material used by Coach and Content.",
    keywords: ["vault", "add", "upload", "import", "teach", "pdf", "file", "files", "document", "documents", "website", "sources", "knowledge"],
    guideTitle: "Knowledge",
  },
  {
    label: "Voice",
    href: "/content/style",
    group: "Company",
    description: "Add writing examples and approve how company content should sound.",
    keywords: ["style", "tone", "brand", "sound", "writing", "examples", "linkedin voice", "approve"],
    guideTitle: "Voice",
  },
  {
    label: "Coach",
    href: "/ask",
    group: "Coach",
    description: "Ask for guidance using your company and current work context.",
    keywords: ["ask", "brain", "question", "help", "assistant"],
    guideTitle: "Coach",
  },
  {
    label: "Access",
    href: "/access",
    group: "Access",
    description: "Share encrypted account access with the people who need it.",
    keywords: ["manage", "share", "password", "credentials", "login", "secure", "account", "access"],
    guideTitle: "Access",
  },
  {
    label: "Help & guide",
    href: "/guide",
    group: "Settings",
    description: "Search plain-English instructions for every client workflow.",
    keywords: ["help", "how to", "support", "tutorial"],
  },
  {
    label: "My profile",
    href: "/profile",
    group: "Settings",
    description: "Update your account details and preferences.",
    keywords: ["account", "settings", "name", "timezone"],
    guideTitle: "My profile",
  },
];

export const CLIENT_NAVIGATION_GROUPS = ["Work", "Create", "Grow", "Company", "Settings"] as const;

export function clientDestinationsForGroup(group: (typeof CLIENT_NAVIGATION_GROUPS)[number]) {
  return CLIENT_NAVIGATION_DESTINATIONS.filter((destination) => destination.group === group);
}

export function clientDestinationForPath(pathname: string) {
  return CLIENT_NAVIGATION_DESTINATIONS
    .flatMap((destination) => (destination.paths ?? [destination.href]).map((path) => ({ destination, path })))
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.destination ?? null;
}

export function searchClientDestinations(query: string) {
  const terms = searchTerms(query);
  if (terms.length === 0) return CLIENT_NAVIGATION_DESTINATIONS;

  return CLIENT_NAVIGATION_DESTINATIONS
    .map((destination, index) => {
      const label = normalizeSearchText(destination.label);
      const haystackText = normalizeSearchText([
      destination.label,
      destination.group,
      destination.description,
      ...(destination.keywords ?? []),
      ].join(" "));
      const haystackTerms = searchTerms(haystackText);
      let score = label === normalizeSearchText(query) ? 100 : 0;

      for (const term of terms) {
        const match = matchSearchTerm(term, haystackTerms);
        if (!match) return null;
        score += match === "exact" ? 10 : match === "partial" ? 6 : 2;
        if (label.includes(term)) score += 4;
      }

      if (haystackText.includes(normalizeSearchText(query))) score += 12;
      return { destination, index, score };
    })
    .filter((entry): entry is { destination: ClientNavigationDestination; index: number; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ destination }) => destination);
}

/** Shared intent matching for the command palette and the longer Guide. */
export function matchesClientSearch(query: string, values: string[]) {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const candidates = searchTerms(values.join(" "));
  return terms.every((term) => Boolean(matchSearchTerm(term, candidates)));
}

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "can", "for", "how", "i", "in", "me", "my", "of", "on", "or", "the", "to", "with"]);

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stemSearchTerm(term: string) {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 4 && term.endsWith("ed")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("es")) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith("s")) return term.slice(0, -1);
  return term;
}

function searchTerms(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((term) => term && !SEARCH_STOP_WORDS.has(term))
    .map(stemSearchTerm);
}

function matchSearchTerm(term: string, candidates: string[]): "exact" | "partial" | "fuzzy" | null {
  if (candidates.some((candidate) => candidate === term)) return "exact";
  if (candidates.some((candidate) => candidate.startsWith(term) || term.startsWith(candidate))) return "partial";
  if (term.length >= 5 && candidates.some((candidate) => candidate.length >= 5 && editDistanceAtMostOne(term, candidate))) return "fuzzy";
  return null;
}

/** One-character tolerance catches ordinary typing mistakes without allowing a
 * weak match to swamp a short, deterministic destination list. */
function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}
