/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DnaForm } from "@/components/dna/DnaForm";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { api } from "@/lib/api-client";

const saveDna = jest.fn();
const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
jest.mock("@/hooks/useDna", () => ({
  useDna: () => ({ saveDna, isSaving: false, scrapeDna: jest.fn(), isScraping: false }),
}));
jest.mock("@/lib/api-client", () => ({
  api: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), message: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/components/tasks/TaskActivity", () => ({ TaskActivity: () => null }));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const VA_ID = "22222222-2222-4222-8222-222222222222";

describe("focused client onboarding flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveDna.mockResolvedValue({});
  });

  test("voice cannot continue until a meaningful voice field is provided", async () => {
    const user = userEvent.setup();
    render(<DnaForm initialData={null} clientId={CLIENT_ID} readOnly={false} focusMode="voice" />);

    const save = screen.getByRole("button", { name: "Save and continue" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("How should your company sound?"), "Warm, direct and practical");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(saveDna).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      onboardingMilestone: "voice",
      form: expect.objectContaining({ brand_voice: "Warm, direct and practical" }),
    })));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  test("separates company facts from detailed voice configuration", () => {
    const { unmount } = render(
      <DnaForm initialData={null} clientId={CLIENT_ID} readOnly={false} sectionMode="profile" />,
    );
    expect(screen.getByRole("heading", { name: "Company essentials" })).toBeVisible();
    expect(screen.getByText("Additional company details and social links")).toBeVisible();
    expect(screen.getByText(/Fill gaps automatically/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Voice & editorial policy" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save company profile" })).toBeVisible();
    unmount();

    render(
      <DnaForm initialData={null} clientId={CLIENT_ID} readOnly={false} sectionMode="voice" />,
    );
    expect(screen.queryByRole("heading", { name: "Company essentials" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voice & editorial policy" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save voice settings" })).toBeVisible();
  });

  test("starter task request hides project-management settings and requires a VA", async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    (api.post as jest.Mock).mockResolvedValue({ id: "task-1" });
    render(
      <TaskDialog
        mode="create"
        status="todo"
        clientId={CLIENT_ID}
        isAdmin
        members={[{ id: VA_ID, name: "Test VA" }]}
        categories={[{ id: "category-1", name: "Marketing", color: "blue" }]}
        initialAssignedTo={VA_ID}
        starterMode
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText("Request work from your VA")).toBeInTheDocument();
    expect(screen.queryByText("Due date")).not.toBeInTheDocument();
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("e.g. Update the homepage hero copy"), "Prepare August newsletter");
    await user.type(screen.getByPlaceholderText("Anything the VA needs to do this well…"), "Use the approved content plan");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        clientId: CLIENT_ID,
        title: "Prepare August newsletter",
        description: "Use the approved content plan",
        assignedTo: VA_ID,
      }),
    ));
    expect(onSaved).toHaveBeenCalled();
  });
});
