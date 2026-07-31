/** @jest-environment node */

jest.mock("@/lib/brain/embed", () => ({
  embedTexts: jest.fn().mockResolvedValue(null),
  cosine: jest.fn(),
}));
jest.mock("@/lib/brain/events", () => ({
  logBrainEvent: jest.fn().mockResolvedValue(undefined),
}));

import { distillClientMemory } from "@/lib/brain/distill";
import { logBrainEvent } from "@/lib/brain/events";
import { embedTexts, cosine } from "@/lib/brain/embed";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_TOKEN = "22222222-2222-4222-8222-222222222222";
const SIGNAL_IDS = [
  "33333333-3333-4333-8333-333333333331",
  "33333333-3333-4333-8333-333333333332",
  "33333333-3333-4333-8333-333333333333",
];

const claimedSignals = SIGNAL_IDS.map((id) => ({
  id,
  surface: "vault_answer",
  artifact_text: "A judged answer",
  rating: -1,
  reason: "Too vague",
  context: { question: "What should be clearer?" },
  distill_claim_token: CLAIM_TOKEN,
}));

function makeAdmin(
  commitResult: { data: unknown; error: unknown },
  existingMemories: unknown[] = [],
) {
  const tableCalls: string[] = [];
  const rpc = jest.fn(async (name: string, _args?: unknown) => {
    if (name === "claim_brain_signals") return { data: claimedSignals, error: null };
    if (name === "commit_brain_distillation") return commitResult;
    if (name === "release_brain_signal_claim") return { data: 3, error: null };
    if (name === "decay_brain_memories") return { data: 0, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });

  const from = jest.fn((table: string) => {
    tableCalls.push(table);
    const result = { data: table === "brain_memory" ? existingMemories : [], error: null };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.lt = chain;
    builder.limit = chain;
    builder.update = chain;
    builder.then = (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });

  return { admin: { rpc, from } as never, rpc, tableCalls };
}

beforeAll(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          memories: [{
            kind: "anti_pattern",
            content: "Avoid vague answers",
            confidence: 80,
            scope: { surfaces: ["ask"] },
            signal_ids: SIGNAL_IDS,
          }],
        }),
      },
    }],
  }), { status: 200 }));
});

test("a failed transactional commit is surfaced, releases the lease, and reports no learning", async () => {
  const { admin, rpc, tableCalls } = makeAdmin({
    data: null,
    error: { message: "memory insert failed" },
  });

  await expect(distillClientMemory(admin, CLIENT_ID))
    .rejects.toThrow("Brain distillation commit failed");

  expect(rpc).toHaveBeenCalledWith("release_brain_signal_claim", {
    p_client_id: CLIENT_ID,
    p_claim_token: CLAIM_TOKEN,
  });
  expect(tableCalls).not.toContain("brain_signals");
  expect(logBrainEvent).not.toHaveBeenCalled();
});

test("success counters and journal entries come only from the committed transaction", async () => {
  const committed = {
    processedSignals: 3,
    newMemories: 1,
    reinforced: 0,
    proposed: 0,
  };
  const { admin, rpc } = makeAdmin({ data: committed, error: null });

  await expect(distillClientMemory(admin, CLIENT_ID)).resolves.toEqual({
    skipped: false,
    ...committed,
  });

  const commitCall = rpc.mock.calls.find(([name]) => name === "commit_brain_distillation");
  expect(commitCall?.[1]).toMatchObject({
    p_client_id: CLIENT_ID,
    p_claim_token: CLAIM_TOKEN,
    p_signal_ids: SIGNAL_IDS,
    p_operations: {
      inserts: [{
        kind: "anti_pattern",
        content: "Avoid vague answers",
        scope: { surfaces: ["ask"] },
        signalIds: SIGNAL_IDS,
      }],
    },
  });
  expect(logBrainEvent).toHaveBeenCalledTimes(1);
});

test("an equivalent scoped lesson reinforces exact signals instead of multiplying", async () => {
  (embedTexts as jest.Mock).mockResolvedValueOnce([[1, 0]]);
  (cosine as jest.Mock).mockReturnValue(0.95);
  const committed = {
    processedSignals: 3,
    newMemories: 0,
    reinforced: 1,
    proposed: 0,
    conflicts: 0,
  };
  const existingId = "77777777-7777-4777-8777-777777777777";
  const { admin, rpc } = makeAdmin({ data: committed, error: null }, [{
    id: existingId,
    kind: "anti_pattern",
    content: "Avoid vague answers",
    confidence: 72,
    source_count: 2,
    embedding: [1, 0],
    scope: { surfaces: ["ask"] },
    status: "active",
  }]);

  await distillClientMemory(admin, CLIENT_ID);

  const commitCall = rpc.mock.calls.find(([name]) => name === "commit_brain_distillation");
  expect(commitCall?.[1]).toMatchObject({
    p_operations: {
      reinforces: [{ id: existingId, signalIds: SIGNAL_IDS }],
      inserts: [],
    },
  });
});

test("opposing feedback in the same task scope enters conflict review", async () => {
  (embedTexts as jest.Mock).mockResolvedValueOnce([[1, 0]]);
  (cosine as jest.Mock).mockReturnValue(0.9);
  (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          memories: [{
            kind: "preference",
            content: "Use detailed answers",
            confidence: 81,
            scope: { surfaces: ["ask"] },
            signal_ids: SIGNAL_IDS,
          }],
        }),
      },
    }],
  }), { status: 200 }));
  const committed = {
    processedSignals: 3,
    newMemories: 0,
    reinforced: 0,
    proposed: 0,
    conflicts: 1,
  };
  const existingId = "88888888-8888-4888-8888-888888888888";
  const { admin, rpc } = makeAdmin({ data: committed, error: null }, [{
    id: existingId,
    kind: "anti_pattern",
    content: "Avoid detailed answers",
    confidence: 76,
    source_count: 4,
    embedding: [1, 0],
    scope: { surfaces: ["ask"] },
    status: "active",
  }]);

  await distillClientMemory(admin, CLIENT_ID);

  const commitCall = rpc.mock.calls.find(([name]) => name === "commit_brain_distillation");
  expect(commitCall?.[1]).toMatchObject({
    p_operations: {
      reinforces: [],
      inserts: [{
        kind: "preference",
        signalIds: SIGNAL_IDS,
        contradictsMemoryId: existingId,
      }],
    },
  });
});
