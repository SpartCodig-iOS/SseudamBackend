// src/utils/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: SupabaseClient | null = null;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    '[supabaseClient] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.',
  );
} else {
  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false, // 서버용이라 세션 저장 안 함
    },
  });
}

export { supabase };