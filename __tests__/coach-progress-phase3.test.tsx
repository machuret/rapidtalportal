/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CoachProgressPanel } from "@/components/vault/CoachProgressPanel";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
jest.mock("@/lib/api-client", () => ({ api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args), patch: (...args: unknown[]) => mockPatch(...args) } }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Coach Phase 3 progress loop", () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue({ goals: [], commitments: [] });
    mockPost.mockReset().mockResolvedValue({ item: { id: "goal" } });
    mockPatch.mockReset().mockResolvedValue({ item: {} });
  });

  it("requires an explicit save before a private goal exists", async () => {
    render(<CoachProgressPanel clientId="11111111-1111-4111-8111-111111111111" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /my coaching plan/i }));
    fireEvent.click(screen.getByRole("button", { name: /add goal/i }));
    fireEvent.change(screen.getByPlaceholderText("What do you want to achieve?"), { target: { value: "Reach 50 qualified leads" } });
    expect(mockPost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /save private goal/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      "/api/coach/progress",
      expect.objectContaining({ kind: "goal", title: "Reach 50 qualified leads" }),
      expect.any(Object),
    ));
  });

  it("keeps a paused goal paused when progress increases", async () => {
    mockGet.mockResolvedValue({
      goals: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Launch campaign", outcome: "", status: "paused", progress: 25, target_date: null }],
      commitments: [],
    });
    render(<CoachProgressPanel clientId="11111111-1111-4111-8111-111111111111" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /my coaching plan/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /my coaching plan/i }));
    fireEvent.click(screen.getByRole("button", { name: "+25%" }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
      "/api/coach/progress",
      expect.objectContaining({ status: "paused", progress: 50 }),
      expect.any(Object),
    ));
  });

  it("renders check-ins in the signed-in user's calendar timezone", async () => {
    mockGet.mockResolvedValue({
      goals: [],
      commitments: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", goal_id: null,
        commitment: "Prepare the campaign", status: "open", due_date: null,
        next_check_in_at: "2026-08-09T23:00:00.000Z",
      }],
    });
    render(<CoachProgressPanel clientId="11111111-1111-4111-8111-111111111111" timeZone="Australia/Sydney" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /my coaching plan/i }));
    expect(screen.getByText(/Check-in 10 Aug 2026/i)).toBeInTheDocument();
  });

  it("shows retained completed coaching history", async () => {
    mockGet.mockResolvedValue({
      goals: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Reach 50 leads", outcome: "", status: "achieved", progress: 100, target_date: null }],
      commitments: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", goal_id: null, commitment: "Publish landing page", status: "completed", due_date: null, next_check_in_at: null }],
    });
    render(<CoachProgressPanel clientId="11111111-1111-4111-8111-111111111111" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /my coaching plan/i }));
    fireEvent.click(screen.getByText(/Recent wins/i));
    expect(screen.getByText("Reach 50 leads")).toBeInTheDocument();
    expect(screen.getByText("Publish landing page")).toBeInTheDocument();
  });

  it("enforces owner-private storage and atomic progress events", () => {
    const migration = read("db/migrations/138_coach_goals_and_commitments.sql");
    expect(migration).toContain("owner_id = auth.uid() AND client_id = current_user_client_id()");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON coach_goals");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION create_coach_goal");
    expect(migration).toContain("INSERT INTO coach_progress_events");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("deliver_coach_check_in");
    expect(migration).toContain("AT TIME ZONE v_timezone");
  });

  it("retrieves only the authenticated owner's coaching state into snapshot provenance", () => {
    const resolver = read("supabase/functions/_shared/brain-context.ts");
    const contract = read("lib/brain/context-contract.ts");
    expect(resolver).toContain('.eq("client_id", clientId).eq("owner_id", request.actor.userId)');
    expect(resolver).toContain('availability: "unavailable" as const, goals: []');
    expect(resolver).toContain("coachGoalIds: coachGoals.map");
    expect(resolver).toContain("coachCommitmentIds: coachCommitments.map");
    expect(contract).toContain('BRAIN_RESOLVER_VERSION = "resolver-v7-coach-progress"');
    expect(contract).toContain("Coach goal provenance must match");
  });

  it("uses leased, transactional check-ins and exposes no fake activity", () => {
    const cron = read("app/api/cron/coach-check-ins/route.ts");
    const migration = read("db/migrations/138_coach_goals_and_commitments.sql");
    expect(cron).toContain('rpc("claim_due_coach_check_ins"');
    expect(cron).toContain('rpc("deliver_coach_check_in"');
    expect(migration).toContain("check_in_claimed_until = clock_timestamp() + interval '10 minutes'");
    const delivery = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION deliver_coach_check_in"));
    expect(delivery).toContain("INSERT INTO notifications");
    expect(delivery).toContain("INSERT INTO coach_progress_events");
  });

  it("uses secured structured previews for natural-language goals and commitments", () => {
    const migration = read("db/migrations/139_coach_progress_action_integrity.sql");
    const engine = read("supabase/functions/vault-ask/index.ts");
    const actions = read("app/api/coach/actions/route.ts");
    expect(engine).toContain('mode === "create_goal"');
    expect(engine).toContain('mode === "create_commitment"');
    expect(actions).toContain('"execute_coach_progress_action"');
    expect(migration).toContain("v_receipt.payload_hash <> v_payload_hash");
    expect(migration).toContain("p_turn_id");
    expect(migration).toContain("SELECT create_coach_goal");
    expect(migration).toContain("SELECT create_coach_commitment");
  });

  it("prioritises due commitments and records scheduler failures", () => {
    const engine = read("supabase/functions/vault-ask/index.ts");
    const cron = read("app/api/cron/coach-check-ins/route.ts");
    expect(engine).toContain("coachingCommitmentScore");
    expect(engine).toContain('b.category === "coach_commitment"');
    expect(cron).toContain('stage: "claim"');
    expect(cron).toContain("heartbeatRecorded");
    expect(cron).toContain("releaseFailed");
  });
});
