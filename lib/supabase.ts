// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error("Missing SUPABASE_URL");
if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// Server-side Supabase client (full permissions)
export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
});
