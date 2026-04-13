import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AUTH_CLIENT_KEY =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_CLIENT_AUTH_OPTIONS = {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
} as const;

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
    SUPABASE_CLIENT_AUTH_OPTIONS,
);

/**
 * 사용자 세션 발급은 매 요청 새 클라이언트를 써야 한다.
 * service-role 싱글턴에서 signIn을 수행하면 후속 PostgREST 요청 Authorization이 사용자 JWT로 바뀔 수 있다.
 */
export function createSupabaseAuthClient() {
    return createClient(
        SUPABASE_URL || "",
        SUPABASE_AUTH_CLIENT_KEY || "",
        SUPABASE_CLIENT_AUTH_OPTIONS,
    );
}
