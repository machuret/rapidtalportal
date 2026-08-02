"use client";

import { Lightbulb, PenLine, CheckCircle2 } from "lucide-react";
import { VOICE_GOLDENS_UPDATED_EVENT } from "@/lib/content/style-analysis";
import { StyleAnalysisManager } from "./StyleAnalysisManager";
import { VoiceGoldenLibrary } from "./VoiceGoldenLibrary";
import { LinkedInVaultSourcePanel } from "@/components/vault/LinkedInVaultSourcePanel";
import { IdealPostQuickAdd } from "./IdealPostQuickAdd";

const STEPS = [
  { icon: Lightbulb, title: "1. Add ideal posts", body: "Paste 5+ posts you love per channel. They become approved golden examples instantly." },
  { icon: CheckCircle2, title: "2. The engine analyses", body: "Approved examples + style sources become a per-channel voice profile you can review and approve." },
  { icon: PenLine, title: "3. Everything sounds like you", body: "The approved profile is applied to every draft, idea and tool — before any per-request instruction." },
];

/** /content/style client shell: quick-add + guided explanation + the full tools. */
export function StylePageClient({
  clientId,
  clientName,
  canEdit,
  linkedInUrl,
  approvedByChannel,
}: {
  clientId: string;
  clientName: string;
  canEdit: boolean;
  linkedInUrl: string;
  approvedByChannel: Record<string, number>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <step.icon className="h-4 w-4 text-purple-300" />
            <p className="mt-2 text-sm font-semibold text-white">{step.title}</p>
            <p className="mt-1 text-xs text-zinc-500">{step.body}</p>
          </div>
        ))}
      </div>

      {canEdit && (
        <IdealPostQuickAdd
          clientId={clientId}
          approvedByChannel={approvedByChannel}
          onAdded={() => {
            // No remount, no router.refresh(): both would wipe in-progress
            // analysis edits and half-filled golden forms. Listeners reload
            // their own data in place instead.
            window.dispatchEvent(new CustomEvent(VOICE_GOLDENS_UPDATED_EVENT, {
              detail: { clientId },
            }));
          }}
        />
      )}

      <div className="space-y-6">
        {canEdit && (
          <LinkedInVaultSourcePanel
            clientId={clientId}
            clientName={clientName}
            initialUrl={linkedInUrl}
          />
        )}
        <StyleAnalysisManager
          clientId={clientId}
          clientName={clientName}
          canEdit={canEdit}
        />
        <VoiceGoldenLibrary clientId={clientId} canEdit={canEdit} />
      </div>
    </div>
  );
}
