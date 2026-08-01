"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * One memoized browser Supabase client per component instance.
 * `createClient()` returns a NEW client per call — used directly in a render
 * body or effect dep list, it tears down and reopens realtime channels on
 * every render (the Messages keystroke-websocket bug). Use this hook instead
 * of calling createClient() in components.
 */
export function useSupabase() {
  const [client] = useState(() => createClient());
  return client;
}
