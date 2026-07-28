export interface CompanyVoiceGolden {
  id: string;
  companyVoice: string;
  contentType: "email" | "linkedin" | "facebook" | "instagram" | "blog" | "newsletter";
  requestedTone: string;
  lengthHint: string;
  objective: string;
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
    objective: "Explain why clear ownership improves workflow hand-offs and invite a useful discussion.",
    dna: {
      brand_voice: "Practical, calm and candid.",
      content_style: "Use short paragraphs and concrete language.",
      internal_rules: "Never promise guaranteed results. Never mention SecretCo.",
      hard_rules: [
        { id: "linkedin-secretco", type: "prohibit_phrase", value: "SecretCo", channels: ["linkedin"] },
        { id: "linkedin-emoji", type: "max_emojis", limit: 0, channels: ["linkedin"] },
      ],
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
    objective: "Invite the local community to share one everyday process the team could make easier.",
    dna: {
      brand_voice: "Warm, neighbourly and encouraging.",
      content_style: "Write like a helpful local, not an advertisement.",
      internal_rules: "Do not mention MegaCorp.",
      hard_rules: [
        { id: "facebook-megacorp", type: "prohibit_phrase", value: "MegaCorp", channels: ["facebook"] },
      ],
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
    objective: "Show a human behind-the-scenes detail that makes the customer experience smoother.",
    dna: {
      brand_voice: "Playful, human and clear.",
      content_style: "Use lively verbs and compact sentences.",
      internal_rules: "Never use fake urgency.",
      hard_rules: [
        { id: "instagram-emoji", type: "max_emojis", limit: 1, channels: ["instagram"] },
      ],
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
    objective: "Confirm the agreed scope and ask whether the recipient wants the next draft prepared.",
    dna: {
      brand_voice: "Direct, respectful and professional.",
      content_style: "State the purpose early and keep paragraphs short.",
      internal_rules: "Never pressure the recipient.",
      hard_rules: [
        { id: "email-emoji", type: "max_emojis", limit: 0, channels: ["email"] },
      ],
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
    objective: "Teach teams a practical, evidence-led method for reviewing and revising business content.",
    dna: {
      brand_voice: "Authoritative, useful and plain-spoken.",
      content_style: "Teach through practical decisions and examples.",
      internal_rules: "Never present opinion as settled fact.",
      hard_rules: [
        { id: "blog-ultimate", type: "prohibit_phrase", value: "ultimate solution", channels: ["blog"] },
      ],
      prohibited_terms: "ultimate solution",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "Offer a practical next step.",
      channel_styles: { blog: "Use descriptive headings and actionable examples." },
    },
    body: `# A Practical Way to Improve Content Reviews

Strong content reviews begin with a shared definition of what good work looks like. Without that definition, reviewers tend to edit according to personal preference. One person shortens the introduction, another changes the tone, and a third questions a detail that was already approved. The draft moves sideways instead of forward. A practical review process gives everyone the same sequence, separates factual checks from editorial judgement, and turns every comment into a decision the writer can act on.

## Start with the objective

Write down the audience, intended outcome and required action before anyone edits the draft. These three points give the review a stable centre. If the goal is to help an existing client understand a process, a dramatic sales hook may be unnecessary. If the goal is to start a useful discussion, a dense explanation may leave no room for response.

The objective should be short enough to repeat during the review. For example: help operations managers recognise one avoidable hand-off and invite them to inspect their own workflow. That sentence identifies the reader, the useful change and the action. A reviewer can now ask whether each paragraph supports that job instead of asking whether they personally like it.

Record required facts and boundaries beside the objective. Include the approved service description, the intended channel, any phrases that must appear, and any claims that must not appear. This keeps essential constraints visible before style decisions begin.

## Separate facts from style

Check factual support first. Names, dates, qualifications, locations, prices and measurable outcomes need an approved source. A sentence can sound polished and still be unsafe if the evidence does not support it. Mark unsupported details clearly, then remove them or replace only the missing value with a placeholder for the subject matter expert.

Once the factual pass is complete, review voice, structure and clarity separately. Ask whether the opening earns attention, whether each section advances the objective, and whether the language resembles the company rather than a generic template. Keeping these passes separate prevents a stylistic preference from being treated as a factual correction.

This order also makes disagreements easier to resolve. Evidence questions go back to Company DNA or the Vault. Style questions go back to the approved voice and channel guidance. Brief questions go back to the stated objective. Reviewers do not need to win an argument; they need to identify which authority decides it.

## Make feedback executable

Replace broad reactions with a specific change the writer can make and verify. “This feels weak” does not explain the problem. “Move the customer problem into the opening and remove the generic first sentence” identifies both the issue and the edit. “Make it more professional” is subjective. “Remove the slang and use the approved service name” can be checked.

Useful feedback usually contains three parts: the location, the reason and the requested change. For example: in the second section, the example introduces a result that is not supported; replace the number with a neutral description of the process. This format reduces interpretation and makes comparison between revisions much easier.

Limit each review round to the decisions that matter. If the draft is structurally wrong, resolve structure before polishing individual words. If the facts are incomplete, confirm them before debating the closing line. A short, ordered list of changes is more useful than a page of disconnected reactions.

## Compare the revision

After the writer responds, compare the revised draft with the previous version. Confirm that the requested changes were made and that they did not introduce new problems. A corrected fact should not break the paragraph around it. A shorter opening should still establish enough context. A new call-to-action should remain consistent with the objective.

Revision history is especially useful when several people participate. It shows what changed, preserves earlier wording, and prevents accidental overwrites. The history should capture the draft, its source references and the style rules applied at that moment, so a later reviewer can understand the decision rather than seeing only the final words.

## Choose the next review

Adopt the process on one current draft before redesigning the entire workflow. Define the objective, verify evidence, review style, write executable feedback and compare the revision. Notice where reviewers still make assumptions or duplicate effort. Then adjust the checklist using what the team learned.

Book a short review of one current draft and apply this sequence from start to finish.`,
    voiceSignals: ["Separate facts from style", "Make feedback executable"],
  },
  {
    id: "editorial-friendly-newsletter",
    companyVoice: "Editorial and friendly",
    contentType: "newsletter",
    requestedTone: "warm",
    lengthHint: "Aim for a standard length appropriate to the format.",
    objective: "Help teams simplify monthly planning by choosing one outcome and making trade-offs visible.",
    dna: {
      brand_voice: "Editorial, friendly and quietly confident.",
      content_style: "Blend a useful observation with a practical takeaway.",
      internal_rules: "Do not use sales pressure.",
      hard_rules: [
        { id: "newsletter-emoji", type: "max_emojis", limit: 0, channels: ["newsletter"] },
      ],
      prohibited_terms: "unmissable deal",
      emoji_policy: "No emojis",
      spelling_locale: "Australian English",
      default_cta_style: "Invite the reader to explore one next step.",
      channel_styles: { newsletter: "Use a clear editorial headline and useful sections." },
    },
    body: `Subject: A simpler way to plan the month ahead

# Make space for the work that matters

A useful plan should reduce noise, not create another layer of administration. Yet monthly planning often begins with a long list of possible projects, recurring requests and unfinished work. Everything looks important when it is viewed alone. The difficult and valuable step is deciding what deserves attention together.

This month, try treating the plan as a set of choices rather than a catalogue of tasks. A clear plan names the outcome, explains why it matters now and gives the team enough room to complete the work properly.

## One useful observation

The clearest priorities are the ones a team can explain in plain language and connect to a real customer need. If a priority needs several slides to justify it, the decision may not be settled yet. People should be able to describe the intended change, who benefits and how they will recognise useful progress.

Clarity also depends on what the plan leaves out. When every request is added, the plan stops guiding decisions. Team members continue to negotiate priorities during the month, often when time is already tight. Naming work that will wait is not negative; it protects the work that has been chosen.

Ask each owner to describe their priority in one sentence. Listen for different interpretations of the same goal. Those differences are easier to resolve during planning than after several people have started moving in different directions.

## A practical tip

Choose one outcome for the month, write down what will not be prioritised, and review the decision with the people doing the work. Then translate the outcome into a small number of visible checkpoints. Checkpoints should help the team learn whether the work is moving, not create a reporting exercise.

For example, a team improving client onboarding might first confirm the required information, then test the revised hand-off, then review where questions still appear. Each checkpoint produces something the team can inspect. That is more useful than a broad status such as “on track”, which can hide uncertainty until the end.

Keep the review short. Ask what changed, what the team learned and whether the original outcome still deserves priority. If conditions have changed, update the decision explicitly. Quietly adding more work creates confusion; a visible trade-off keeps the plan honest.

## Your next step

Set aside fifteen minutes with the current monthly plan. Circle the one outcome that would make the greatest practical difference, underline the work that directly supports it, and mark anything that can wait. If the choice is not obvious, that is the most useful planning conversation to have.

Read your current plan with that outcome in mind, then share the one change that would make it easier to follow.`,
    voiceSignals: ["reduce noise", "A practical tip"],
  },
];
