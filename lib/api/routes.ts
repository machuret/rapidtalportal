/**
 * Typed registry of every internal API endpoint.
 *
 * Call sites import from here instead of hand-writing path strings. This is the
 * contract layer that prevents the class of bug where inconsistent paths
 * (`/kb/generate` vs `/api/admin/users`) silently 404. All paths are absolute
 * and include the `/api` prefix.
 */
export const ROUTES = {
  admin: {
    users: () => "/api/admin/users",
    client: (id: string) => `/api/admin/clients/${id}`,
    impersonate: () => "/api/admin/impersonate",
  },
  kb: {
    generate: () => "/api/kb/generate",
    entry: (id: string) => `/api/kb/entries/${id}`,
  },
  vault: {
    items: () => "/api/vault/items",
    recap: () => "/api/vault/recap",
    refreshDossier: () => "/api/vault/refresh-dossier",
    expand: () => "/api/vault/expand",
    unindexed: () => "/api/vault/unindexed",
    text: () => "/api/vault/text",
    url: () => "/api/vault/url",
    crawl: () => "/api/vault/crawl",
    crawlSite: () => "/api/vault/crawl-site",
    crawlSiteAdvance: () => "/api/vault/crawl-site/advance",
    upload: () => "/api/vault/upload",
    delete: () => "/api/vault/delete",
    ask: () => "/api/vault/ask",
    feedback: () => "/api/vault/feedback",
    promoteKb: () => "/api/vault/promote-kb",
    teach: () => "/api/vault/teach",
    gaps: () => "/api/vault/gaps",
    item: (id: string) => `/api/vault/${id}`,
    reprocess: (id: string) => `/api/vault/${id}/reprocess`,
  },
  sops: () => "/api/sops",
  sopFork: () => "/api/sops/fork",
  sopRun: () => "/api/sops/run",
  sopReorder: () => "/api/sops/reorder",
  crm: {
    contacts: () => "/api/crm/contacts",
    notes: () => "/api/crm/notes",
  },
  content: {
    pieces: () => "/api/content/pieces",
    generate: () => "/api/content/generate",
    topics: () => "/api/content/topics",
    topicsForClient: (clientId: string) => `/api/content/topics?client_id=${clientId}`,
    topicsGenerate: () => "/api/content/topics/generate",
  },
  tasks: () => "/api/tasks",
  access: () => "/api/access",
  accessReveal: () => "/api/access/reveal",
  accessReveals: () => "/api/access/reveals",
  timeEntries: () => "/api/time-entries",
  team: (id: string) => `/api/team/${id}`,
  profile: () => "/api/profile",
  messages: {
    send: () => "/api/messages/send",
  },
  dailyLog: {
    upsert: () => "/api/daily-log/upsert",
    notes: () => "/api/daily-log/notes",
    note: (id: string) => `/api/daily-log/notes?id=${id}`,
    feedback: () => "/api/daily-log/feedback",
  },
  companyDna: {
    base: () => "/api/company-dna",
    scrape: () => "/api/company-dna/scrape",
  },
} as const;
