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
});
