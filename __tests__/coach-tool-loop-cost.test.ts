/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCoachToolLoop } from "@/supabase/functions/_shared/coach-tools";

function mockAdmin() {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
  };
  for (const method of ["select", "eq", "in", "or", "order", "limit"] as const) {
    chain[method].mockReturnValue(chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
    data: [{ id: "admin-1", full_name: "Ada", email: "ada@example.com", role: "client_admin" }],
    error: null,
  }));
  return { from: jest.fn(() => chain) };
}

describe("Coach completion budget", () => {
  test("uses the third budgeted call for the answer instead of paying for a fourth", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = jest.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      bodies.push(body);
      if (Array.isArray(body.tools)) {
        return new Response(JSON.stringify({
          choices: [{ message: {
            content: null,
            tool_calls: [{
              id: `call-${bodies.length}`,
              type: "function",
              function: { name: "get_team", arguments: "{}" },
            }],
          } }],
          usage: { total_tokens: 10 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "The grounded answer." } }],
        usage: { total_tokens: 20 },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await runCoachToolLoop({
      admin: mockAdmin(),
      clientId: "client-1",
      actor: { userId: "user-1", coachRole: "client" },
      openrouterKey: "test-key",
      model: "test-model",
      maxTokens: 500,
      messages: [{ role: "user", content: "Who is on the team?" }],
      embed: async () => new Array(384).fill(0),
      fetchImpl,
    });

    expect(result.answer?.content).toBe("The grounded answer.");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(bodies[0]).toHaveProperty("tools");
    expect(bodies[1]).toHaveProperty("tools");
    expect(bodies[2]).not.toHaveProperty("tools");
  });

  test("returns a loop-produced answer through SSE without regenerating it", () => {
    const engine = readFileSync(
      join(process.cwd(), "supabase/functions/vault-ask/index.ts"),
      "utf8",
    );
    expect(engine).toContain("loopAnswer = loop.answer;");
    expect(engine).toContain("if (loopAnswer !== null) {");
    expect(engine).toContain("loopAnswer.content,");
    expect(engine).not.toContain("if (!effectiveStream) loopAnswer = loop.answer");
  });
});
