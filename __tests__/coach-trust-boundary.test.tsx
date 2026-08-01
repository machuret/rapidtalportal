/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CoachFeedback } from "@/components/brain/CoachFeedback";

const mockSendSignal = jest.fn();
jest.mock("@/hooks/useBrainSignal", () => ({
  useBrainSignal: () => ({ sendSignal: mockSendSignal, isSending: false }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Coach trust boundary", () => {
  beforeEach(() => mockSendSignal.mockReset().mockResolvedValue({ id: "signal" }));

  it("records specific negative feedback as private, reviewed learning", async () => {
    render(
      <CoachFeedback
        clientId="11111111-1111-4111-8111-111111111111"
        question="What should we spend?"
        answer="Spend $5,000."
        snapshotId="22222222-2222-4222-8222-222222222222"
        coachRole="client"
        sources={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Give negative Coach feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Incorrect company fact" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Optional Coach feedback detail" }), {
      target: { value: "The approved budget is $2,000." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save feedback" }));

    await waitFor(() => expect(mockSendSignal).toHaveBeenCalledWith(expect.objectContaining({
      surface: "vault_answer",
      rating: -1,
      dimensions: ["claims"],
      reason: expect.stringContaining("approved budget is $2,000"),
      context: expect.objectContaining({
        visibility: "private_coach",
        learningPolicy: "review_required_no_automatic_company_truth",
      }),
    })));
  });

  it("enforces privacy, audience and impersonation boundaries in every layer", () => {
    const migration = read("db/migrations/134_coach_privacy_and_recipient_boundaries.sql");
    const sendMessage = read("supabase/functions/send-message/index.ts");
    const askRoute = read("app/api/vault/ask/route.ts");
    const coachPage = read("app/(portal)/ask/page.tsx");

    expect(migration).toContain("visibility = 'private_coach' AND user_id = auth.uid()");
    expect(migration).toContain("NEW.visibility = 'private_coach'");
    expect(migration).toContain("audience = 'client' AND current_user_role() = 'client_admin'");
    expect(migration).toContain("audience = 'va_team' AND current_user_role() = 'va'");
    expect(migration.indexOf("ALTER TABLE coach_turns DROP CONSTRAINT IF EXISTS coach_turns_thread_owner_fkey"))
      .toBeLessThan(migration.indexOf("ALTER TABLE coach_threads DROP CONSTRAINT IF EXISTS coach_threads_identity_unique"));
    expect(sendMessage).toContain('audience === "client" && user.role === "client_admin"');
    expect(sendMessage).toContain('audience === "va_team" && user.role === "va"');
    expect(askRoute).toContain("if (impersonating)");
    expect(coachPage).toContain("Coach is paused while viewing as another user");
  });

  it("uses schema-validated editable actions with idempotent receipts", () => {
    const engine = read("supabase/functions/vault-ask/index.ts");
    const ui = read("components/vault/AskVaultClient.tsx");
    const actionRoute = read("app/api/coach/actions/route.ts");
    const resolver = read("supabase/functions/_shared/brain-context.ts");

    expect(engine).toContain('type: "json_schema"');
    expect(engine).toContain("parseCoachActionDraft");
    expect(ui).not.toContain("parseTaskDraft");
    expect(ui).toContain("ROUTES.coach.actions()");
    expect(engine).toContain('from("coach_action_previews").insert');
    expect(actionRoute).toContain('? "execute_coach_progress_action"');
    expect(actionRoute).toContain('? "execute_coach_memory_action"');
    expect(resolver).toContain('from("task_events")');
    expect(resolver).toContain('from("daily_logs")');
    expect(resolver).toContain('from("content_pieces")');
    expect(resolver).toContain('audience.in.(company,va_team)');
    expect(engine).toContain('update_task: "MODE: UPDATE TASK');
    expect(engine).toContain('submit_review: "MODE: SUBMIT FOR REVIEW');
    expect(engine).toContain('review_task: "MODE: REVIEW TASK');
    expect(actionRoute).toContain("coachActionDenial(user.role, action)");
    expect(actionRoute).toContain("va_terminal_status_forbidden");
  });
});
