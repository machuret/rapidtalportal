"use client";

import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/core";

/**
 * Lazy wrapper around the tiptap Editor. tiptap + ProseMirror (~15 packages) is
 * the heaviest client dependency in the app; importing Editor directly pulls all
 * of it into the /notebook route's first-load JS even before a page is opened.
 * Deferring it (mirrors DailyLogAnalyticsLazy) moves it to an async chunk fetched
 * only when an editor actually mounts. ssr:false because tiptap touches
 * window/document, and Editor already sets immediatelyRender:false.
 */
const Editor = dynamic(() => import("./Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="p-5 animate-pulse space-y-3">
      <div className="h-8 w-40 rounded bg-zinc-800" />
      <div className="h-4 w-full rounded bg-zinc-800" />
      <div className="h-4 w-5/6 rounded bg-zinc-800" />
    </div>
  ),
});

export function EditorLazy(props: {
  content: JSONContent;
  editable?: boolean;
  placementId?: string;
  pageId?: string;
  onChange?: (json: JSONContent) => void;
}) {
  return <Editor {...props} />;
}
