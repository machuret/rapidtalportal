/** Shared task-board types (extracted from TaskBoard so TaskDialog can import
 *  them without a circular dependency). */
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  client_id: string;
  assigned_to: string | null;
  created_by: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  order_index: number;
  due_date: string | null;
  priority: number;
  completed_at: string | null;
  category_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardMember { id: string; name: string }
