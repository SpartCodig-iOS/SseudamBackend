"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
// src/utils/supabaseClient.ts
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
exports.supabase = supabase;
if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[supabaseClient] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.');
}
else {
    exports.supabase = supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false, // 서버용이라 세션 저장 안 함
        },
    });
}
