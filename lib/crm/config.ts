// Shared CRM status configuration — single source of truth for status colours and labels.
// Consumed by CrmBoard and VaDashboard (and any future components).

export const CRM_STATUS_META: Record<string, { label: string; cls: string }> = {
  lead:     { label: "Lead",     cls: "bg-zinc-700/60 text-zinc-300 border-zinc-600" },
  prospect: { label: "Prospect", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active:   { label: "Active",   cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  inactive: { label: "Inactive", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  closed:   { label: "Closed",   cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export const CRM_STATUSES = Object.keys(CRM_STATUS_META) as Array<keyof typeof CRM_STATUS_META>;
