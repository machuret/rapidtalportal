"use client";

import { useState } from "react";
import { AskVaultClient } from "./AskVaultClient";
import { GoldenQuestions } from "./GoldenQuestions";

/** Ask-as-Client with the golden-questions panel wired into the chat. */
export function AdminAskClient({ clientId, companyName }: { clientId: string; companyName: string }) {
  const [externalAsk, setExternalAsk] = useState<{ q: string; nonce: number } | null>(null);

  return (
    <>
      <GoldenQuestions clientId={clientId} onAsk={(q) => setExternalAsk({ q, nonce: Date.now() })} />
      <AskVaultClient
        clientId={clientId}
        companyName={companyName}
        canCurate
        coachRole="client"
        speakerName="Super Admin"
        actionsEnabled={false}
        externalAsk={externalAsk}
      />
    </>
  );
}
