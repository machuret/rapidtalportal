import type { Json } from "@/types/database";

export type NotebookActorRole = "va" | "client";

export interface NotebookPage {
  id: string;
  placement_id: string;
  parent_page_id: string | null;
  title: string;
  content: Json;
  sort_order: number;
  created_by: string | null;
  last_edited_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Sidebar-light shape (no content) for the tree. */
export interface NotebookPageMeta {
  id: string;
  parent_page_id: string | null;
  title: string;
  sort_order: number;
  is_archived: boolean;
  updated_at: string;
  last_edited_by: string | null;
}

export interface NotebookRevision {
  id: string;
  page_id: string;
  content: Json;
  title: string;
  edited_by: string | null;
  created_at: string;
}

export interface PlacementSummary {
  id: string;
  client_id: string;
  va_user_id: string;
  client_user_id: string;
  status: string;
  /** Display name for the *other* party, resolved for the viewer. */
  counterpartName: string;
  clientName: string | null;
}
