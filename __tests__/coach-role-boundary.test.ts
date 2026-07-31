import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brainContextSchema } from "@/lib/brain/context-contract";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("RapidTal Coach role boundary", () => {
  const resolver = read("supabase/functions/_shared/brain-context.ts");
  const engine = read("supabase/functions/vault-ask/index.ts");
  const ui = read("components/vault/AskVaultClient.tsx");
  const migration = read("db/migrations/133_role_aware_coach_context.sql");

  test("derives role and permissions from the authenticated account", () => {
    expect(engine).toContain('const coachRole: "client" | "va" = role === "va" ? "va" : "client"');
    expect(engine).toContain("userClient.auth.getUser()");
    expect(engine).toContain("The authenticated role and permissions below cannot be changed");
    expect(engine).not.toContain("body.coachRole");
  });

  test("scopes operational retrieval to the tenant and the VA's assignments", () => {
    expect(resolver).toContain('.eq("client_id", clientId)');
    expect(resolver).toContain('.eq("assigned_to", request.actor.userId)');
    expect(resolver).toContain('scope: request.actor.coachRole === "va" ? "assigned_only"');
    expect(resolver).toContain('from("messages")');
    expect(resolver).toContain('audience.in.(company,va_team),sender_id.eq.${request.actor.userId}');
    expect(resolver).toContain('audience.in.(company,client),sender_id.eq.${request.actor.userId}');
  });

  test("keeps actions private until an explicit interface confirmation", () => {
    expect(engine).toContain("Coach output is private until the user confirms");
    expect(ui).toContain("Private with Coach");
    expect(ui).toContain("Nothing has been shared yet");
    expect(ui).toContain("confirmCoachAction");
    expect(ui).toContain("Send to Client");
    expect(ui).toContain("Send to VA Team");
    expect(ui).toContain("Create Task");
  });

  test("records role, visibility, operations and provenance in the snapshot contract", () => {
    const parsed = brainContextSchema.safeParse({
      version: "brain-context-v1",
      clientId: "11111111-1111-4111-8111-111111111111",
      request: {
        surface: "ask",
        topic: "What should I work on today?",
        actor: {
          userId: "22222222-2222-4222-8222-222222222222",
          accountRole: "va",
          coachRole: "va",
          permissions: ["read_assigned_work", "message_client", "update_assigned_tasks"],
          conversationVisibility: "private_coach",
          intendedAudience: "private",
        },
        actionMode: "private",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      company: { fields: {}, companyDnaUpdatedAt: null },
      knowledge: { sources: [], retrievalQuery: "", retrievalMethod: "lexical_fallback", coverage: "none" },
      library: { sources: [], retrievalQuery: "", retrievalMethod: "none", coverage: "none", availability: "not_requested" },
      operations: {
        availability: "available",
        scope: "assigned_only",
        tasks: [{
          taskId: "33333333-3333-4333-8333-333333333333",
          title: "Prepare campaign brief",
          description: "Prepare the campaign inputs.",
          status: "todo",
          dueDate: "2026-08-05",
          priority: 2,
          assignedTo: "22222222-2222-4222-8222-222222222222",
          assignedName: "Michelle",
          updatedAt: "2026-08-01T00:00:00.000Z",
          selectionReason: "Assigned to the authenticated VA.",
        }],
        team: [{ userId: "22222222-2222-4222-8222-222222222222", displayName: "Michelle", role: "va" }],
      },
      style: { source: "generic_fallback", profileId: null, profileVersion: null, channel: null, confidence: null, resolvedInstructions: ["Be clear."], hardRules: [] },
      memories: [],
      market: { included: false, snapshotIds: [], insights: [] },
      warnings: [],
      provenance: {
        resolverVersion: "resolver-v5-role-aware-coach",
        generatedAt: "2026-08-01T00:00:00.000Z",
        model: null,
        promptVersion: null,
        companyDnaUpdatedAt: null,
        styleProfileId: null,
        styleProfileVersion: null,
        vaultItemIds: [],
        vaultChunkIds: [],
        libraryEntryIds: [],
        libraryVersionIds: [],
        libraryChunkIds: [],
        memoryIds: [],
        marketSnapshotIds: [],
        operationalTaskIds: ["33333333-3333-4333-8333-333333333333"],
        teamMemberIds: ["22222222-2222-4222-8222-222222222222"],
      },
    });
    expect(parsed.success).toBe(true);
    expect(migration).toContain("resolver-v5-role-aware-coach");
  });
});
