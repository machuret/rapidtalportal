"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  COMPANY_VOICE_UPDATED_EVENT,
  STYLE_ANALYSIS_CHANNELS,
  VOICE_GOLDENS_UPDATED_EVENT,
  type StyleAnalysisResponse,
} from "@/lib/content/style-analysis";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { StyleAnalysisManager } from "./StyleAnalysisManager";
import { VoiceGoldenLibrary } from "./VoiceGoldenLibrary";
import { LinkedInVaultSourcePanel } from "@/components/vault/LinkedInVaultSourcePanel";
import { IdealPostQuickAdd } from "./IdealPostQuickAdd";

/** Everyday voice controls first; collection and calibration tools stay under
 * an explicit Advanced disclosure rather than competing in the main journey. */
export function StylePageClient({
  clientId,
  clientName,
  canEdit,
  linkedInUrl,
  approvedByChannel,
  usableByChannel,
  hasDeclaredVoice,
  approvedAnalysisChannels,
  voiceSettings,
}: {
  clientId: string;
  clientName: string;
  canEdit: boolean;
  linkedInUrl: string;
  approvedByChannel: Record<string, number>;
  usableByChannel: Record<string, number>;
  hasDeclaredVoice: boolean;
  approvedAnalysisChannels: string[];
  voiceSettings: ReactNode;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exampleCounts, setExampleCounts] = useState(approvedByChannel);
  const [sourceCounts, setSourceCounts] = useState(usableByChannel);
  const [analysisChannels, setAnalysisChannels] = useState(approvedAnalysisChannels);
  const [declaredVoice, setDeclaredVoice] = useState(hasDeclaredVoice);

  const refreshVoiceSummary = useCallback(async () => {
    try {
      const result = await api.get<StyleAnalysisResponse>(
        ROUTES.content.styleAnalysisForClient(clientId),
        { showErrorToast: false },
      );
      setAnalysisChannels(STYLE_ANALYSIS_CHANNELS.filter((channel) => Boolean(result.channels[channel]?.approved)));
      setExampleCounts(Object.fromEntries(STYLE_ANALYSIS_CHANNELS.map((channel) => [
        channel,
        result.channels[channel]?.calibration.approvedGoldenCount ?? 0,
      ])));
      setSourceCounts(Object.fromEntries(STYLE_ANALYSIS_CHANNELS.map((channel) => [
        channel,
        result.channels[channel]?.sources.filter((source) => source.status === "ready" && source.character_count >= 40).length ?? 0,
      ])));
    } catch {
      // The full manager below owns the visible load error and retry state.
      // Keep the last valid summary instead of falsely dropping readiness.
    }
  }, [clientId]);

  useEffect(() => {
    function goldensUpdated(event: Event) {
      if ((event as CustomEvent<{ clientId?: string }>).detail?.clientId === clientId) {
        void refreshVoiceSummary();
      }
    }
    function voiceUpdated(event: Event) {
      if ((event as CustomEvent<{ clientId?: string }>).detail?.clientId === clientId) {
        setDeclaredVoice(true);
      }
    }
    window.addEventListener(VOICE_GOLDENS_UPDATED_EVENT, goldensUpdated);
    window.addEventListener(COMPANY_VOICE_UPDATED_EVENT, voiceUpdated);
    return () => {
      window.removeEventListener(VOICE_GOLDENS_UPDATED_EVENT, goldensUpdated);
      window.removeEventListener(COMPANY_VOICE_UPDATED_EVENT, voiceUpdated);
    };
  }, [clientId, refreshVoiceSummary]);

  const totalExamples = useMemo(
    () => Object.values(sourceCounts).reduce((total, count) => total + count, 0),
    [sourceCounts],
  );
  const approvedChannels = [...new Set(analysisChannels)].sort();
  const voiceState = approvedChannels.length > 0
    ? {
        label: "Ready",
        colour: "text-green-300",
        body: `${approvedChannels.map((channel) => channel.charAt(0).toUpperCase() + channel.slice(1)).join(", ")} ${approvedChannels.length === 1 ? "has an approved voice profile" : "have approved voice profiles"}.`,
      }
    : totalExamples > 0
      ? { label: "Developing", colour: "text-amber-300", body: `${totalExamples} approved example${totalExamples === 1 ? " is" : "s are"} ready to analyse. Approve the resulting voice profile before it is used.` }
      : declaredVoice
        ? { label: "Developing", colour: "text-amber-300", body: "Your written voice direction is active. Add owned examples and approve a channel profile to make it more distinctive." }
        : { label: "Generic", colour: "text-zinc-300", body: "No approved writing examples or voice direction yet. Drafts use your Company Profile and professional channel defaults." };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">Current voice</p>
        <p className={`mt-2 text-xl font-semibold ${voiceState.colour}`}>{voiceState.label}</p>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{voiceState.body}</p>
        <p className="mt-3 text-xs text-zinc-500">Add examples you genuinely like. RapidTal analyses them, then you review and approve the resulting channel voice before it is used.</p>
      </section>

      <details className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white">
          Voice direction and hard rules
        </summary>
        <div className="border-t border-zinc-800 p-4">
          <p className="mb-4 text-xs leading-5 text-zinc-500">Optional detailed controls for global wording, channel instructions, claims and rules enforced on every draft.</p>
          {voiceSettings}
        </div>
      </details>

      {canEdit && (
        <IdealPostQuickAdd
          clientId={clientId}
          approvedByChannel={exampleCounts}
          onAdded={(channel) => {
            setExampleCounts((current) => ({ ...current, [channel]: (current[channel] ?? 0) + 1 }));
            setSourceCounts((current) => ({ ...current, [channel]: (current[channel] ?? 0) + 1 }));
            // No remount, no router.refresh(): both would wipe in-progress
            // analysis edits and half-filled golden forms. Listeners reload
            // their own data in place instead.
            window.dispatchEvent(new CustomEvent(VOICE_GOLDENS_UPDATED_EVENT, {
              detail: { clientId },
            }));
          }}
        />
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Review your voice profile</h2>
          <p className="mt-1 text-sm text-zinc-500">Review what RapidTal learned for each channel and approve only what feels right.</p>
        </div>
        <StyleAnalysisManager
          clientId={clientId}
          clientName={clientName}
          canEdit={canEdit}
          onApproved={(channel) => setAnalysisChannels((current) => [...new Set([...current, channel])])}
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <SlidersHorizontal className="h-4 w-4 text-zinc-500" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-200">Advanced voice tools</span>
            <span className="mt-0.5 block text-xs text-zinc-500">Collect LinkedIn examples and manage the full evaluation library.</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="space-y-6 border-t border-zinc-800 p-4">
            {canEdit && (
              <LinkedInVaultSourcePanel
                clientId={clientId}
                clientName={clientName}
                initialUrl={linkedInUrl}
              />
            )}
            <VoiceGoldenLibrary clientId={clientId} canEdit={canEdit} />
          </div>
        )}
      </section>
    </div>
  );
}
