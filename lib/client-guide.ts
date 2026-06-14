/**
 * Plain-language client guide content. One place to edit so the in-app guide at
 * /guide stays current. Written for non-technical clients: each feature has what
 * it is, what they can do with it, and simple steps. Grouped by the job to be
 * done (manage the VA, the AI brain, business tools, account).
 */
export interface GuideItem {
  title: string;
  /** One or two plain sentences: what it is and why it matters. */
  what: string;
  /** What you can do here. */
  can: string[];
  /** Simple, numbered "how to" steps. */
  how: string[];
}
export interface GuideGroup {
  heading: string;
  blurb?: string;
  items: GuideItem[];
}

export const CLIENT_GUIDE: GuideGroup[] = [
  {
    heading: "Getting started",
    blurb: "The basics of finding your way around.",
    items: [
      {
        title: "Dashboard",
        what: "Your home screen. It gives you an at-a-glance picture of what's happening on your account — recent work, your team, and quick links to everything else.",
        can: [
          "See a summary of recent activity and what your VA has been working on.",
          "Jump straight to any other section from one place.",
        ],
        how: [
          "It's the first page you land on after signing in.",
          "Click any card or menu item on the left to open that section.",
        ],
      },
    ],
  },
  {
    heading: "Managing your virtual assistant",
    blurb: "Everything you need to direct, follow, and stay in sync with your VA.",
    items: [
      {
        title: "Tasks",
        what: "A shared to-do board you and your VA both see in real time. It's the main place work is organised — like sticky notes that move across columns as things get done.",
        can: [
          "Create tasks and assign them to a VA.",
          "Set a due date and a priority so the important things rise to the top.",
          "Watch tasks move across columns (e.g. To do → In progress → Done) as your VA works.",
          "Comment on a task to keep that conversation attached to the right job.",
        ],
        how: [
          "Open Tasks from the menu.",
          "Click 'Add task', give it a title, pick who it's for, set a due date.",
          "Drag a card between columns to change its status, or click a card to open it and add comments.",
        ],
      },
      {
        title: "Supervision",
        what: "A simple oversight view of each VA — their daily logs, hours, and activity — that highlights anyone who's gone quiet, so nothing slips through the cracks.",
        can: [
          "See each VA's recent activity in one place.",
          "Spot quickly if a VA hasn't logged work lately.",
          "Click a VA to see their full detail.",
        ],
        how: [
          "Open Supervision from the menu.",
          "Scan the list; click any VA to drill into their activity.",
        ],
      },
      {
        title: "My Team",
        what: "The profiles of the VA(s) working with you — their details, skills, and contact info, all in one place.",
        can: [
          "View your VA's profile and details.",
          "Keep their key information handy.",
        ],
        how: [
          "Open My Team from the menu.",
          "Click a team member to see their full profile.",
        ],
      },
      {
        title: "Reports",
        what: "A clear, shareable summary of the work delivered over a period — what was done and the value of it — so you always know what you're getting.",
        can: [
          "See a tidy summary of completed work and hours.",
          "Use it for your own records or to share internally.",
        ],
        how: [
          "Open Reports from the menu.",
          "Pick the period you want and review (or print) the summary.",
        ],
      },
      {
        title: "Messages",
        what: "A shared chat for your account. Keeping work conversations here (instead of personal email) means nothing gets lost and your whole team sees the same thread.",
        can: [
          "Message your VA and team in one shared thread.",
          "Get notified when there's a new message.",
        ],
        how: [
          "Open Messages from the menu.",
          "Type your message and send — everyone on the account sees it.",
        ],
      },
      {
        title: "Notebook",
        what: "A private shared workspace for you and your VA — SOPs, registers, content calendars, notes — all in one place. It comes pre-loaded with useful templates. Importantly, RapidTal staff cannot see anything written in your Notebook; it's just between you and your VA.",
        can: [
          "Create and co-edit pages with your VA.",
          "Start from ready-made templates.",
          "Keep everything for the engagement in one organised place.",
        ],
        how: [
          "Open Notebook from the menu.",
          "Pick a template or create a blank page, then type — changes save automatically and your VA sees them.",
        ],
      },
    ],
  },
  {
    heading: "Your AI company brain",
    blurb: "The smarter you make this, the better every AI answer your team gets.",
    items: [
      {
        title: "Vault",
        what: "Your company's knowledge base — every document, web page, and note the AI reads to answer questions. The richer the Vault, the smarter everything else becomes.",
        can: [
          "Add files (PDFs, Word docs), web links, or pasted text.",
          "Have everything become instantly searchable by the AI.",
          "Remove anything that's out of date.",
        ],
        how: [
          "Open Vault from the menu.",
          "Click to upload a file, add a URL, or paste text — the system reads and indexes it automatically.",
          "Add anything that would help someone understand or run your business.",
        ],
      },
      {
        title: "Ask the Vault",
        what: "Ask any question about your business in plain English and get an answer built only from your own documents — with a link to where each fact came from. No digging through files.",
        can: [
          "Get instant answers grounded in your real company information.",
          "Use 'Go deeper' for a longer, more thorough answer.",
          "See the exact source behind every answer.",
        ],
        how: [
          "Open Ask the Vault from the menu.",
          "Type a question (e.g. 'What's our refund policy?') and press Enter.",
          "If you want more detail, click 'Go deeper'.",
        ],
      },
      {
        title: "Company DNA",
        what: "The core profile of your business — who you are, what you offer, your values, and key contacts. The AI uses this in every answer, so keeping it accurate makes the whole system smarter.",
        can: [
          "Fill in and update your company's essential details.",
          "Improve the accuracy of every AI answer at once.",
        ],
        how: [
          "Open Company DNA from the menu.",
          "Fill in each field (services, values, audience, contacts…) and save.",
        ],
      },
      {
        title: "Company Report",
        what: "A health-check of your company brain — what the AI knows well and where the gaps are — so you know what to add to the Vault next.",
        can: [
          "See how complete your company knowledge is.",
          "Spot the gaps worth filling.",
        ],
        how: [
          "Open Company Report from the menu and review the breakdown.",
        ],
      },
      {
        title: "Brain Analytics",
        what: "Shows what people are actually asking the AI, how often it has a good answer, and which questions it couldn't answer — turning those gaps into a to-do list for your Vault.",
        can: [
          "See the real questions being asked.",
          "Find the questions the AI couldn't answer and fix them by adding to the Vault.",
        ],
        how: [
          "Open Brain Analytics from the menu.",
          "Review the unanswered questions and add the missing info to the Vault.",
        ],
      },
    ],
  },
  {
    heading: "Business tools",
    items: [
      {
        title: "CRM",
        what: "A simple way to track contacts and leads as they move from first contact to closed — with notes and a full history.",
        can: [
          "Add contacts and move them through stages.",
          "Add notes; every change is logged so the team stays in sync.",
        ],
        how: [
          "Open CRM from the menu.",
          "Add a contact, then drag them between stages as they progress.",
        ],
      },
      {
        title: "Access",
        what: "A secure, encrypted vault for the logins your VA needs (site, username, password) — so you never have to share passwords over chat or email. Every time a password is viewed, it's logged.",
        can: [
          "Store logins securely and share them with your VA safely.",
          "See a log of every time a credential was revealed.",
        ],
        how: [
          "Open Access from the menu.",
          "Add a login with its site, username and password — it's encrypted automatically.",
        ],
      },
    ],
  },
  {
    heading: "Your account",
    items: [
      {
        title: "My Profile",
        what: "Your personal details and sign-in settings.",
        can: [
          "Update your name and contact details.",
          "Change your password.",
        ],
        how: [
          "Open My Profile from the menu and edit any field, then save.",
        ],
      },
    ],
  },
  {
    heading: "About the platform",
    blurb: "RapidTal is always evolving.",
    items: [
      {
        title: "New features & Tools in development",
        what: "The portal is continuously improved. Some areas — especially the AI Tools (helpers for SEO, content, posts and more) — are in active development and will keep gaining capabilities over time, so you may see them change and grow.",
        can: [
          "Expect new features and improvements regularly.",
          "Request a feature or tool you'd find useful — if it's within our capabilities, we can build it for you.",
        ],
        how: [
          "Have an idea or a need? Tell your RapidTal contact (or send it via Messages).",
          "We'll let you know if it's something we can add, and roughly when.",
        ],
      },
    ],
  },
];
