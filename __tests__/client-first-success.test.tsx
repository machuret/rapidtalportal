import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "@/lib/api-client";
import { ClientFirstSuccessJourney } from "@/components/dashboard/ClientFirstSuccessJourney";
import {
  buildClientFirstSuccessJourney,
  completedFirstSuccessSteps,
  firstIncompleteStep,
  isCompanyCoreComplete,
  isCompanyVoiceConfigured,
  onboardingDocumentStepCount,
} from "@/lib/onboarding/client-first-success";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/lib/api-client", () => ({
  api: { post: jest.fn().mockResolvedValue({}) },
}));

const emptyInput = {
  companyComplete: false,
  readyDocumentCount: 0,
  voiceConfigured: false,
  coachQuestionCount: 0,
  draftCount: 0,
  requestedTaskCount: 0,
  vaAssigned: false,
};

describe("client first-success journey", () => {
  test("turns a fresh tenant into six concrete outcomes with one next action", () => {
    const steps = buildClientFirstSuccessJourney(emptyInput);

    expect(steps).toHaveLength(6);
    expect(completedFirstSuccessSteps(steps)).toBe(0);
    expect(firstIncompleteStep(steps)?.id).toBe("company");
    expect(steps.map((step) => step.href)).toEqual([
      "/company-dna?setup=company",
      "/vault?setup=documents",
      "/company-dna?setup=voice",
      "/ask?setup=first-question",
      "/content/quick?setup=first-draft",
      null,
    ]);
  });

  test("uses real thresholds and advances to the first unfinished outcome", () => {
    const steps = buildClientFirstSuccessJourney({
      ...emptyInput,
      companyComplete: true,
      readyDocumentCount: 2,
      voiceConfigured: true,
      coachQuestionCount: 1,
    });

    expect(completedFirstSuccessSteps(steps)).toBe(3);
    expect(steps.find((step) => step.id === "documents")?.done).toBe(false);
    expect(steps.find((step) => step.id === "documents")?.progressLabel).toBe("2 of 3 searchable");
    expect(firstIncompleteStep(steps)?.id).toBe("documents");
  });

  test("recognises completed journeys and routes completed work to durable records", () => {
    const steps = buildClientFirstSuccessJourney({
      companyComplete: true,
      readyDocumentCount: 8,
      voiceConfigured: true,
      coachQuestionCount: 4,
      draftCount: 2,
      requestedTaskCount: 3,
      vaAssigned: true,
    });

    expect(completedFirstSuccessSteps(steps)).toBe(6);
    expect(firstIncompleteStep(steps)).toBeNull();
    expect(steps.find((step) => step.id === "draft")?.href).toBe("/content/library");
    expect(steps.find((step) => step.id === "task")?.href).toBe("/tasks");

    render(<ClientFirstSuccessJourney clientId="11111111-1111-4111-8111-111111111111" steps={steps} onRequestWork={jest.fn()} />);
    expect(screen.getByLabelText("Starter journey complete")).toBeInTheDocument();
    expect(screen.queryByText("Your first wins")).not.toBeInTheDocument();
  });

  test("keeps live knowledge readiness honest after a historical milestone", () => {
    expect(onboardingDocumentStepCount({
      milestones: ["documents_ready"],
      readyDocumentCount: 1,
    })).toBe(1);
    expect(onboardingDocumentStepCount({ milestones: [], readyDocumentCount: 1 })).toBe(1);

    const documents = buildClientFirstSuccessJourney({
      ...emptyInput,
      readyDocumentCount: 1,
      documentsMilestoneReached: true,
    }).find((step) => step.id === "documents");
    expect(documents).toMatchObject({ done: true, progressLabel: "First milestone reached · 1 currently searchable" });
  });

  test("requires the essential company facts plus one current priority", () => {
    expect(isCompanyCoreComplete({
      company_name: "RapidTal",
      services: "Virtual assistants",
      target_demographic: "Australian SMEs",
      business_goals: "Grow recurring revenue",
    })).toBe(true);
    expect(isCompanyCoreComplete({
      company_name: "RapidTal",
      services: "Virtual assistants",
      target_demographic: "Australian SMEs",
    })).toBe(false);
  });

  test("accepts a declared voice or an approved style profile", () => {
    expect(isCompanyVoiceConfigured({ brand_voice: "Warm and practical" }, 0)).toBe(true);
    expect(isCompanyVoiceConfigured(null, 1)).toBe(true);
    expect(isCompanyVoiceConfigured({ brand_voice: "  ", content_style: "" }, 0)).toBe(false);
  });

  test("opens the task request directly when that is the next action", () => {
    const onRequestWork = jest.fn();
    const steps = buildClientFirstSuccessJourney({
      ...emptyInput,
      companyComplete: true,
      readyDocumentCount: 3,
      voiceConfigured: true,
      coachQuestionCount: 1,
      draftCount: 1,
      vaAssigned: true,
    });

    render(<ClientFirstSuccessJourney clientId="11111111-1111-4111-8111-111111111111" steps={steps} onRequestWork={onRequestWork} />);
    fireEvent.click(screen.getAllByRole("button", { name: /request work/i })[0]);
    expect(onRequestWork).toHaveBeenCalledTimes(1);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText(/account setup/i)).not.toBeInTheDocument();
  });

  test("offers an actionable, idempotent VA assignment request before placement", async () => {
    const steps = buildClientFirstSuccessJourney({
      companyComplete: true,
      readyDocumentCount: 3,
      voiceConfigured: true,
      coachQuestionCount: 1,
      draftCount: 1,
      requestedTaskCount: 0,
      vaAssigned: false,
    });

    const task = steps.find((step) => step.id === "task");
    expect(task).toMatchObject({ done: false, blocked: true, href: null, actionLabel: "Request VA assignment" });
    expect(firstIncompleteStep(steps)).toBeNull();
    render(<ClientFirstSuccessJourney clientId="11111111-1111-4111-8111-111111111111" steps={steps} onRequestWork={jest.fn()} />);
    expect(screen.getByText("Everything you can do now is complete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /request va assignment/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/onboarding/request-va", {}));
    expect(await screen.findByText("VA assignment requested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request sent" })).toBeDisabled();
  });
});
