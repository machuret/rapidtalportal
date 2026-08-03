export type ProspectingWorkspaceTab = "find" | "inbox" | "campaigns" | "activity";

const TABS: Array<[ProspectingWorkspaceTab, string]> = [
  ["find", "Find Leads"],
  ["inbox", "Lead Inbox"],
  ["campaigns", "Campaigns"],
  ["activity", "Activity"],
];

export function ProspectingWorkspaceTabs({
  value,
  onChange,
}: {
  value: ProspectingWorkspaceTab;
  onChange: (tab: ProspectingWorkspaceTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3" role="tablist" aria-label="Lead Generation sections">
      {TABS.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            value === tab ? "bg-orange-500 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
