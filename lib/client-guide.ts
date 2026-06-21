/**
 * Plain-language client guide content. One place to edit so the in-app guide at
 * /guide stays current. Written warmly for non-technical clients: each feature
 * has what it is, WHY it exists (the goal + benefit), what you can do, simple
 * steps, and a friendly tip. Grouped by the job to be done.
 */
export interface GuideItem {
  title: string;
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
  "Welcome 👋 This portal is your command centre for working with your virtual assistant and turning everything your business knows into an AI that works for you. Every feature here exists to do three things: give your work back to you (delegate with confidence), keep everything visible (no more wondering what's happening), and make your VA — and your whole operation — sharper over time. You don't need to be technical to get the most from it. Here's what each part does, why it's there, and exactly how to use it. Tap any item to open it.";

export const CLIENT_GUIDE: GuideGroup[] = [
  {
    heading: "Getting started",
    blurb: "Find your feet in a couple of minutes.",
    items: [
      {
        title: "Dashboard",
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
        title: "Supervision",
        what: "A bird's-eye view of every VA's activity — daily logs, hours, tasks — that gently flags anyone who's gone quiet.",
        why: "The goal is peace of mind with early warning. Rather than micromanaging, you get one screen that reassures you everyone's engaged and nudges you only when something genuinely needs a look. Trust, but verify — in seconds.",
        can: [
          "See each VA's recent activity in one place.",
          "Spot quickly if a VA hasn't logged work lately.",
          "Click a VA to see the full detail behind the summary.",
        ],
        how: [
          "Open Supervision from the menu.",
          "Scan the list; click any VA to drill into their activity.",
        ],
        tip: "A quick glance once a week keeps you ahead of any drift before it becomes an issue.",
      },
      {
        title: "My Team",
        what: "The people working with you — their profiles, skills, and contact details, all in one place.",
        why: "The goal is to make your team feel like *your* team. Having everyone's key information a click away makes onboarding smoother and day-to-day collaboration easier — no hunting for who does what or how to reach them.",
        can: [
          "View your VA's profile, skills, and details.",
          "Keep their key information handy.",
        ],
        how: [
          "Open My Team from the menu.",
          "Click a team member to see their full profile.",
        ],
      },
      {
        title: "Reports",
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
    heading: "Your AI company brain",
    blurb: "This is your superpower. The more you feed it, the smarter every answer, report, and draft becomes.",
    items: [
      {
        title: "Vault",
        what: "Your company's knowledge base — every document, web page, and note the AI reads to answer questions.",
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
        title: "Ask the Vault",
        what: "Ask any question about your business in plain English and get an answer built only from your own documents — with a link to where each fact came from.",
        why: "The goal is instant, trustworthy answers with zero digging and zero guessing. Because it only uses your real documents (and shows its sources), it won't make things up. It's like having someone who has read every document in your company, on call 24/7 — for you and for your VA.",
        can: [
          "Get instant answers grounded in your real company information.",
          "Click 'Go deeper' for a longer, more thorough answer.",
          "See the exact source behind every answer, so you can trust it.",
        ],
        how: [
          "Open Ask the Vault from the menu.",
          "Type a question (e.g. 'What's our refund policy?') and press Enter.",
          "Want more detail? Click 'Go deeper'.",
        ],
        tip: "If an answer feels thin, that's a signal — add the missing info to the Vault and it'll nail it next time.",
      },
      {
        title: "Company DNA",
        what: "The core profile of your business — who you are, what you offer, your values, and key contacts.",
        why: "The goal is to give the AI a rock-solid foundation about you. Because this profile is used in every single answer, a few minutes keeping it accurate quietly lifts the quality of everything at once — the highest-leverage five minutes in the whole portal.",
        can: [
          "Fill in and update your company's essential details.",
          "Improve the accuracy of every AI answer in one place.",
        ],
        how: [
          "Open Company DNA from the menu.",
          "Fill in each field (services, values, audience, contacts…) and save.",
        ],
        tip: "Revisit it whenever your services, pricing, or positioning change — the AI will instantly reflect it.",
      },
      {
        title: "Company Report",
        what: "A health-check of your company brain — what the AI knows well, and where the gaps are.",
        why: "The goal is to take the guesswork out of “what should I add next?”. It shows your blind spots clearly, so the time you spend improving the Vault goes exactly where it'll make the biggest difference.",
        can: [
          "See how complete your company knowledge is.",
          "Spot the gaps worth filling first.",
        ],
        how: [
          "Open Company Report from the menu and review the breakdown.",
        ],
        tip: "Treat a low area as a quick win — fill it and watch the related answers improve.",
      },
      {
        title: "Brain Analytics",
        what: "Shows what people are actually asking the AI, how often it has a good answer, and which questions it couldn't answer.",
        why: "The goal is to let your team's real questions guide you, instead of guessing. Every unanswered question is a ready-made to-do for the Vault — so the system keeps getting smarter on its own momentum, driven by exactly what people need.",
        can: [
          "See the real questions being asked.",
          "Find the questions the AI couldn't answer — and fix them by adding to the Vault.",
        ],
        how: [
          "Open Brain Analytics from the menu.",
          "Review the unanswered questions and add the missing information to the Vault.",
        ],
        tip: "Knock out the top few unanswered questions each month — it's the fastest way to a noticeably smarter brain.",
      },
    ],
  },
  {
    heading: "Business tools",
    blurb: "Practical, everyday helpers that keep the wheels turning.",
    items: [
      {
        title: "CRM",
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
  {
    heading: "About the platform — built to grow with you",
    blurb: "This is a living product, and you have a say in where it goes.",
    items: [
      {
        title: "New features & Tools in development",
        what: "The portal is continuously improved. Some areas — especially the AI Tools (helpers for SEO, content, posts and more) — are in active development and will keep gaining capabilities, so you'll see them change and grow over time.",
        why: "The goal is honesty and partnership. Rather than pretend everything is finished, we'd rather tell you what's evolving — and build what you actually need instead of guessing. Your real-world use shapes what comes next, and that makes the platform better for you specifically.",
        can: [
          "Expect regular new features and improvements.",
          "Request a feature or tool you'd find useful — if it's within our capabilities, we can build it for you.",
        ],
        how: [
          "Have an idea or a need? Tell your RapidTal contact, or send it via Messages.",
          "We'll let you know if it's something we can add, and roughly when.",
        ],
        tip: "No idea is too small — if it would save you or your VA time, we genuinely want to hear it.",
      },
    ],
  },
];
