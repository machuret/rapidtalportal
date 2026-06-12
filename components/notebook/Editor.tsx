"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/api/routes";
import { toast } from "sonner";
import { notebookExtensions, emptyDoc } from "@/lib/notebook/editor-extensions";
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, List, ListOrdered,
  ListChecks, Link2, ImageIcon, Table as TableIcon, Code, Minus, Loader2,
} from "lucide-react";

interface EditorProps {
  content: JSONContent;
  editable?: boolean;
  placementId?: string;
  pageId?: string;
  onChange?: (json: JSONContent) => void;
}

function Btn({ on, active, disabled, title, children }: {
  on: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-md transition-colors shrink-0",
        active ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800",
        disabled && "opacity-40 cursor-not-allowed",
      )}>
      {children}
    </button>
  );
}

function Toolbar({ editor, placementId, pageId }: { editor: TiptapEditor; placementId?: string; pageId?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!placementId || !pageId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("placementId", placementId);
      fd.append("pageId", pageId);
      const res = await fetch(ROUTES.notebook.images(), { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      editor.chain().focus().setImage({ src: json.url }).run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-zinc-800 px-2 py-1.5 sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-4 h-4" /></Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></Btn>
      <span className="w-px h-5 bg-zinc-800 mx-1" />
      <Btn title="Bold" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></Btn>
      <span className="w-px h-5 bg-zinc-800 mx-1" />
      <Btn title="Bullet list" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></Btn>
      <Btn title="Ordered list" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></Btn>
      <Btn title="Task list" active={editor.isActive("taskList")} on={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="w-4 h-4" /></Btn>
      <span className="w-px h-5 bg-zinc-800 mx-1" />
      <Btn title="Link" active={editor.isActive("link")} on={setLink}><Link2 className="w-4 h-4" /></Btn>
      {placementId && pageId && (
        <Btn title="Image" disabled={uploading} on={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        </Btn>
      )}
      <Btn title="Insert table" on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-4 h-4" /></Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} on={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="w-4 h-4" /></Btn>
      <Btn title="Divider" on={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-4 h-4" /></Btn>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
    </div>
  );
}

export function Editor({ content, editable = true, placementId, pageId, onChange }: EditorProps) {
  // Guard against a missing/legacy empty document ({}).
  const safeContent = content && (content as { type?: string }).type ? content : emptyDoc;
  const editor = useEditor({
    extensions: notebookExtensions,
    content: safeContent,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "notebook-prose focus:outline-none px-5 py-4 min-h-[50vh]" } },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  }, [pageId]);

  // Keep read-only previews in sync when the previewed revision changes.
  useEffect(() => {
    if (editor && !editable) editor.commands.setContent(safeContent, false);
  }, [editor, editable, safeContent]);

  if (!editor) return <div className="px-5 py-4 text-sm text-zinc-500">Loading editor…</div>;

  return (
    <div className="flex flex-col">
      {editable && <Toolbar editor={editor} placementId={placementId} pageId={pageId} />}
      <EditorContent editor={editor} />
    </div>
  );
}
