/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { StylePageClient } from "@/components/content/StylePageClient";

jest.mock("@/components/content/StyleAnalysisManager", () => ({
  StyleAnalysisManager: ({ onApproved }: { onApproved?: (channel: string) => void }) => (
    <div>
      Voice profile review
      <button type="button" onClick={() => onApproved?.("linkedin")}>Approve test profile</button>
    </div>
  ),
}));
jest.mock("@/components/content/VoiceGoldenLibrary", () => ({
  VoiceGoldenLibrary: () => <div>Full example library</div>,
}));
jest.mock("@/components/vault/LinkedInVaultSourcePanel", () => ({
  LinkedInVaultSourcePanel: () => <div>LinkedIn collection settings</div>,
}));
jest.mock("@/components/content/IdealPostQuickAdd", () => ({
  IdealPostQuickAdd: ({ onAdded }: { onAdded?: (channel: string) => void }) => (
    <div>
      Add a writing example
      <button type="button" onClick={() => onAdded?.("linkedin")}>Add test example</button>
    </div>
  ),
}));

const commonProps = {
  clientId: "11111111-1111-4111-8111-111111111111",
  clientName: "Example Company",
  canEdit: true,
  linkedInUrl: "https://linkedin.com/company/example",
  hasDeclaredVoice: false,
  usableByChannel: {},
  voiceSettings: <div>Voice rules editor</div>,
};

describe("client voice simplification", () => {
  test("does not call a voice ready merely because examples exist", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{ linkedin: 7 }}
        usableByChannel={{ linkedin: 7 }}
        approvedAnalysisChannels={[]}
      />,
    );

    expect(screen.getByText("Developing")).toBeVisible();
    expect(screen.getByText(/approve the resulting voice profile before it is used/i)).toBeVisible();
    expect(screen.queryByText("Full example library")).not.toBeInTheDocument();
    expect(screen.queryByText("LinkedIn collection settings")).not.toBeInTheDocument();
  });

  test("reports only genuinely approved channel profiles as ready", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{ linkedin: 7, email: 2 }}
        usableByChannel={{ linkedin: 7, email: 2 }}
        approvedAnalysisChannels={["linkedin"]}
      />,
    );

    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByText(/LinkedIn has an approved voice profile/i)).toBeVisible();
  });

  test("recognises written voice direction without overstating it as Ready", () => {
    render(
      <StylePageClient
        {...commonProps}
        hasDeclaredVoice
        approvedByChannel={{}}
        approvedAnalysisChannels={[]}
      />,
    );

    expect(screen.getByText("Developing")).toBeVisible();
    expect(screen.getByText(/written voice direction is active/i)).toBeVisible();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  test("keeps collection and evaluation infrastructure behind Advanced", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{}}
        approvedAnalysisChannels={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced voice tools/i }));
    expect(screen.getByText("Full example library")).toBeVisible();
    expect(screen.getByText("LinkedIn collection settings")).toBeVisible();
  });

  test("keeps detailed voice rules in the Voice destination without mixing in company facts", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{}}
        approvedAnalysisChannels={[]}
      />,
    );

    expect(screen.getByText("Voice direction and hard rules")).toBeInTheDocument();
    expect(screen.getByText("Voice rules editor")).toBeInTheDocument();
  });

  test("updates readiness immediately when a channel profile is approved", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{}}
        approvedAnalysisChannels={[]}
      />,
    );

    expect(screen.getByText("Generic")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Approve test profile" }));
    expect(screen.getByText("Ready")).toBeVisible();
  });

  test("updates example readiness without reloading the page", () => {
    render(
      <StylePageClient
        {...commonProps}
        approvedByChannel={{}}
        approvedAnalysisChannels={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add test example" }));
    expect(screen.getByText("Developing")).toBeVisible();
    expect(screen.getByText(/1 approved example is ready to analyse/i)).toBeVisible();
  });
});
