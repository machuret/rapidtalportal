export interface CompanyVoiceGolden {
  id: string;
  companyVoice: string;
  contentType: "email" | "linkedin" | "facebook" | "instagram" | "blog" | "newsletter";
  requestedTone: string;
  lengthHint: string;
  dna: Record<string, unknown>;
  body: string;
  voiceSignals: string[];
}

/**
 * Anonymous editorial goldens. They model the supported voice archetypes
 * without copying any tenant's private Company DNA into the repository.
 */
export const COMPANY_VOICE_GOLDENS: CompanyVoiceGolden[] = [
  {
    id: "practical-candid-linkedin",
    companyVoice: "Practical and candid",
    contentType: "linkedin",
    requestedTone: "authoritative",
    lengthHint: "Keep it brief and punchy.",
    dna: {
      brand_voice: "Practical, calm and candid.",
      content_style: "Use short paragraphs and concrete language.",
      internal_rules: "Never promise guaranteed results. Never mention SecretCo.",
      prohibited_terms: "game-changing, world-class",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "End with one useful discussion question.",
      channel_styles: { linkedin: "Lead with a clear observation; avoid hype." },
    },
    body: `A clearer process beats another rushed promise.

When ownership is visible, teams can focus on the work instead of chasing updates.

Start with the next hand-off, name the owner, and make the expected outcome explicit.

What part of your workflow would you simplify first?`,
    voiceSignals: ["clearer process", "Start with the next hand-off"],
  },
  {
    id: "warm-local-facebook",
    companyVoice: "Warm and local",
    contentType: "facebook",
    requestedTone: "friendly",
    lengthHint: "Aim for a standard length appropriate to the format.",
    dna: {
      brand_voice: "Warm, neighbourly and encouraging.",
      content_style: "Write like a helpful local, not an advertisement.",
      internal_rules: "Do not mention MegaCorp.",
      prohibited_terms: "limited-time miracle",
      emoji_policy: "Use sparingly",
      spelling_locale: "Australian English",
      default_cta_style: "Invite the community to share.",
      channel_styles: { facebook: "Start with a relatable local moment." },
    },
    body: `Good work often starts with a simple conversation.

If there is something your local team could make easier, tell us what would help. We are listening and happy to point you in the right direction.`,
    voiceSignals: ["simple conversation", "We are listening"],
  },
  {
    id: "playful-human-instagram",
    companyVoice: "Playful and human",
    contentType: "instagram",
    requestedTone: "playful",
    lengthHint: "Keep it brief and punchy.",
    dna: {
      brand_voice: "Playful, human and clear.",
      content_style: "Use lively verbs and compact sentences.",
      internal_rules: "Never use fake urgency.",
      prohibited_terms: "act now, life-changing",
      emoji_policy: "One emoji is welcome when it adds meaning",
      spelling_locale: "Australian English",
      channel_styles: { instagram: "Show the human detail behind the work." },
    },
    body: `Caption:
Small detail, smoother day. That is the kind of progress we like. ✨

Visual direction: A candid close-up of the team preparing the workspace in natural light.

#BehindTheWork #SmallWins`,
    voiceSignals: ["Small detail, smoother day", "progress we like"],
  },
  {
    id: "direct-professional-email",
    companyVoice: "Direct and professional",
    contentType: "email",
    requestedTone: "professional",
    lengthHint: "Keep it brief and punchy.",
    dna: {
      brand_voice: "Direct, respectful and professional.",
      content_style: "State the purpose early and keep paragraphs short.",
      internal_rules: "Never pressure the recipient.",
      prohibited_terms: "urgent opportunity",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "Ask one specific question.",
      sign_off: "Kind regards",
      channel_styles: { email: "Make the requested next step unambiguous." },
    },
    body: `Subject: Confirming the next step

Hi Jordan,

I am writing to confirm the scope we discussed and make sure the next action is clear.

Would you like us to prepare the draft for your review?

Kind regards
The team`,
    voiceSignals: ["confirm the scope", "next action is clear"],
  },
  {
    id: "authoritative-useful-blog",
    companyVoice: "Authoritative and useful",
    contentType: "blog",
    requestedTone: "authoritative",
    lengthHint: "Be comprehensive and detailed.",
    dna: {
      brand_voice: "Authoritative, useful and plain-spoken.",
      content_style: "Teach through practical decisions and examples.",
      internal_rules: "Never present opinion as settled fact.",
      prohibited_terms: "ultimate solution",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "Offer a practical next step.",
      channel_styles: { blog: "Use descriptive headings and actionable examples." },
    },
    body: `# A Practical Way to Improve Content Reviews

Strong reviews begin with a shared definition of what good work looks like.

## Start with the objective

Write down the audience, intended outcome and required action before anyone edits the draft.

## Separate facts from style

Check factual support first. Then review voice, structure and clarity as a separate pass.

## Make feedback executable

Replace broad reactions with a specific change the writer can make and verify.

## Choose the next review

Book a short review of one current draft and apply the same checklist from start to finish.`,
    voiceSignals: ["Separate facts from style", "Make feedback executable"],
  },
  {
    id: "editorial-friendly-newsletter",
    companyVoice: "Editorial and friendly",
    contentType: "newsletter",
    requestedTone: "warm",
    lengthHint: "Aim for a standard length appropriate to the format.",
    dna: {
      brand_voice: "Editorial, friendly and quietly confident.",
      content_style: "Blend a useful observation with a practical takeaway.",
      internal_rules: "Do not use sales pressure.",
      prohibited_terms: "unmissable deal",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "Invite the reader to explore one next step.",
      channel_styles: { newsletter: "Use a clear editorial headline and useful sections." },
    },
    body: `Subject: A simpler way to plan the month ahead

# Make space for the work that matters

A useful plan should reduce noise, not create another layer of administration.

## One useful observation

The clearest priorities are the ones a team can explain in plain language and connect to a real customer need.

## A practical tip

Choose one outcome for the month, write down what will not be prioritised, and review the decision with the people doing the work.

## Your next step

Read your current plan with that outcome in mind, then share the one change that would make it easier to follow.`,
    voiceSignals: ["reduce noise", "A practical tip"],
  },
];
