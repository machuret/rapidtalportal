/** @jest-environment node */

import { rankEvidenceCandidates } from "@/lib/content/evidence-ranking";

describe("automatic content evidence ranking", () => {
  test("ranks topic evidence above a newer but unrelated source", () => {
    const unrelated = {
      id: "newest",
      title: "Annual leave policy",
      ai_summary: "How employees request annual leave.",
      raw_content: "Leave requests and manager approvals.",
    };
    const relevant = {
      id: "older",
      title: "Private credit for property investors",
      ai_summary: "How private credit supports property investment opportunities.",
      raw_content: "Private lending can provide flexible property funding.",
    };

    expect(rankEvidenceCandidates(
      "Why private credit matters to property investors",
      [unrelated, relevant],
    ).map((candidate) => candidate.id)).toEqual(["older", "newest"]);
  });

  test("preserves database order when the topic contains no useful terms", () => {
    const candidates = [
      { id: "first", title: "First", ai_summary: null, raw_content: null },
      { id: "second", title: "Second", ai_summary: null, raw_content: null },
    ];

    expect(rankEvidenceCandidates("the and with", candidates)).toEqual(candidates);
  });
});
