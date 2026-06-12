import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

/**
 * The deliberately-bounded TipTap feature set for Notebook — "10% of Notion".
 * StarterKit already brings headings, bold/italic/strike, bullet & ordered
 * lists, code block and horizontal rule; we add links, images, task lists and
 * tables. No databases, nested blocks, kanban, or embeds. Shared by the live
 * editor and the read-only revision preview so both render identically.
 */
export const notebookExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
  Image.configure({ inline: false, allowBase64: false }),
  TaskList,
  TaskItem.configure({ nested: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
];

/** Empty document used for brand-new pages. */
export const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
