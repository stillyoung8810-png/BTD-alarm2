import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        "[SupabaseClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Admin operations will fail.",
    );
}

// Create Supabase Admin Client (Service Role)
// This client bypasses RLS and can manage users.
export const supabaseAdmin = createClient(
    SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY || "",
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    },
);
