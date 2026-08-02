/** @jest-environment node */

import { COMPANY_VOICE_GOLDENS } from "@/__fixtures__/content-golden-examples";
import {
  runContentGenerationOrchestration,
  type ContentModelRequest,
} from "@/supabase/functions/_shared/content-generation-orchestration";
import { resolveContentStyle } from "@/supabase/functions/_shared/content-style";
import { CONTENT_TYPE_INSTRUCTIONS } from "@/supabase/functions/_shared/content-quality";

describe("content generation orchestration goldens", () => {
  test.each(COMPANY_VOICE_GOLDENS)(
    "runs the $companyVoice $contentType golden through draft, critique and quality gates",
    async (golden) => {
      const calls: ContentModelRequest[] = [];
      const complete = jest.fn(async (request: ContentModelRequest) => {
        calls.push(request);
        if (request.phase === "draft") return golden.body;
        return JSON.stringify({
          issues: [],
          draft: golden.body,
          sourceItemIds: [],
        });
      });
      const style = resolveContentStyle(
        golden.dna,
        golden.contentType,
        golden.requestedTone,
        golden.lengthHint,
      );
      const contentBrief = {
        version: 1,
        objective: golden.objective,
        tone: golden.requestedTone,
        length: golden.contentType === "blog" ? "long" : "medium",
      };

      const result = await runContentGenerationOrchestration({
        contentType: golden.contentType,
        title: golden.objective,
        contentBrief,
        context: `=== COMPANY CONTEXT ===\n${JSON.stringify(golden.dna)}`,
        style,
        dna: golden.dna,
        sources: [],
        complete,
      });

      expect(calls.map((call) => call.phase)).toEqual(["draft", "critique"]);
      expect(calls[0].system).toContain("WRITING STYLE AUTHORITY");
      expect(calls[0].system).toContain(CONTENT_TYPE_INSTRUCTIONS[golden.contentType]);
      expect(calls[1].user).toContain("DRAFT TO REVIEW");
      expect(result.finalBody).toBe(golden.body);
      expect(result.qualityWarnings).toEqual([]);
    },
  );

  test("a controlled critique cannot smuggle a hard-rule violation past the final gate", async () => {
    const dna = {
      hard_rules: [
        { id: "never-secret", type: "prohibit_phrase", value: "SecretCo", channels: ["linkedin"] },
      ],
    };
    const style = resolveContentStyle(dna, "linkedin", "professional", "Keep it short.");
    const complete = async (request: ContentModelRequest) => request.phase === "draft"
      ? "A practical opening.\n\nA useful explanation.\n\nWhat would you improve?"
      : JSON.stringify({
          issues: [],
          draft: "SecretCo has the answer.\n\nA useful explanation.\n\nWhat would you improve?",
          sourceItemIds: [],
        });

    const result = await runContentGenerationOrchestration({
      contentType: "linkedin",
      title: "A safe draft",
      contentBrief: {
        version: 1,
        objective: "Explain one practical improvement.",
        tone: "professional",
        length: "short",
      },
      context: "No factual source material.",
      style,
      dna,
      sources: [],
      complete,
    });

    expect(result.qualityWarnings).toContain("Remove prohibited hard-rule phrase: “SecretCo”");
  });

  test("selected Vault knowledge remains valid when the model omits source IDs", async () => {
    const dna = {
      company_name: "Equity Access",
      brand_voice: "Clear and practical.",
    };
    const style = resolveContentStyle(dna, "linkedin", "professional", "Keep it short.");
    const body = [
      "A practical option for time-sensitive property finance.",
      "Equity Access offers Hyper Bridge loans with up to 90% LVR.",
      "What would you like to understand about bridging finance?",
    ].join("\n\n");
    const complete = async (request: ContentModelRequest) => request.phase === "draft"
      ? body
      : JSON.stringify({
          issues: [],
          draft: body,
          // Citation metadata is helpful, but generation must not fail merely
          // because the model forgot to repeat a supplied Vault UUID.
          sourceItemIds: [],
        });

    const result = await runContentGenerationOrchestration({
      contentType: "linkedin",
      title: "Understanding bridging finance",
      contentBrief: {
        version: 1,
        objective: "Explain a practical bridging finance option.",
        tone: "professional",
        length: "short",
      },
      context: "Company DNA and selected Vault knowledge.",
      style,
      dna,
      sources: [{
        itemId: "11111111-1111-4111-8111-111111111111",
        title: "Hyper Bridge product sheet",
        kind: "vault_item",
        excerpt: "Equity Access offers Hyper Bridge loans with up to 90% LVR.",
        similarity: null,
      }],
      complete,
    });

    expect(result.blockingWarnings).toEqual([]);
    expect(result.verifiedSources).toHaveLength(1);
    expect(result.critique.grounded).toBe(true);
  });

  test("detects when generation silently replaces the requested topic", async () => {
    const dna = { company_name: "Franka", brand_voice: "Warm and practical." };
    const style = resolveContentStyle(dna, "linkedin", "professional", "Keep it short.");
    const unrelatedBody = [
      "A home should feel comfortable for every family.",
      "Thoughtful furniture can make everyday routines easier.",
      "What would you change in your living room?",
    ].join("\n\n");
    const complete = async () => JSON.stringify({
      issues: [],
      draft: unrelatedBody,
      sourceItemIds: [],
    });

    const result = await runContentGenerationOrchestration({
      contentType: "linkedin",
      title: "Private credit for property investors",
      contentBrief: {
        version: 1,
        objective: "Explain private credit options for property investors.",
        tone: "professional",
        length: "short",
      },
      context: "Company context.",
      style,
      dna,
      sources: [],
      complete: async (request) => request.phase === "draft"
        ? unrelatedBody
        : complete(),
    });

    expect(result.topicWarnings).toEqual([
      "The draft does not follow the requested topic “Private credit for property investors”.",
    ]);
    expect(result.systemPrompt).toContain("working title and objective are binding");
  });

  test("automatically repairs a LinkedIn draft with two calls to action", async () => {
    const dna = { company_name: "Example Co", brand_voice: "Clear and practical." };
    const style = resolveContentStyle(dna, "linkedin", "professional", "Keep it short.");
    const invalidBody = [
      "A practical opening for business owners.",
      "Clear preparation makes the next decision easier.",
      "Contact us to continue.",
      "What would you change?",
    ].join("\n\n");
    const repairedBody = [
      "A practical opening for business owners.",
      "Clear preparation makes the next decision easier.",
      "What would you change?",
    ].join("\n\n");
    const calls: ContentModelRequest[] = [];
    const result = await runContentGenerationOrchestration({
      contentType: "linkedin",
      title: "Practical preparation for business owners",
      contentBrief: {
        version: 1,
        objective: "Explain practical preparation for business owners.",
        tone: "professional",
        length: "short",
      },
      context: "Company context.",
      style,
      dna,
      sources: [],
      complete: async (request) => {
        calls.push(request);
        if (request.phase === "draft") return invalidBody;
        if (request.phase === "structure_repair") {
          return JSON.stringify({ draft: repairedBody, issues: ["Removed the duplicate CTA."] });
        }
        return JSON.stringify({ issues: [], draft: invalidBody, sourceItemIds: [] });
      },
    });

    expect(calls.map((call) => call.phase)).toEqual(["draft", "critique", "structure_repair"]);
    expect(result.finalBody).toBe(repairedBody);
    expect(result.qualityWarnings).toEqual([]);
    expect(result.blockingWarnings).toEqual([]);
  });

  test("blocks a draft when automatic platform repair remains invalid", async () => {
    const dna = { company_name: "Example Co" };
    const style = resolveContentStyle(dna, "linkedin", "professional", "Keep it short.");
    const invalidBody = [
      "A practical opening for business owners.",
      "Clear preparation makes the next decision easier.",
      "Contact us to continue.",
      "What would you change?",
    ].join("\n\n");
    const result = await runContentGenerationOrchestration({
      contentType: "linkedin",
      title: "Practical preparation for business owners",
      contentBrief: {
        version: 1,
        objective: "Explain practical preparation for business owners.",
        tone: "professional",
        length: "short",
      },
      context: "Company context.",
      style,
      dna,
      sources: [],
      complete: async (request) => request.phase === "draft"
        ? invalidBody
        : JSON.stringify({ issues: [], draft: invalidBody, sourceItemIds: [] }),
    });

    expect(result.blockingWarnings).toContain(
      "LinkedIn requires exactly 1 call-to-action or discussion question; found 2.",
    );
  });
});
