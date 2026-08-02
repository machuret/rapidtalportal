export interface CrmContact {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  source: string | null;
  tags: string[];
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
