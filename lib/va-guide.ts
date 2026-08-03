/**
 * Plain-language guide for virtual assistants (VAs). One place to edit so the
 * in-app guide at /guide stays current. Written warmly and supportively: each
 * feature explains what it is, WHY it matters to *you* as a VA (do great work,
 * stay visible, build trust with your client), what you can do, simple steps,
 * and a friendly tip. Reuses the GuideGroup/GuideItem shapes from the client
 * guide so the same component renders both.
 */
import type { GuideGroup } from "./client-guide";

export const VA_GUIDE_INTRO =
  "Welcome to the team 👋 This portal is your workspace for doing brilliant work and making sure your client sees it. Everything here is built to help you with three things: do great work fast (with an AI that already knows your client's business), stay visible (so your effort is never invisible and trust grows on its own), and keep your own job details — hours, leave, contract, pay — clear and in one place. You don't need to be technical. Below is what each part does, why it helps you, and exactly how to use it. Tap any item to open it.";

export const VA_GUIDE: GuideGroup[] = [
  {
    heading: "Getting started",
    blurb: "Get oriented in a couple of minutes.",
    items: [
      {
        title: "Home",
        what: "Your home screen — a quick snapshot of what's on your plate: your tasks, recent activity, and shortcuts to everything else.",
        why: "The goal is to start every day knowing exactly what matters, with no guesswork. Instead of wondering where to begin, you open the portal and your priorities are right there — so you spend your energy doing the work, not hunting for it.",
        can: [
          "See your current tasks and what's due.",
          "Notice anything that needs your attention.",
          "Jump straight to any other section from one place.",
        ],
        how: [
          "It's the first page you land on after signing in.",
          "Click any card or any item in the left-hand menu to open that section.",
        ],
        tip: "Make it your 60-second morning routine — check Home, then Tasks, and you'll always know your plan for the day.",
      },
    ],
  },
  {
    heading: "Your daily work & staying visible",
    blurb: "Do the work, and make sure it's seen. Visible work builds trust — and trust is what makes a placement last.",
    items: [
      {
        title: "Tasks",
        what: "A shared, live to-do board you and your client both see in real time — like sticky notes that move across columns as work gets done.",
        why: "The goal is for your client to *see* your progress without you having to send a single update. Every card you move from 'In progress' to 'Done' is proof of your work. It keeps you organised and your client reassured at the same time — the easiest way to look on top of everything.",
        can: [
          "See the tasks assigned to you, with due dates and priorities.",
          "Move a card across columns (To do → In progress → Done) as you work.",
          "Comment on a task to ask a question or share an update — right where it belongs.",
          "Create tasks for yourself to keep track of your own work.",
        ],
        how: [
          "Open Tasks from the menu.",
          "Drag a card to a new column to change its status, or click it to open it and add a comment.",
          "Keep the board honest — it's your best advertisement.",
        ],
        tip: "Move cards as you go, not at the end of the day. A board that updates in real time tells your client you're actively on it.",
      },
      {
        title: "Daily Log",
        what: "A quick end-of-day summary — what you did, your wins, any blockers, and your plan for tomorrow.",
        why: "The goal is to make your effort impossible to miss. Two minutes here turns a day of work into a clear story your client can read. It's the single biggest thing you can do to build trust: clients who can see the work stop worrying and start relying on you.",
        can: [
          "Write a short summary of what you accomplished.",
          "Flag any blockers so your client can unblock you fast.",
          "Note your plan for tomorrow so nothing gets dropped.",
        ],
        how: [
          "Open Daily Log from the menu, ideally at the end of each working day.",
          "Fill in what you did, wins, blockers, and tomorrow's plan, then save.",
        ],
        tip: "Even on a quiet day, log something. Consistency is what builds trust — a gap looks worse than a short entry.",
      },
      {
        title: "Messages",
        what: "A shared chat for this client — one thread the whole team sees, with notifications for new messages.",
        why: "The goal is to keep work conversations in one place everyone can see, instead of buried in personal inboxes. It means faster answers, shared context, and a record you can look back on — so nothing important gets lost.",
        can: [
          "Message your client and team in one shared thread.",
          "Get notified when there's a new message.",
        ],
        how: [
          "Open Messages from the menu.",
          "Type your message and send — everyone on the account sees it.",
        ],
        tip: "Use Messages for quick back-and-forth, and Tasks for anything that needs tracking to completion — that way nothing slips between the two.",
      },
      {
        title: "SOPs",
        what: "Step-by-step guides for doing recurring work the right way every time. Browse the library, follow one in the runner, and your progress is recorded.",
        why: "The goal is to help you do unfamiliar or repeated work confidently and consistently — no second-guessing. Following the SOP means you get it right the first time, and because your progress is logged, your completed work is visible to admins without you having to report it.",
        can: [
          "Browse the SOP library for the task you need.",
          "Follow a procedure step by step in the runner.",
          "Have your completed steps recorded automatically.",
        ],
        how: [
          "Open SOPs from the menu and pick the procedure you need.",
          "Work through the steps in order; your progress is saved as you go.",
        ],
        tip: "If a process you do often doesn't have an SOP yet, suggest one — capturing it helps the whole team and shows initiative.",
      },
    ],
  },
  {
    heading: "Your employment hub",
    blurb: "Everything about your role — in one clear place, so nothing's a mystery.",
    items: [
      {
        title: "My Job",
        what: "Your personal employment hub: your contract terms, days worked, leave requests, holidays, documents, monthly self-reports, and a place to raise an issue.",
        why: "The goal is total clarity and fairness about your own role — your rate, hours, time off, and reviews, all visible to you. No more uncertainty about where things stand. It's your record, and it makes sure you're looked after.",
        can: [
          "See your contract: rate, weekly hours, start date, notice period, next review.",
          "Log the days and hours you worked.",
          "Request leave and track whether it's approved.",
          "Check public holidays and find your documents.",
          "Write your monthly self-report (what you delivered, challenges, goals).",
          "Raise an issue privately when something needs attention.",
        ],
        how: [
          "Open My Job from the menu.",
          "Use the tabs along the top — Overview, Days Worked, Leave, Holidays, Documents, Self-Reports, Raise an Issue.",
          "Fill in the relevant tab and save.",
        ],
        tip: "Log your days as you go and keep self-reports honest — they're your evidence at review time, and they make the case for you.",
      },
    ],
  },
  {
    heading: "AI tools to do great work",
    blurb: "This is your unfair advantage. The AI already knows your client's business — let it do the heavy lifting so you deliver faster and sharper.",
    items: [
      {
        title: "Coach",
        what: "Ask any question about the client's business in plain English and get an answer built only from their own documents — with a link to where each fact came from.",
        why: "The goal is to make you instantly knowledgeable about a business you may be new to. Instead of interrupting your client with questions, you ask the Brain and get a trustworthy, sourced answer in seconds. It's like having read every document the company owns — so you sound informed from day one.",
        can: [
          "Get instant answers grounded in the client's real information.",
          "Click 'Go deeper' for a longer, more thorough answer.",
          "See the exact source behind every answer, so you can trust it.",
        ],
        how: [
          "Open Coach from the menu.",
          "Type a question (e.g. 'What's our refund policy?') and press Enter.",
          "Want more detail? Click 'Go deeper'.",
        ],
        tip: "Before you ask your client a question, ask the Brain first — half the time the answer's already there, and you'll save everyone time.",
      },
      {
        title: "Create content",
        what: "A guided workspace for marketing drafts—ideas, posts, emails and articles—using company knowledge and voice. Create content starts new work, In progress resumes it and Content library holds drafts and approved work.",
        why: "The goal is to let you produce real marketing work without being a professional copywriter. It handles the first draft on-brand and on-topic; you shape it. The approval step means there's always a safety net before anything is published.",
        can: [
          "Create content from a topic, company-informed idea or competitor opportunity.",
          "Continue unfinished briefs and drafts under In progress.",
          "Refine work and submit it for client approval from Content library.",
        ],
        how: [
          "Open Create in the menu and choose Create content.",
          "Describe what you want (or pick an idea), generate a draft, and refine it.",
          "Submit it for admin approval.",
        ],
        tip: "Feed it a clear, specific brief — the more direction you give, the less editing you'll do afterwards.",
      },
      {
        title: "Tools",
        what: "A growing kit of AI helpers for everyday client work — SEO metadata, Google Business Profile posts, content briefs and more. Each one is grounded in the client's Vault and brand.",
        why: "The goal is to give you ready-to-use output for specialised tasks, not generic filler. Because each tool knows the client's business, what comes out is tailored and usable — so you can take on work that would otherwise need a specialist.",
        can: [
          "Use focused helpers for specific jobs (SEO, posts, briefs, and more).",
          "Get output tailored to the client's brand and information.",
        ],
        how: [
          "Open Tools from the menu and pick the helper you need.",
          "Follow its prompts and use the output.",
        ],
        tip: "Tools is in active development and keeps growing — if there's a helper you wish existed, tell your RapidTal contact; we build based on real requests.",
      },
      {
        title: "Knowledge",
        what: "The client's knowledge base — every document, web page, and note the AI reads to answer questions.",
        why: "The goal is to make every AI tool you use smarter. Everything in the Vault feeds RapidTal Coach, Compose, Content and Tools — so when you add useful information here, all of those get better at helping you. It's worth keeping it current.",
        can: [
          "Add files (PDFs, Word docs), web links, or pasted text.",
          "Make new information instantly searchable by the AI.",
          "Remove anything that's gone out of date.",
        ],
        how: [
          "Open Company in the menu and choose Knowledge.",
          "Upload a file, add a URL, or paste text — the system reads and indexes it automatically.",
        ],
        tip: "When you learn something new about the client that isn't written down, add it here — future-you (and the AI) will thank you.",
      },
      {
        title: "Company profile",
        what: "The core profile of the client's business — who they are, what they offer, their values, and key contacts. Admins edit it; you can view it.",
        why: "The goal is to give you the essentials of the business at a glance, and to anchor every AI answer in the truth. Reading it is the fastest way to understand a new client; it's used in every answer, so it quietly shapes the quality of everything.",
        can: [
          "Read the client's essential details in one place.",
          "Use it to get up to speed quickly on a new placement.",
        ],
        how: [
          "Open Company in the menu and choose Company profile.",
        ],
        tip: "Read it on day one of a new client — it's the quickest possible briefing on who they are and what matters to them.",
      },
      {
        title: "Company Report",
        what: "A health-check of the client's company brain — what the AI knows well, and where the gaps are.",
        why: "The goal is to show you where the knowledge gaps are, so you know what's worth capturing into the Vault. Filling a gap makes every related AI answer better — a small, high-impact win you can deliver.",
        can: [
          "See how complete the client's company knowledge is.",
          "Spot the gaps worth filling first.",
        ],
        how: [
          "Open Company Report from the menu and review the breakdown.",
        ],
        tip: "Turn a weak area into a quick win — add the missing info to the Vault and watch the related answers sharpen up.",
      },
    ],
  },
  {
    heading: "Client work tools",
    blurb: "Practical helpers for the day-to-day of supporting your client.",
    items: [
      {
        title: "Find leads",
        what: "A review-first workspace for finding businesses by type and location before adding suitable leads to the client's CRM.",
        why: "The goal is to turn prospecting into a repeatable VA workflow while keeping the CRM clean. Collection continues in the background, duplicate businesses are recognized, and you decide what is worth pursuing.",
        can: [
          "Search Google Maps or the web for businesses in a target location.",
          "Review, shortlist or dismiss results in the Lead Inbox.",
          "Reuse saved campaigns for recurring prospecting work.",
          "Promote reviewed leads into CRM.",
        ],
        how: [
          "Open Lead Generation and define the business type and location.",
          "Wait for the background collection to finish, or safely continue other work.",
          "Review the Lead Inbox and add suitable businesses to CRM.",
        ],
        tip: "Check the website and location before promoting a lead—the CRM should contain qualified opportunities, not every scraped result.",
      },
      {
        title: "CRM",
        what: "A simple way to track the client's contacts and leads as they move from first contact to closed — with notes and a full history.",
        why: "The goal is to make sure no lead is ever lost and no follow-up forgotten on your watch. Keeping the pipeline tidy is visible, valuable work — your client sees opportunities being managed, not dropped.",
        can: [
          "Add contacts and move them through stages.",
          "Add notes; every change is logged so the team stays in sync.",
        ],
        how: [
          "Open CRM from the menu.",
          "Add a contact, then drag them between stages as they progress.",
        ],
        tip: "Log every interaction as it happens — a well-kept CRM is one of the clearest signs of a great VA.",
      },
      {
        title: "Access",
        what: "A secure, encrypted store for the logins you need (site, username, password).",
        why: "The goal is to get you the access you need to do the work — safely, without anyone pasting passwords into chat. Credentials are encrypted, and every reveal is logged, which protects you too: it's clear and on the record that access was handled properly.",
        can: [
          "Find and use the logins your client has shared with you.",
          "Reveal a credential when you need it (each reveal is logged).",
        ],
        how: [
          "Open Access from the menu.",
          "Find the login you need and reveal it when required.",
        ],
        tip: "Never ask for or share passwords in Messages — always use Access. It keeps everyone safe and you in the clear.",
      },
    ],
  },
  {
    heading: "The shared workspace",
    items: [
      {
        title: "Notebook",
        what: "A private shared workspace for you and your client — SOPs, account registers, content calendars, weekly reports, meeting notes — with ready-made templates to start from.",
        why: "The goal is one trusted home for how the client's business runs, instead of knowledge scattered across email and chat. It's genuinely private: RapidTal admins cannot see anything written here — it belongs to you and your client. Building it up makes you more independent and the work easier over time.",
        can: [
          "Create and co-edit pages with your client in real time.",
          "Start from ready-made templates instead of a blank page.",
          "Keep everything for the placement in one organised place.",
        ],
        how: [
          "Open Notebook from the menu.",
          "Pick a template or create a blank page, then type — changes save automatically and your client sees them.",
        ],
        tip: "Capture the processes you learn here as you go — it makes you faster, and it's a real asset if the work ever needs to be handed over.",
      },
    ],
  },
  {
    heading: "Your account",
    items: [
      {
        title: "My Profile",
        what: "Your personal details and sign-in settings.",
        why: "The goal is simply to keep your contact information current and your account secure — so notifications reach you and signing in stays smooth.",
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
    blurb: "This is a living product, and your feedback shapes it.",
    items: [
      {
        title: "New features & Tools in development",
        what: "The portal is continuously improved. Some areas — especially the AI Tools (helpers for SEO, content, posts and more) — are in active development and will keep gaining capabilities, so you'll see them change and grow over time.",
        why: "The goal is honesty and partnership. Rather than pretend everything is finished, we'd rather tell you what's evolving — and you're the person using these tools every day, so your feedback is gold. What you tell us shapes what gets built next.",
        can: [
          "Expect regular new features and improvements.",
          "Suggest a feature or tool that would make your work easier — if it's within our capabilities, we can build it.",
        ],
        how: [
          "Have an idea or hit a rough edge? Tell your RapidTal contact, or send it via Messages.",
          "We'll let you know if it's something we can add, and roughly when.",
        ],
        tip: "No idea is too small — if something slows you down every day, that's exactly what we want to hear about.",
      },
    ],
  },
];
