"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { ClientFirstSuccessStepId } from "@/lib/onboarding/client-first-success";

export function OnboardingStepReporter({
  clientId,
  step,
}: {
  clientId: string;
  step: ClientFirstSuccessStepId;
}) {
  useEffect(() => {
    void api.post(
      ROUTES.onboarding.events(),
      { clientId, step, eventType: "step_viewed", metadata: {} },
      { showErrorToast: false },
    ).catch(() => undefined);
  }, [clientId, step]);
  return null;
}
