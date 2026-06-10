/**
 * Short "what is this section for" copy, in one place so it's easy to edit and
 * keep consistent. Each entry is 2-3 plain sentences aimed at VAs and clients —
 * not feature lists, just the purpose and why it matters.
 */
export interface IntroCopy { title: string; body: string }

export const PAGE_INTROS: Record<string, IntroCopy> = {
  vault: {
    title: "What is the Vault?",
    body: "The Vault is your company's knowledge base — every document, web page, and note the AI reads to answer questions. Add anything here (files, links, or pasted text) and it becomes searchable. The richer the Vault, the smarter every AI answer across the portal.",
  },
  ask: {
    title: "What is Ask the Vault?",
    body: "Ask questions in plain English and get answers built only from your company's own documents, with a link to where each fact came from. It's the fastest way to find a policy, a product detail, or anything else in the Vault — no digging through files.",
  },
  compose: {
    title: "What is Compose?",
    body: "Compose writes emails, replies, and posts in your company's voice, grounded in the Vault so the details are accurate. Describe what you need (or paste a message to reply to), then refine the draft until it's right.",
  },
  tasks: {
    title: "What is the Tasks board?",
    body: "This is your team's shared board. Work a VA does shows up here for the client to follow in real time — drag cards between columns, assign people, and comment to keep each conversation on the card it belongs to.",
  },
  access: {
    title: "What is Access?",
    body: "Access is a secure, encrypted store for the logins your team needs — site, username, and password. Passwords are encrypted and every reveal is logged, so VAs can get the access they need without anyone sharing credentials over chat.",
  },
  sops: {
    title: "What are SOPs?",
    body: "SOPs are step-by-step guides for doing recurring work the right way every time. Browse the library, follow one in the runner, and your progress is recorded so admins can see what's been completed.",
  },
  crm: {
    title: "What is the CRM?",
    body: "The CRM tracks contacts and leads through stages from lead to closed. Move contacts between columns as they progress, add notes, and every change is logged so the whole team stays in sync.",
  },
  content: {
    title: "What is the Content studio?",
    body: "The Content studio generates marketing drafts — blogs, posts, emails — grounded in your company's Vault and brand. Create a draft, refine it, and an admin approves it before it goes out.",
  },
  "knowledge-base": {
    title: "What is the Knowledge Base?",
    body: "The Knowledge Base is a set of ready-made Q&A answers generated from your Vault for the questions that come up most. Search it for instant answers; admins can regenerate it as the Vault grows.",
  },
  "company-dna": {
    title: "What is Company DNA?",
    body: "Company DNA is the core profile of the business — who they are, what they offer, their values and contacts. The AI uses it in every answer, so keeping it accurate makes the whole system smarter. Admins edit it; VAs can view it.",
  },
  "company-report": {
    title: "What is the Company Report?",
    body: "The Company Report shows how complete your company brain is — what the AI knows across identity, services, policies and more, and where the gaps are. Use it to decide what to add to the Vault next.",
  },
  "brain-analytics": {
    title: "What is Brain Analytics?",
    body: "Brain Analytics shows what people are asking the AI, how often it has a good answer, and which questions it can't answer yet. Turn those gaps into Vault additions to keep improving the answers.",
  },
  messages: {
    title: "What is Messages?",
    body: "Messages is your team's shared chat for this client. Everyone on the account sees the thread and new messages notify the team — keep work discussion here so nothing gets lost in personal inboxes.",
  },
  supervision: {
    title: "What is Supervision?",
    body: "Supervision gives a per-VA view of activity — daily logs, hours, SOP runs and tasks — and flags anyone who's gone quiet. Click a VA to see the full detail.",
  },
  "daily-log": {
    title: "What is the Daily Log?",
    body: "Your daily log is a quick end-of-day summary — what you did, wins, blockers, and tomorrow's plan. Your client reads these, so it's how your work stays visible. It takes two minutes and builds trust.",
  },
};
