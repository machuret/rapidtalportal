"use client";

import React from "react";

/**
 * Minimal, dependency-free markdown renderer for dossier/catalog content.
 * Builds React nodes directly (no dangerouslySetInnerHTML, so it's XSS-safe).
 * Supports headings, bullet/numbered lists, bold/italic/code, links, and the
 * "(source: URL)" citations the dossier emits. Deliberately small — this isn't
 * a full CommonMark engine, just enough to read our generated documents well.
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold**, *italic*, `code`, [label](url), and bare URLs.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) nodes.push(<strong key={k} className="font-semibold text-zinc-100">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={k} className="text-xs bg-zinc-800 rounded px-1 py-0.5 text-zinc-200">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm) nodes.push(<a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{mm[1]}</a>);
    } else if (tok.startsWith("http")) {
      nodes.push(<a key={k} href={tok} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 break-all">{tok}</a>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={k} className="italic">{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    const items = list.items;
    blocks.push(
      <Tag key={`l${key++}`} className={list.ordered ? "list-decimal pl-5 space-y-1 my-2" : "list-disc pl-5 space-y-1 my-2"}>
        {items.map((it, idx) => <li key={idx} className="text-sm text-zinc-300 leading-relaxed">{renderInline(it, `li${key}-${idx}`)}</li>)}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls = level === 1 ? "text-xl font-bold text-white mt-5 mb-2"
        : level === 2 ? "text-base font-semibold text-zinc-100 mt-5 mb-1.5 border-b border-zinc-800 pb-1"
        : "text-sm font-semibold text-zinc-200 mt-3 mb-1";
      blocks.push(<div key={`h${key++}`} className={cls}>{renderInline(h[2], `h${key}`)}</div>);
      continue;
    }

    if (/^([-*])\s+/.test(line)) {
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(line.replace(/^([-*])\s+/, ""));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }
    if (/^---+$/.test(line)) { flushList(); blocks.push(<hr key={`hr${key++}`} className="border-zinc-800 my-4" />); continue; }

    flushList();
    blocks.push(<p key={`p${key++}`} className="text-sm text-zinc-300 leading-relaxed my-2">{renderInline(line, `p${key}`)}</p>);
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
