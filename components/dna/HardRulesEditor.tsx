"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldTip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ContentHardRule,
  ContentHardRuleType,
} from "@/supabase/functions/_shared/content-style";

const RULE_TYPES: { value: ContentHardRuleType; label: string; numeric?: boolean }[] = [
  { value: "prohibit_phrase", label: "Must not contain" },
  { value: "require_phrase", label: "Must contain" },
  { value: "require_prefix", label: "Must start with" },
  { value: "require_suffix", label: "Must end with" },
  { value: "min_words", label: "Minimum words", numeric: true },
  { value: "max_words", label: "Maximum words", numeric: true },
  { value: "max_emojis", label: "Maximum emojis", numeric: true },
];

const CHANNELS = [
  { value: "all", label: "Every channel" },
  { value: "x", label: "X / Twitter" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "email", label: "Email" },
  { value: "newsletter", label: "Newsletter" },
  { value: "blog", label: "Blog" },
  { value: "message", label: "Message" },
  { value: "other", label: "Other" },
] as const;

function newRule(): ContentHardRule {
  return {
    id: crypto.randomUUID(),
    type: "prohibit_phrase",
    value: "",
    channels: [],
  };
}

export function HardRulesEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: ContentHardRule[];
  onChange: (rules: ContentHardRule[]) => void;
  readOnly?: boolean;
}) {
  function update(id: string, updates: Partial<ContentHardRule>) {
    onChange(value.map((rule) => rule.id === id ? { ...rule, ...updates } : rule));
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        {value.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">No deterministic hard rules set</p>
        ) : value.map((rule) => {
          const type = RULE_TYPES.find((item) => item.value === rule.type)?.label ?? rule.type;
          const scope = rule.channels?.length ? rule.channels.join(", ") : "every channel";
          return (
            <p key={rule.id} className="text-sm text-zinc-200">
              {type}: {rule.value ?? rule.limit} <span className="text-zinc-500">· {scope}</span>
            </p>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">
            Deterministic hard rules
            <FieldTip text="Rules enforced by code — never by model judgement. 'Must/must-not contain' checks the draft text; prefix/suffix pins how it opens or closes; word and emoji limits are numeric. Anything that needs nuance belongs in Priority Editorial Guidance instead." />
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            These rules are checked by code after generation and again before approval. Use Internal Rules below for guidance that still requires editorial judgement.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, newRule()])}>
          <Plus className="w-3.5 h-3.5 mr-1" />Add rule
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-zinc-500">No hard rules configured.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {value.map((rule) => {
            const definition = RULE_TYPES.find((item) => item.value === rule.type) ?? RULE_TYPES[0];
            return (
              <div key={rule.id} className="grid grid-cols-1 md:grid-cols-[180px_1fr_160px_36px] gap-2 items-center">
                <Select
                  value={rule.type}
                  onValueChange={(next) => {
                    const type = next as ContentHardRuleType;
                    const numeric = RULE_TYPES.find((item) => item.value === type)?.numeric;
                    update(rule.id, numeric
                      ? { type, value: undefined, limit: rule.limit ?? 0 }
                      : { type, value: rule.value ?? "", limit: undefined });
                  }}
                >
                  <SelectTrigger className="w-full bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {definition.numeric ? (
                  <Input
                    type="number"
                    min={0}
                    max={50000}
                    value={rule.limit ?? 0}
                    onChange={(event) => update(rule.id, { limit: Number(event.target.value) })}
                    className="bg-zinc-900 border-zinc-700"
                  />
                ) : (
                  <Input
                    value={rule.value ?? ""}
                    onChange={(event) => update(rule.id, { value: event.target.value })}
                    placeholder="Exact phrase"
                    className="bg-zinc-900 border-zinc-700"
                  />
                )}

                <Select
                  value={rule.channels?.[0] ?? "all"}
                  onValueChange={(channel) => update(rule.id, {
                    channels: channel === "all" || channel === null ? [] : [channel],
                  })}
                >
                  <SelectTrigger className="w-full bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove hard rule"
                  onClick={() => onChange(value.filter((item) => item.id !== rule.id))}
                  className="text-zinc-500 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
