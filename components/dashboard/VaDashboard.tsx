"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ContactRound, Search, ChevronDown, ChevronUp, Copy, Check, Plus, ArrowRight, PenLine, ListChecks, Dna, Sparkles } from "lucide-react";
import { CRM_STATUS_META } from "@/lib/crm-config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TimeTracker } from "@/components/dashboard/TimeTracker";

interface KbEntry {
  id: string;
  question: string;
  answer: string;
}

interface RecentContact {
  id: string;
  first_name: string;
  last_name: string | null;
  company: string | null;
  status: string;
  updated_at: string;
}

interface StatusCount {
  status: string;
  count: number;
}

interface VaDashboardProps {
  userName: string;
  clientName: string;
  userId: string;
  kbEntries: KbEntry[];
  recentContacts: RecentContact[];
  statusCounts: StatusCount[];
  vaultCount: number;
  sopCount: number;
  /** Role-aware "my day" / "team today" strip, server-rendered by the page. */
  topSlot?: React.ReactNode;
}


export function VaDashboard({ userName, clientName, userId, kbEntries, recentContacts, statusCounts, vaultCount, sopCount, topSlot }: VaDashboardProps) {
  const [kbSearch, setKbSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filteredKb = kbEntries.filter(e =>
    !kbSearch || e.question.toLowerCase().includes(kbSearch.toLowerCase()) || e.answer.toLowerCase().includes(kbSearch.toLowerCase())
  ).slice(0, 8);

  async function copyAnswer(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const isEmpty = kbEntries.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Good day, {userName} 👋</h1>
        <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{clientName || "Welcome to your portal"}</p>
      </div>

      {/* Role-aware day strip */}
      {topSlot}

      {/* Getting started banner — shown when KB is empty */}
      {isEmpty && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-5">
          <p className="font-semibold text-sm mb-1">Your workspace is ready — here&apos;s what you can do right now:</p>
          <p className="text-zinc-400 text-xs mb-4">The Knowledge Base will appear once your admin adds documents. In the meantime you can already:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: "/crm",     Icon: ContactRound, label: "Add your first contact",    desc: "Start tracking leads and clients",      color: "text-green-400"  },
              { href: "/content", Icon: Sparkles,     label: "Generate content",           desc: "Write emails, posts & blogs with AI",  color: "text-pink-400"   },
              { href: "/sops",    Icon: ListChecks,   label: "Browse SOPs",                desc: "Find your team's step-by-step guides", color: "text-amber-400"  },
            ].map(({ href, Icon, label, desc, color }) => (
              <Link key={href} href={href} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-800/40 px-4 py-3 hover:bg-zinc-800 transition-colors">
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "KB Answers",      value: kbEntries.length,                                              href: "/knowledge-base", color: "text-blue-400"   },
          { label: "Vault Docs",      value: vaultCount,                                                    href: "/vault",          color: "text-purple-400" },
          { label: "SOPs",            value: sopCount,                                                      href: "/sops",           color: "text-amber-400"  },
          { label: "Active Contacts", value: statusCounts.find(s => s.status === "active")?.count ?? 0,     href: "/crm",            color: "text-green-400"  },
        ].map(s => (
          <Link key={s.label} href={s.href} className="surface-card px-4 py-4 hover:bg-zinc-800 transition-colors block">
            <p className={`stat-value ${s.color}`}>{s.value}</p>
            <p className="label-section mt-2">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Main two-column panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* KB Quick Lookup */}
        <div className="surface-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpen className="w-4 h-4 text-blue-400" />
              KB Quick Lookup
            </div>
            <Link href="/knowledge-base" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              All answers <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {kbEntries.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <Input
                  value={kbSearch}
                  onChange={e => setKbSearch(e.target.value)}
                  placeholder="Search questions…"
                  className="pl-8 h-8 text-sm bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto max-h-96 px-4 pb-4 flex flex-col gap-2 pt-2">
            {kbEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <BookOpen className="w-8 h-8 text-zinc-700" />
                <div>
                  <p className="text-sm font-medium text-zinc-400">Knowledge Base not set up yet</p>
                  <p className="text-xs text-zinc-500 mt-1">Your admin needs to add documents to the Vault<br/>and generate the KB. Check back soon.</p>
                </div>
                <Link href="/company-dna">
                  <Button variant="outline" size="sm">
                    <Dna className="w-3.5 h-3.5" /> View Company Info
                  </Button>
                </Link>
              </div>
            ) : filteredKb.length === 0 ? (
              <p className="text-zinc-600 text-sm py-6 text-center">No results for &quot;{kbSearch}&quot;</p>
            ) : filteredKb.map(e => (
              <div key={e.id} className="rounded-lg bg-zinc-800 border border-zinc-700/50">
                <button
                  className="w-full flex items-start justify-between gap-2 px-3 py-2.5 text-left"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <p className="text-sm font-medium leading-snug">{e.question}</p>
                  {expanded === e.id
                    ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                    : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />}
                </button>
                {expanded === e.id && (
                  <div className="px-3 pb-3 border-t border-zinc-700/50 pt-2.5">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{e.answer}</p>
                    <button
                      onClick={() => copyAnswer(e.id, e.answer)}
                      className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {copied === e.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied === e.id ? "Copied!" : "Copy answer"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CRM Panel */}
        <div className="surface-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 font-semibold">
              <ContactRound className="w-4 h-4 text-green-400" />
              CRM
            </div>
            <Link href="/crm" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              All contacts <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {statusCounts.length > 0 && (
            <div className="flex gap-2 px-5 pt-3 pb-2 flex-wrap">
              {statusCounts.map(s => (
                <span key={s.status} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CRM_STATUS_META[s.status]?.cls ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
                  {s.count} {s.status}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto max-h-96 px-4 pb-2 flex flex-col gap-2 pt-3">
            {recentContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                <ContactRound className="w-8 h-8 text-zinc-700" />
                <div>
                  <p className="text-sm font-medium text-zinc-400">No contacts yet</p>
                  <p className="text-xs text-zinc-500 mt-1">Add your first lead or client to start tracking your pipeline.</p>
                </div>
                <Link href="/crm">
                  <Button size="sm" className="text-xs h-8">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />Add first contact
                  </Button>
                </Link>
              </div>
            ) : recentContacts.map(c => (
              <Link
                key={c.id}
                href="/crm"
                className="flex items-center gap-3 rounded-lg bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 hover:bg-zinc-700/60 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                  {c.first_name[0]}{c.last_name?.[0] ?? ""}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-zinc-500 truncate">{c.company ?? "—"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${CRM_STATUS_META[c.status]?.cls ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
                  {c.status}
                </span>
              </Link>
            ))}
          </div>

          <div className="px-4 pb-4 pt-2 border-t border-zinc-800 mt-auto">
            <Link href="/crm">
              <Button size="sm" className="w-full text-xs h-8">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add Contact
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Time Tracker */}
      <TimeTracker userId={userId} />

      {/* Quick launch */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/sops",           Icon: ListChecks,   label: "Browse SOPs",    color: "text-amber-400"  },
          { href: "/content",        Icon: PenLine,      label: "Create Content", color: "text-pink-400"   },
          { href: "/knowledge-base", Icon: BookOpen,     label: "Full KB",        color: "text-blue-400"   },
          { href: "/company-dna",    Icon: Dna,          label: "Company Info",   color: "text-purple-400" },
        ].map(q => (
          <Link
            key={q.href}
            href={q.href}
            className="surface-card px-4 py-4 hover:bg-zinc-800 transition-colors flex items-center gap-3"
          >
            <q.Icon className={`w-5 h-5 shrink-0 ${q.color}`} />
            <span className="text-sm font-medium">{q.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
