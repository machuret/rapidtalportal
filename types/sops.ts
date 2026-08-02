export interface Sop {
  id: string;
  client_id: string | null;
  title: string;
  category: string;
  subcategory?: string | null;
  visibility?: string;
  body: string;
  order_index: number;
  version?: number;
  forked_from?: string | null;
  forked_version?: number | null;
  created_at: string;
  updated_at: string;
}
