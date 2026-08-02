import { contentStructureWarnings } from "@/supabase/functions/_shared/content-quality";
import {
  contentHardRuleWarnings,
  contentStyleWarnings,
  type ResolvedContentStyle,
} from "@/supabase/functions/_shared/content-style";

export interface LiveStyleSnapshot {
  summary?: string[];
  prompt?: string;
  prohibitedPhrases?: string[];
  disallowEmoji?: boolean;
  hardRules?: Array<Record<string, unknown>>;
}

export interface LiveEditorialCheck {
  id: "platform" | "style" | "hard_rules";
  label: string;
  warnings: string[];
}

/** Fast deterministic checks suitable for every editor keystroke. */
export function buildLiveEditorialChecks(
  body: string,
  contentType: string,
  snapshot: LiveStyleSnapshot | null | undefined,
): LiveEditorialCheck[] {
  const resolvedStyle: ResolvedContentStyle = {
    summary: snapshot?.summary ?? [],
    prompt: snapshot?.prompt ?? "",
    prohibitedPhrases: snapshot?.prohibitedPhrases ?? [],
    disallowEmoji: snapshot?.disallowEmoji ?? false,
    hardRules: (snapshot?.hardRules ?? []) as ResolvedContentStyle["hardRules"],
    styleAnalysis: null,
  };
  const hardRules = contentHardRuleWarnings(body, resolvedStyle);
  const style = contentStyleWarnings(body, resolvedStyle)
    .filter((warning) => !hardRules.includes(warning));
  return [
    { id: "platform", label: "Channel structure", warnings: contentStructureWarnings(body, contentType) },
    { id: "style", label: "Voice and terminology", warnings: style },
    { id: "hard_rules", label: "Hard rules", warnings: hardRules },
  ];
}
