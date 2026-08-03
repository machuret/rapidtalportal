/**
 * Plain-language client guide content. One place to edit so the in-app guide at
 * /guide stays current. Written warmly for non-technical clients: each feature
 * has what it is, WHY it exists (the goal + benefit), what you can do, simple
 * steps, and a friendly tip. Grouped by the job to be done.
 */
export interface GuideItem {
  title: string;
  /** Canonical destination for this feature; checked against the real portal. */
  href?: string;
  /** What it is, in plain words. */
  what: string;
  /** The goal and the benefit — why it's there and what you gain. */
  why: string;
  /** What you can do here. */
  can: string[];
  /** Simple, numbered "how to" steps. */
  how: string[];
  /** One friendly pro-tip. */
  tip?: string;
  /** Optional Loom video (share or embed URL) shown inside the expanded item. */
  video?: string;
}
export interface GuideGroup {
  heading: string;
  blurb?: string;
  items: GuideItem[];
}

export const GUIDE_INTRO =
  "Welcome 👋 RapidTal helps you request work, review decisions, see progress and use your company knowledge across your VA and AI tools. Start with the Dashboard; use this Guide whenever you want a plain-English explanation or a direct route to a feature.";

export const CLIENT_GUIDE: GuideGroup[] = [
  {
    heading: "Getting started",
    blurb: "Find your feet in a couple of minutes.",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        what: "Your home screen and command centre — a live snapshot of what's happening across your account: recent work, your team, and shortcuts to everything else.",
        why: "The goal is confidence in five seconds. Instead of wondering “what's my VA actually doing?”, you open the portal and immediately see momentum and anything that needs your attention. Less time checking up, more time on the things only you can do.",
        can: [
          "See a summary of recent activity and what your VA has been working on.",
          "Notice anything that needs your attention at a glance.",
          "Jump straight to any other section from one place.",
        ],
        how: [
          "It's the first page you land on after signing in.",
          "Click any card or any item in the left-hand menu to open that section.",
        ],
        tip: "Make it your 30-second morning check-in — it tells you if everything's on track before your day even starts.",
      },
    ],
  },
  {
    heading: "Managing your virtual assistant",
    blurb: "Direct the work, follow the progress, and stay in sync — without micromanaging.",
    items: [
      {
        title: "Tasks",
        href: "/tasks",
        what: "A shared, live to-do board you and your VA both see in real time — like sticky notes that move across columns as work gets done.",
        why: "The goal is total clarity on who's doing what and where it stands, without a single status-update email. You delegate once, then simply watch it progress. Nothing falls through the cracks, priorities stay obvious, and you always know what's in flight — that's the whole point of having a VA, made effortless.",
        can: [
          "Create tasks and assign them to a VA.",
          "Set a due date and a priority so the important things rise to the top.",
          "Watch tasks move across columns (To do → In progress → Done) as your VA works.",
          "Comment on a task to keep that conversation attached to the right job.",
        ],
        how: [
          "Open Tasks from the menu.",
          "Click 'Add task', give it a title, choose who it's for, and set a due date.",
          "Drag a card between columns to change its status, or click a card to open it and add comments.",
        ],
        tip: "Keep each discussion on its task card rather than in chat — six months later you'll still know exactly why something was done.",
      },
      {
        title: "My Team",
        href: "/team",
        what: "The people working with you — their profiles, contact details, recent activity and delivery summary in one place.",
        why: "The goal is confidence without micromanagement. You can see who is assigned, how work is moving and whether anything needs attention, then open a team member for the detail.",
        can: [
          "View your VA's profile, contact details and recent activity.",
          "Review delivery, hours, daily logs and anything needing attention.",
          "Handle pending leave requests.",
        ],
        how: [
          "Open My Team from the menu.",
          "Click a team member to see their full profile.",
        ],
      },
      {
        title: "Reports",
        href: "/reports",
        what: "A clean, shareable summary of the work delivered over any period — what was done and the hours behind it.",
        why: "The goal is to make the value you're getting impossible to miss — effortlessly. Whether it's for your own records, justifying the spend, or showing a partner what's been achieved, the receipts are always ready and presentable. Your VA's impact, on paper.",
        can: [
          "See a tidy summary of completed work and hours.",
          "Use it for your own records or to share internally.",
        ],
        how: [
          "Open Reports from the menu.",
          "Pick the period you want and review — or print it.",
        ],
        tip: "Review it monthly to see trends and the return you're getting over time.",
      },
      {
        title: "Messages",
        href: "/messages",
        what: "A shared chat for your account — one thread the whole team sees, with notifications for new messages.",
        why: "The goal is to keep work conversations out of scattered personal inboxes, where things get buried and lost. One shared place means everyone has the same context, replies are fast, and nothing important slips away in someone's email.",
        can: [
          "Message your VA and team in one shared thread.",
          "Get notified when there's a new message.",
        ],
        how: [
          "Open Messages from the menu.",
          "Type your message and send — everyone on the account sees it.",
        ],
        tip: "Use Messages for quick back-and-forth, and Tasks for anything that needs tracking to completion.",
      },
      {
        title: "Notebook",
        href: "/notebook",
        what: "A private shared workspace for you and your VA — SOPs, account registers, content calendars, meeting notes — with ready-made templates to start from.",
        why: "The goal is one trusted home for how your business actually runs, instead of knowledge scattered across email, chat, and people's heads. And it's genuinely private: RapidTal staff cannot see anything you write here — it belongs to you and your VA alone. Build it once and a new VA can get up to speed in days, not weeks.",
        can: [
          "Create and co-edit pages with your VA in real time.",
          "Start from ready-made templates instead of a blank page.",
          "Keep everything for the engagement in one organised place.",
        ],
        how: [
          "Open Notebook from the menu.",
          "Pick a template or create a blank page, then type — changes save automatically and your VA sees them.",
        ],
        tip: "Capture your recurring processes here as SOPs — it's the single best thing you can do to make your VA more independent.",
      },
    ],
  },
  {
    heading: "Your company knowledge and AI",
    blurb: "Add what RapidTal should know, ask for help, and see where the company setup can improve.",
    items: [
      {
        title: "Vault",
        href: "/vault",
        what: "Your company knowledge — the documents, web pages and notes RapidTal can search when answering questions or creating content.",
        why: "The goal is to turn your scattered, locked-away knowledge into an always-on expert. This is the single biggest lever you control: everything you add here makes every AI answer, report, and draft across the whole portal more accurate. Think of it as teaching the system your business, once, so it can help forever.",
        can: [
          "Add files (PDFs, Word docs), web links, or pasted text.",
          "Have everything become instantly searchable by the AI.",
          "Remove anything that's gone out of date.",
        ],
        how: [
          "Open Vault from the menu.",
          "Upload a file, add a URL, or paste text — the system reads and indexes it automatically.",
          "Add anything that would help someone understand or run your business.",
        ],
        tip: "Start with your policies, pricing, FAQs and how-tos — that's what people ask about most, so you'll feel the benefit immediately.",
      },
      {
        title: "RapidTal Coach",
        href: "/ask",
        what: "Ask for guidance in plain English. Coach combines your Company Profile, company knowledge, permitted work, published Library guidance and the preferences you deliberately ask it to remember.",
        why: "The goal is useful guidance without searching across the portal yourself. Coach shows what it used, keeps your conversation private to you and previews any task or message before it is shared.",
        can: [
          "Get guidance informed by your company and current work.",
          "See the company sources, work and learned preferences that influenced an answer.",
          "Prepare tasks, messages, goals or commitments and approve them before sharing.",
        ],
        how: [
          "Open RapidTal Coach from the menu.",
          "Type a question or describe the outcome you want, then press Enter.",
          "Review what Coach used and approve any proposed action before it is shared.",
        ],
        tip: "If an answer feels thin, that's a signal — add the missing info to the Vault and it'll nail it next time.",
      },
      {
        title: "Company DNA",
        href: "/company-dna",
        what: "Your Company Profile — who you are, what you offer, your priorities, voice and key contacts. Competitors are managed in a separate tab so they do not become part of your own company information.",
        why: "The goal is to give the AI a rock-solid foundation about you. Because this profile is used in every single answer, a few minutes keeping it accurate quietly lifts the quality of everything at once — the highest-leverage five minutes in the whole portal.",
        can: [
          "Fill in and update your company's essential details in Profile.",
          "Track competitors and their public content in Competitors.",
          "Improve the accuracy of every AI answer in one place.",
        ],
        how: [
          "Open the Company DNA group in the menu and pick Profile or Competitors.",
          "Fill in each field (services, values, audience, contacts…) and save.",
        ],
        tip: "Revisit it whenever your services, pricing, or positioning change — the AI will instantly reflect it. Fields with an auto-fill badge were drafted by AI — review those first.",
      },
      {
        title: "Company Brain",
        href: "/brain",
        what: "A readiness view showing what RapidTal can use today: company knowledge, voice, approved learned preferences, reliability and market intelligence.",
        why: "The goal is to answer a practical question: which capabilities are ready for this company, and what is the most useful improvement to make next? Each area is shown separately so one strong area cannot hide a weak one.",
        can: [
          "Review readiness by capability rather than relying on one opaque score.",
          "See knowledge coverage and the next recommended improvement.",
          "Open Analytics or Learning from the tabs inside Company Brain when you need detail.",
        ],
        how: [
          "Open Company Brain from the menu.",
          "Review the readiness areas, then follow the clearest recommended next action.",
        ],
        tip: "You do not need to manage this every day. Use it when an output feels weak or when you want to improve a specific capability.",
      },
    ],
  },
  {
    heading: "Business tools",
    blurb: "Practical, everyday helpers that keep the wheels turning.",
    items: [
      {
        title: "Lead Generation",
        href: "/lead-generation",
        what: "A review-first workspace for finding suitable businesses by type and location, then adding only the right ones to CRM.",
        why: "The goal is to make prospecting fast without filling the CRM with unreviewed lists. Searches keep running in the background, repeated results are deduplicated, and nothing enters CRM until you choose it.",
        can: [
          "Find local businesses through Google Maps or use broader web discovery.",
          "Shortlist, dismiss and review source details in the Lead Inbox.",
          "Save searches as reusable campaigns and run them again.",
          "Add a selected lead to CRM with one click.",
        ],
        how: [
          "Open Lead Generation and enter the business type and location.",
          "Review the results in Lead Inbox.",
          "Shortlist promising businesses, then add the right ones to CRM.",
        ],
        tip: "Start with 10–20 results while refining a search; increase it after the first batch looks relevant.",
      },
      {
        title: "Content",
        href: "/content/quick",
        what: "A guided content workspace — quick drafts, grounded ideas, competitor opportunities, projects and approvals, each on its own page under the Content menu.",
        why: "The goal is to keep ideas, briefs, Vault evidence, competitor inspiration, voice settings, drafts and approvals connected in one recoverable workflow — without everything competing for space on one screen.",
        can: [
          "Quick Draft: create a draft from only a topic and channel.",
          "Ideas: review AI-suggested topics and Vault gaps; approve the good ones.",
          "Competitor Ideas: see market analysis turned into recommended ideas.",
          "Projects: continue unfinished work exactly where you left off.",
          "Drafts & Approved: edit, validate, approve, archive, adapt and export.",
          "Content Style: manage the writing examples and approved voice profile used by drafts.",
        ],
        how: [
          "Open the Content group in the menu and pick a section.",
          "Use Quick Draft for speed, or start from an approved idea or competitor opportunity.",
          "Open any project to continue where you left off — every step is saved.",
        ],
        tip: "Start with Quick Draft when speed matters; use Projects when you want tighter control over evidence and direction.",
      },
      {
        title: "CRM",
        href: "/crm",
        what: "A simple way to track contacts and leads as they move from first contact to closed — with notes and a full history.",
        why: "The goal is that no lead is ever lost and no follow-up forgotten. A clear pipeline keeps you and your VA aligned on who's where and what happens next, so opportunities turn into results instead of slipping away.",
        can: [
          "Add contacts and move them through stages.",
          "Add notes; every change is logged so the team stays in sync.",
        ],
        how: [
          "Open CRM from the menu.",
          "Add a contact, then drag them between stages as they progress.",
        ],
        tip: "Have your VA log every interaction here — your future self will thank you when you need the history.",
      },
      {
        title: "Access",
        href: "/access",
        what: "A secure, encrypted store for the logins your VA needs (site, username, password).",
        why: "The goal is to give your VA the access they need without ever pasting a password into chat or email. Credentials are encrypted, and every time one is revealed it's logged — so you get convenience and security at the same time, with full peace of mind about who saw what.",
        can: [
          "Store logins securely and share them with your VA safely.",
          "See a log of every time a credential was revealed.",
        ],
        how: [
          "Open Access from the menu.",
          "Add a login with its site, username and password — it's encrypted automatically.",
        ],
        tip: "Use this instead of ever typing a password in Messages — it keeps you in control and your accounts safer.",
      },
    ],
  },
  {
    heading: "Your account",
    items: [
      {
        title: "My Profile",
        href: "/profile",
        what: "Your personal details and sign-in settings.",
        why: "The goal is simply to keep your contact information current and your account secure — so notifications reach you and signing in is smooth.",
        can: [
          "Update your name and contact details.",
          "Change your password.",
        ],
        how: [
          "Open My Profile from the menu, edit any field, and save.",
        ],
      },
    ],
  },
];
