/**
 * Short "what is this section for" copy, in one place so it's easy to edit and
 * keep consistent. Each entry is 2-3 plain sentences aimed at VAs and clients —
 * not feature lists, just the purpose and why it matters.
 */
/** `guide` is the exact title of the matching item in the in-app Guide
 *  (lib/client-guide.ts / lib/va-guide.ts) so PageIntro can deep-link
 *  "Learn more →" straight to it (/guide?open=<title>). */
export interface IntroCopy { title: string; body: string; guide?: string }

export const PAGE_INTROS: Record<string, IntroCopy> = {
  vault: {
    title: "What is the Vault?",
    body: "The Vault holds your company knowledge — the documents, web pages and notes RapidTal can search when answering questions or creating content. Add a file, link or pasted text; RapidTal prepares it automatically and tells you if anything needs attention.",
    guide: "Vault",
  },
  ask: {
    title: "What is RapidTal Coach?",
    body: "Your role-aware Coach combines Company DNA, current permitted work, Vault evidence and published Business Library guidance. Your Coach history is visible only to you and retained for 12 months; short-lived diagnostic prompts expire after 30 days. Messages and tasks are never shared until you approve the preview.",
    guide: "RapidTal Coach",
  },
  compose: {
    title: "What is Compose?",
    body: "Compose writes emails, replies, and posts in your company's voice, grounded in the Vault so the details are accurate. Describe what you need (or paste a message to reply to), then refine the draft until it's right.",
    guide: "Compose",
  },
  tasks: {
    title: "What is the Tasks board?",
    body: "This is your team's shared board. Work a VA does shows up here for the client to follow in real time — drag cards between columns, assign people, and comment to keep each conversation on the card it belongs to.",
    guide: "Tasks",
  },
  access: {
    title: "What is Access?",
    body: "Access is a secure, encrypted store for the logins your team needs — site, username, and password. Passwords are encrypted and every reveal is logged, so VAs can get the access they need without anyone sharing credentials over chat.",
    guide: "Access",
  },
  sops: {
    title: "What are SOPs?",
    body: "SOPs are step-by-step guides for doing recurring work the right way every time. Browse the library, follow one in the runner, and your progress is recorded so admins can see what's been completed.",
    guide: "SOPs",
  },
  crm: {
    title: "What is the CRM?",
    body: "The CRM tracks contacts and leads through stages from lead to closed. Move contacts between columns as they progress, add notes, and every change is logged so the whole team stays in sync.",
    guide: "CRM",
  },
  "lead-generation": {
    title: "What is Lead Generation?",
    body: "Lead Generation finds businesses that match a target and keeps them in a review-first inbox. Searches continue safely in the background, duplicate results are recognized, and nothing is added to CRM until you choose it.",
    guide: "Lead Generation",
  },
  content: {
    title: "What is the Content studio?",
    body: "The Content studio creates marketing drafts using your Company Profile, company knowledge and approved voice. Start quickly from a topic or use the guided workflow, then edit, review and approve the result when it is ready.",
    guide: "Content",
  },
  "knowledge-base": {
    title: "What is the Knowledge Base?",
    body: "The Knowledge Base contains AI-generated Q&A drafts built from your Vault and Company DNA. Admins can review, edit or remove entries, and regenerate them as the Vault grows.",
  },
  "company-dna": {
    title: "What is Company DNA?",
    body: "Company DNA is your Company Profile — who you are, what you offer, your audience, priorities, voice and contacts. RapidTal applies it across Coach and Content, so keeping the essentials current improves every result. Client admins can edit it; VAs can view it.",
    guide: "Company DNA",
  },
  "company-report": {
    title: "What is the Company Report?",
    body: "The Company Report shows how complete your company brain is — what the AI knows across identity, services, policies and more, and where the gaps are. Use it to decide what to add to the Vault next.",
    guide: "Company Report",
  },
  "brain-analytics": {
    title: "What is Brain Analytics?",
    body: "Analytics is the detailed view inside Company Brain. It shows what people ask, whether retrieval succeeds and where company knowledge is still thin. Use it when you want to investigate a weak result; it is not required for everyday work.",
    guide: "Company Brain",
  },
  messages: {
    title: "What is Messages?",
    body: "Messages is your team's shared chat for this client. Everyone on the account sees the thread and new messages notify the team — keep work discussion here so nothing gets lost in personal inboxes.",
    guide: "Messages",
  },
  supervision: {
    title: "What is Supervision?",
    body: "Supervision gives a per-VA view of activity — daily logs, hours, SOP runs and tasks — and flags anyone who's gone quiet. Click a VA to see the full detail.",
    guide: "Supervision",
  },
  tools: {
    title: "What are Tools?",
    body: "A growing kit of AI helpers for everyday client work — SEO metadata, Google Business Profile posts, content briefs and more. Each one is grounded in the client's Vault and brand, so the output is ready to use, not generic.",
    guide: "Tools",
  },
  "daily-log": {
    title: "What is the Daily Log?",
    body: "Your daily log is a quick end-of-day summary — what you did, wins, blockers, and tomorrow's plan. Your client reads these, so it's how your work stays visible. It takes two minutes and builds trust.",
    guide: "Daily Log",
  },
  "my-job": {
    title: "What is My Job?",
    body: "My Job is your employment home — your contract terms, pay, days worked, leave and the records you may need. Log your days here and generate documents like invoices, a certificate of employment, or a yearly income summary, and raise an issue if something isn't working out.",
    guide: "My Job",
  },
  notebook: {
    title: "What is the Notebook?",
    body: "The Notebook is the shared home for your placement — SOPs, account registers, content calendars, weekly reports and meeting notes, all in one place instead of scattered across email and chat. Both you and your counterpart can read and edit every page, and it starts pre-loaded with useful templates. RapidTal admins cannot see anything you write here.",
    guide: "Notebook",
  },
  "content-quick": {
    title: "What is Quick Draft?",
    body: "The fastest way to a finished draft: give the engine a topic and a channel, and it applies your Company DNA, approved voice and the most relevant Vault evidence automatically. Use Guided Create when you want to review the idea and sources before anything is written.",
    guide: "Content",
  },
  "content-ideas": {
    title: "What is Ideas?",
    body: "Ideas the engine generates from your DNA, Vault and the questions your team asks — each one explains why it matters and what evidence supports it. Approve the good ones, then turn them into drafts whenever you're ready.",
    guide: "Content",
  },
  "content-competitors": {
    title: "What is Competitor Ideas?",
    body: "Your competitors' public content, analyzed into market maps, formats and positioning gaps — then turned into recommended ideas only your company can credibly own. Competitor material never becomes your DNA or your voice; it's context, not truth.",
    guide: "Content",
  },
  "content-projects": {
    title: "What are Projects?",
    body: "Projects are your in-progress content. RapidTal saves the idea, direction, selected company sources and draft at each step, so you can stop and continue later without rebuilding the work.",
    guide: "Content",
  },
  "content-library": {
    title: "What are Drafts & Approved?",
    body: "Your content library contains every draft and approved piece. Open one to edit it, compare versions, adapt it to another channel, approve it, archive it or export it.",
    guide: "Content",
  },
  "content-style": {
    title: "What is Content Style?",
    body: "Content Style shows how RapidTal should write for your company. Add writing examples you like, collect your own published posts and approve the resulting voice profile; advanced evaluation remains optional.",
    guide: "Content",
  },
  "dna-competitors": {
    title: "What are Competitors?",
    body: "Add the companies you compete with and collect their public websites, posts or articles. RapidTal uses that material for market opportunities and content ideas while keeping it separate from your Company Profile, company knowledge and voice.",
    guide: "Company DNA",
  },
};
